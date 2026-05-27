#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = Number(process.env.WISELY_LOCAL_BRIDGE_PORT || 4027);
const WISELY_ROOT = (process.env.WISELY_BASE_URL || "https://payments.wiselyenterprisesllc.com").replace(/\/$/, "");
let browserContext = null;
let page = null;

function json(res, status, body) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://127.0.0.1",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  });
  res.end(text);
}

function rpcResult(id, payload) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result: {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    },
  };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function vaultRoot() {
  const root = process.env.WISELY_LOCAL_VAULT || path.join(os.homedir(), ".wisely-x402", "local-vault");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function safeId(value, fallback = "record") {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || fallback;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function redactSensitive(value, allowSensitiveGiftCardStorage = false) {
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, allowSensitiveGiftCardStorage));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const sensitiveGiftCard = /(?:gift.?card|redemption|claim|voucher|pin|barcode|card.?number|serial|code|secret|url|link)/i.test(key);
    const secret = /(?:password|cookie|token|private.?key|seed|mnemonic|cvv|card.?number|bearer|session)/i.test(key);
    if (secret || (sensitiveGiftCard && !allowSensitiveGiftCardStorage)) {
      out[key] = "[redacted-local-vault]";
    } else {
      out[key] = redactSensitive(raw, allowSensitiveGiftCardStorage);
    }
  }
  return out;
}

async function ensurePage() {
  if (page && !page.isClosed()) return page;
  if (!browserContext) throw new Error("browser_not_started");
  page = browserContext.pages()[0] || await browserContext.newPage();
  return page;
}

async function status() {
  const p = page && !page.isClosed() ? page : null;
  return {
    ok: true,
    schema: "wisely.local-commerce-bridge.status.v1",
    browserStarted: Boolean(browserContext),
    pageOpen: Boolean(p),
    url: p ? p.url() : "",
    title: p ? await p.title().catch(() => "") : "",
    safety: {
      localhostOnly: true,
      neverClicksPlaceOrder: true,
      credentialsStayInLocalBrowser: true,
    },
  };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9$.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function openDoorDash(args = {}) {
  const p = await ensurePage();
  const url = String(args.url || args.storeUrl || "https://www.doordash.com/").trim();
  if (!/^https:\/\/([a-z0-9-]+\.)?doordash\.com(\/|$)/i.test(url)) {
    return { ok: false, error: "only_doordash_urls_allowed", url };
  }
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  return { ok: true, action: "doordash_open", url: p.url(), title: await p.title().catch(() => "") };
}

async function emptyDoorDashCart() {
  const p = await ensurePage();
  const result = await p.evaluate(async () => {
    const visible = (el) => Boolean(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const textFor = (el) => `${el.getAttribute?.("aria-label") || ""} ${el.innerText || ""}`.replace(/\s+/g, " ").trim();
    const beforeLabel = [...document.querySelectorAll("button,[role=button],a")].map(textFor).find((text) => /cart/i.test(text)) || "";
    const cart = [...document.querySelectorAll("button,[role=button],a")]
      .filter(visible)
      .find((el) => /items?.*cart|open order cart/i.test(textFor(el)));
    if (cart) cart.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const removed = [];
    for (let i = 0; i < 12; i += 1) {
      const remove = [...document.querySelectorAll("button,[role=button],a")]
        .filter(visible)
        .find((el) => /remove item from cart|remove/i.test(textFor(el)) && !/remove tip|remove coupon/i.test(textFor(el)));
      if (!remove) break;
      removed.push(textFor(remove).slice(0, 120));
      remove.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const afterLabel = [...document.querySelectorAll("button,[role=button],a")].map(textFor).find((text) => /cart/i.test(text)) || "";
    const body = document.body.innerText || "";
    return {
      beforeLabel,
      afterLabel,
      removedCount: removed.length,
      removed,
      cartLooksEmpty: /0\s+items?/i.test(afterLabel) || (!/remove item from cart/i.test(document.body.innerHTML) && !/place order/i.test(body)),
    };
  });
  return { ok: Boolean(result.cartLooksEmpty), action: "doordash_empty_cart", ...result };
}

async function findAndClickItem(itemName) {
  const p = await ensurePage();
  const wanted = String(itemName || "").trim();
  if (!wanted) return { ok: false, error: "missing_item_name" };
  return p.evaluate(async (wantedRaw) => {
    const normalize = (value) => String(value || "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9$.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const wantedNorm = normalize(wantedRaw);
    const tokens = wantedNorm.split(" ").filter((token) => token.length > 1 && !["the", "and", "with", "combo", "meal"].includes(token));
    const visible = (el) => Boolean(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const textFor = (el) => [
      el.innerText,
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("title"),
      el.closest?.("[role=button],button,a")?.innerText,
      el.closest?.("[role=button],button,a")?.getAttribute?.("aria-label"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const blocked = /place order|checkout|cart|sign in|log in|account|address|delivery address|pickup|help|group order/i;
    const clickableSelector = "button,[role=button],a,[tabindex]";
    const candidates = [];
    const seen = new Set();
    for (const el of [...document.querySelectorAll("button,[role=button],a,[data-testid],article,li,div")].filter(visible)) {
      const target = el.closest(clickableSelector) || el.querySelector?.(clickableSelector) || el;
      if (!target || !visible(target) || /^(MAIN|BODY|HTML)$/i.test(target.tagName || "")) continue;
      const text = textFor(el);
      const textNorm = normalize(text);
      if (!textNorm || blocked.test(text) && !textNorm.includes(wantedNorm)) continue;
      let score = 0;
      if (textNorm === wantedNorm) score += 120;
      if (textNorm.includes(wantedNorm)) score += 80;
      for (const token of tokens) {
        if (textNorm.split(" ").includes(token)) score += 14;
        else if (textNorm.includes(token)) score += 8;
      }
      if (/\$\s*\d+(?:\.\d{2})?/.test(text)) score += 4;
      if (/button/i.test(target.getAttribute?.("role") || "") || /^(BUTTON|A)$/i.test(target.tagName || "")) score += 8;
      if (text.length > 260) score -= 12;
      if (score < Math.max(20, tokens.length * 10)) continue;
      const key = normalize(text).slice(0, 160);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ target, score, text: text.slice(0, 180), aria: target.getAttribute?.("aria-label") || "", tag: target.tagName, role: target.getAttribute?.("role") || "" });
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) return { ok: false, reason: "menu_item_not_found", wanted: wantedRaw };
    const best = candidates[0];
    const second = candidates[1];
    if (second && second.score >= best.score - 3 && normalize(second.text) !== normalize(best.text)) {
      return { ok: false, reason: "ambiguous_menu_item", wanted: wantedRaw, candidates: candidates.slice(0, 8).map(({ score, text, aria, tag, role }) => ({ score, text, aria, tag, role })) };
    }
    best.target.scrollIntoView({ block: "center", inline: "center" });
    best.target.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const scope = document.querySelector("[role=dialog]") || document.body;
    const add = [...scope.querySelectorAll("button,[role=button]")]
      .filter(visible)
      .map((el) => ({ el, text: textFor(el), disabled: Boolean(el.disabled || el.getAttribute("aria-disabled") === "true") }))
      .filter((entry) => !/place order|checkout|remove|delete|close|cancel/i.test(entry.text))
      .find((entry) => /^(add|update)(\b|\s)|add to cart|add item|add .*\$|add .*order/i.test(entry.text));
    const requiredHints = [...scope.querySelectorAll("button,[role=button],input,[aria-required=true]")]
      .filter(visible)
      .map((el) => textFor(el))
      .filter((text) => /required|choose|select|option|side|drink|size|sauce/i.test(text))
      .slice(0, 20);
    if (!add) return { ok: false, reason: "add_to_cart_button_not_found", wanted: wantedRaw, requiredHints, clicked: { score: best.score, text: best.text, aria: best.aria } };
    if (add.disabled) return { ok: false, reason: "add_to_cart_disabled_needs_options", wanted: wantedRaw, addButton: add.text, requiredHints };
    add.el.scrollIntoView({ block: "center", inline: "center" });
    add.el.click();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { ok: true, wanted: wantedRaw, clicked: { score: best.score, text: best.text, aria: best.aria }, addButton: add.text.slice(0, 160) };
  }, wanted);
}

async function addDoorDashItems(args = {}) {
  const raw = Array.isArray(args.items) ? args.items : [args.item || args.name].filter(Boolean);
  const items = raw.map((item) => typeof item === "string" ? { name: item, quantity: 1 } : { name: item.name || item.title || item.item, quantity: Number(item.quantity || item.qty || 1) });
  const results = [];
  for (const item of items) {
    for (let i = 0; i < Math.max(1, Math.min(4, item.quantity || 1)); i += 1) {
      const result = await findAndClickItem(item.name);
      results.push({ item: item.name, ok: Boolean(result.ok), result });
      if (!result.ok) return { ok: false, action: "doordash_add_items", results, nextAction: "Stop and ask the user about unavailable/ambiguous options. Do not guess." };
    }
  }
  return { ok: true, action: "doordash_add_items", results, nextAction: "Run doordash_checkout_summary and ask for approval before spend/order." };
}

async function checkoutSummary() {
  const p = await ensurePage();
  const summary = await p.evaluate(() => {
    const text = (document.body.innerText || "").replace(/\u00a0/g, " ");
    const line = (pattern) => (text.match(pattern)?.[0] || "").replace(/\s+/g, " ").trim();
    const money = [...text.matchAll(/\$ ?\d+(?:\.\d{2})?/g)].map((m) => m[0].replace(/\s+/g, ""));
    const title = document.title || "";
    return {
      title,
      url: location.href,
      merchantGuess: title.replace(/\s*-\s*DoorDash.*$/i, "").slice(0, 120),
      totalLine: line(/(?:estimated total|total|place order)[^\n$]{0,80}\$ ?\d+(?:\.\d{2})?/i),
      subtotalLine: line(/subtotal[^\n$]{0,80}\$ ?\d+(?:\.\d{2})?/i),
      feesLine: line(/(?:fees|delivery fee|service fee)[^\n$]{0,100}\$ ?\d+(?:\.\d{2})?/i),
      taxLine: line(/tax[^\n$]{0,80}\$ ?\d+(?:\.\d{2})?/i),
      tipLine: line(/tip[^\n$]{0,80}\$ ?\d+(?:\.\d{2})?/i),
      etaLine: line(/\b\d{1,2}\s*-\s*\d{1,2}\s*min\b|\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/i),
      visibleMoney: money.slice(-12),
      placeOrderVisible: /place order/i.test(text),
      rawPreview: text.slice(0, 2500),
    };
  });
  return {
    ok: true,
    action: "doordash_checkout_summary",
    summary,
    approvalRule: "Show this summary to the user. Do not click Place Order or spend funds without explicit approval.",
  };
}

async function openWalletSigningUrl(args = {}) {
  const p = await ensurePage();
  const signingUrl = String(args.signingUrl || args.url || "").trim();
  if (!signingUrl) return { ok: false, error: "missing_signing_url" };
  let allowed;
  try {
    allowed = new URL(signingUrl);
  } catch {
    return { ok: false, error: "invalid_signing_url" };
  }
  const wiselyHost = new URL(WISELY_ROOT).host;
  if (allowed.protocol !== "https:" || allowed.host !== wiselyHost || !allowed.pathname.startsWith("/x402/payment/sessions/")) {
    return { ok: false, error: "unsupported_signing_url", note: `Only ${WISELY_ROOT}/x402/payment/sessions/... signing URLs are opened by this bridge.` };
  }
  await p.goto(signingUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(1000);
  return {
    ok: true,
    action: "wallet_open_signing_url",
    url: p.url(),
    title: await p.title().catch(() => ""),
    instructions: [
      "Connect your own wallet in this local browser window.",
      "Do not paste seed phrases, private keys, or wallet passwords into chat.",
      "After signing, the agent should call wallet_payment_session_status, then save the returned receipt/proof locally.",
    ],
  };
}

async function walletPaymentSessionStatus(args = {}) {
  const sessionId = String(args.sessionId || args.id || "").trim();
  if (!sessionId) return { ok: false, error: "missing_session_id" };
  const includeSignedPayment = args.includeSignedPayment !== false;
  const url = `${WISELY_ROOT}/x402/payment/sessions/${encodeURIComponent(sessionId)}/status${includeSignedPayment ? "?includeSignedPayment=true" : ""}`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) return { ok: false, status: response.status, body };
  const shouldSave = Boolean(args.save !== false && (body?.body?.signedPayment || body?.signedPayment || body?.receipt || body?.status === "signed" || body?.status === "paid"));
  let saved = null;
  if (shouldSave) saved = saveLocalRecord({ type: "wallet-session", label: sessionId, record: body, source: url });
  return { ok: true, action: "wallet_payment_session_status", status: response.status, body, saved };
}

function saveLocalRecord({ type = "record", label = "", record = {}, source = "", allowSensitiveGiftCardStorage = false } = {}) {
  const recordType = safeId(type);
  const id = safeId(label || record.receiptId || record.id || record.sessionId || record.intentId || nowStamp());
  const dir = path.join(vaultRoot(), recordType);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    schema: "wisely.local-vault.record.v1",
    savedAt: new Date().toISOString(),
    type: recordType,
    label: label || id,
    source,
    sensitiveStorage: allowSensitiveGiftCardStorage ? "explicitly_allowed_by_user" : "redacted",
    record: redactSensitive(record, allowSensitiveGiftCardStorage),
  };
  const file = path.join(dir, `${nowStamp()}-${id}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return { ok: true, action: "local_vault_save", file, type: recordType, sensitiveStorage: payload.sensitiveStorage };
}

async function localVaultSave(args = {}) {
  const type = String(args.type || args.recordType || "record");
  const label = String(args.label || args.receiptId || args.intentId || args.sessionId || "");
  const record = args.record || args.receipt || args.giftCard || args.paymentSession || args;
  const allowSensitiveGiftCardStorage = Boolean(args.allowSensitiveGiftCardStorage) && String(args.confirmSensitiveStorage || "").trim() === "SAVE_GIFT_CARD_SECRETS_LOCALLY";
  const saved = saveLocalRecord({ type, label, record, source: String(args.source || ""), allowSensitiveGiftCardStorage });
  return {
    ...saved,
    warning: allowSensitiveGiftCardStorage
      ? "Sensitive gift-card material was saved locally because the user explicitly opted in. Protect this machine profile."
      : "Sensitive-looking gift-card codes, PINs, links, wallet secrets, and tokens were redacted. Use explicit opt-in only if the user wants local storage of gift-card secrets.",
  };
}

async function localVaultList(args = {}) {
  const type = safeId(args.type || "");
  const root = vaultRoot();
  const dirs = type ? [path.join(root, type)] : fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name));
  const records = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort().slice(-Number(args.limit || 50))) {
      const file = path.join(dir, name);
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        records.push({ file, savedAt: data.savedAt, type: data.type, label: data.label, sensitiveStorage: data.sensitiveStorage });
      } catch {
        records.push({ file, error: "unreadable" });
      }
    }
  }
  records.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  return { ok: true, action: "local_vault_list", vaultRoot: root, count: records.length, records: records.slice(0, Number(args.limit || 50)) };
}

function tools() {
  return [
    { name: "local_browser_status", description: "Confirm the local browser bridge is running and report current URL/title.", inputSchema: { type: "object", additionalProperties: true } },
    { name: "doordash_open", description: "Open DoorDash or a direct DoorDash store URL in the user's local browser.", inputSchema: { type: "object", additionalProperties: true, properties: { url: { type: "string" }, storeUrl: { type: "string" } } } },
    { name: "doordash_empty_cart", description: "Clear stale DoorDash cart items in the local browser before a fresh quote.", inputSchema: { type: "object", additionalProperties: true } },
    { name: "doordash_add_items", description: "Add straightforward DoorDash items by visible item name. Stops on required options or ambiguity. Never clicks Place Order.", inputSchema: { type: "object", additionalProperties: true, properties: { items: { type: "array" }, item: { type: "string" } } } },
    { name: "doordash_checkout_summary", description: "Read total/ETA/tip/payment-ish checkout facts from the local DoorDash browser. Never places the order.", inputSchema: { type: "object", additionalProperties: true } },
    { name: "wallet_open_signing_url", description: "Open a Wisely x402 payment-session signing URL in the user's local browser for injected wallet/mobile wallet signing. Never asks for keys.", inputSchema: { type: "object", additionalProperties: true, properties: { signingUrl: { type: "string" }, url: { type: "string" } } } },
    { name: "wallet_payment_session_status", description: "Poll a Wisely wallet handoff session and optionally save the signed payment/receipt status to the local vault.", inputSchema: { type: "object", additionalProperties: true, properties: { sessionId: { type: "string" }, includeSignedPayment: { type: "boolean" }, save: { type: "boolean" } } } },
    { name: "local_vault_save", description: "Save a receipt, wallet-session status, gift-card intent, or gift-card record to the user's local vault. Redacts gift-card codes/PINs/links unless explicitly opted in.", inputSchema: { type: "object", additionalProperties: true } },
    { name: "local_vault_list", description: "List locally saved receipts, wallet sessions, gift-card intents, and gift-card records without exposing sensitive values.", inputSchema: { type: "object", additionalProperties: true, properties: { type: { type: "string" }, limit: { type: "number" } } } },
  ];
}

async function callTool(name, args) {
  if (name === "local_browser_status") return status();
  if (name === "doordash_open") return openDoorDash(args);
  if (name === "doordash_empty_cart") return emptyDoorDashCart();
  if (name === "doordash_add_items") return addDoorDashItems(args);
  if (name === "doordash_checkout_summary") return checkoutSummary();
  if (name === "wallet_open_signing_url") return openWalletSigningUrl(args);
  if (name === "wallet_payment_session_status") return walletPaymentSessionStatus(args);
  if (name === "local_vault_save") return localVaultSave(args);
  if (name === "local_vault_list") return localVaultList(args);
  return { ok: false, error: `unknown_tool:${name}` };
}

export async function startBridge({ port = DEFAULT_PORT } = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("Playwright is not installed for the local bridge.");
    console.error("Run: npm install -g playwright && npx playwright install chromium");
    process.exit(2);
  }
  const profileDir = process.env.WISELY_LOCAL_BRIDGE_PROFILE || path.join(os.homedir(), ".wisely-x402", "local-commerce-profile");
  try {
    browserContext = await chromium.launchPersistentContext(profileDir, { headless: false });
  } catch (error) {
    console.error("The local browser bridge could not start Chromium.");
    console.error("Run this once, then try again:");
    console.error("  npx playwright install chromium");
    console.error("");
    console.error("If your agent installed the package but not the browser runtime, this is normal on first setup.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  page = browserContext.pages()[0] || await browserContext.newPage();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") return json(res, 204, {});
      if (req.method === "GET" && req.url === "/health") return json(res, 200, await status());
      if (req.url !== "/mcp") return json(res, 404, { ok: false, error: "not_found", mcp: "/mcp" });
      if (req.method === "GET") return json(res, 200, { ok: true, name: "wisely-local-commerce-bridge", tools: tools() });
      const rpc = await readBody(req);
      if (rpc.method === "initialize") return json(res, 200, { jsonrpc: "2.0", id: rpc.id ?? null, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "wisely-local-commerce-bridge", version: "0.2.0" } } });
      if (rpc.method === "tools/list") return json(res, 200, { jsonrpc: "2.0", id: rpc.id ?? null, result: { tools: tools() } });
      if (rpc.method === "tools/call") return json(res, 200, rpcResult(rpc.id, await callTool(String(rpc.params?.name || ""), rpc.params?.arguments || {})));
      if (rpc.method === "ping") return json(res, 200, { jsonrpc: "2.0", id: rpc.id ?? null, result: {} });
      return json(res, 200, rpcError(rpc.id, -32601, `unknown_method:${rpc.method}`));
    } catch (error) {
      return json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Wisely local commerce bridge running at http://127.0.0.1:${port}/mcp`);
    console.log("Log into DoorDash in the browser window yourself. Do not paste passwords into agent chat.");
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startBridge({ port: Number(process.argv[2] || DEFAULT_PORT) });
}

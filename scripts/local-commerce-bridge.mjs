#!/usr/bin/env node

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PORT = Number(process.env.WISELY_LOCAL_BRIDGE_PORT || 4027);
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

function tools() {
  return [
    { name: "local_browser_status", description: "Confirm the local browser bridge is running and report current URL/title.", inputSchema: { type: "object", additionalProperties: true } },
    { name: "doordash_open", description: "Open DoorDash or a direct DoorDash store URL in the user's local browser.", inputSchema: { type: "object", additionalProperties: true, properties: { url: { type: "string" }, storeUrl: { type: "string" } } } },
    { name: "doordash_empty_cart", description: "Clear stale DoorDash cart items in the local browser before a fresh quote.", inputSchema: { type: "object", additionalProperties: true } },
    { name: "doordash_add_items", description: "Add straightforward DoorDash items by visible item name. Stops on required options or ambiguity. Never clicks Place Order.", inputSchema: { type: "object", additionalProperties: true, properties: { items: { type: "array" }, item: { type: "string" } } } },
    { name: "doordash_checkout_summary", description: "Read total/ETA/tip/payment-ish checkout facts from the local DoorDash browser. Never places the order.", inputSchema: { type: "object", additionalProperties: true } },
  ];
}

async function callTool(name, args) {
  if (name === "local_browser_status") return status();
  if (name === "doordash_open") return openDoorDash(args);
  if (name === "doordash_empty_cart") return emptyDoorDashCart();
  if (name === "doordash_add_items") return addDoorDashItems(args);
  if (name === "doordash_checkout_summary") return checkoutSummary();
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
      if (rpc.method === "initialize") return json(res, 200, { jsonrpc: "2.0", id: rpc.id ?? null, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "wisely-local-commerce-bridge", version: "0.1.0" } } });
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

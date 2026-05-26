#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootBaseUrl = (
  process.env.WISELY_BASE_URL ||
  process.env.X402_AGENT_PAYMENT_INFRASTRUCTURE_ROOT_URL ||
  "https://payments.wiselyenterprisesllc.com"
).replace(/\/$/, "");

const aiBaseUrl = (
  process.env.X402_AGENT_PAYMENT_INFRASTRUCTURE_URL ||
  process.env.X402_AGENT_SPEND_ROUTER_URL ||
  process.env.WISELY_AI_ROUTER_URL ||
  `${rootBaseUrl}/ai`
).replace(/\/$/, "");

const builderKeyFile = process.env.WISELY_BUILDER_KEY_FILE || path.join(os.homedir(), ".wisely-x402", "builder-key");
const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const creatorLanesPath = path.join(packageRoot, "examples", "creator-imports", "creator-lanes.json");

function readStoredBuilderKey() {
  try {
    return fs.readFileSync(builderKeyFile, "utf8").trim();
  } catch {
    return "";
  }
}

function builderKey() {
  return process.env.WISELY_BUILDER_KEY || readStoredBuilderKey();
}

function developerKey() {
  return process.env.WISELY_DEVELOPER_KEY || process.env.X402_DEVELOPER_KEY || "";
}

function adminToken() {
  return process.env.WISELY_ADMIN_TOKEN || "";
}

function compact(value) {
  return JSON.stringify(value, null, 2);
}

async function readJson(response) {
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok && response.status !== 402) {
    throw new Error(`http_${response.status}:${typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500)}`);
  }
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
}

function authHeaders(extra = {}) {
  const headers = { accept: "application/json", ...extra };
  const dev = developerKey();
  const builder = builderKey();
  const admin = adminToken();
  if (dev) headers["X-Developer-Key"] = dev;
  if (builder) headers["X-Builder-Key"] = builder;
  if (admin) headers["X-Admin-Token"] = admin;
  return headers;
}

async function requestJson(method, url, body, headers = {}) {
  const response = await fetch(url, {
    method,
    headers: authHeaders(body === undefined ? headers : { "content-type": "application/json", ...headers }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJson(response);
}

function readJsonFile(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function readCreatorLanesRegistry() {
  const registry = readJsonFile(creatorLanesPath);
  const lanes = registry.lanes || [];
  return {
    ...registry,
    lanes: lanes.map((lane) => ({
      ...lane,
      samplePath: path.join(packageRoot, "examples", "creator-imports", lane.sampleFile),
      previewCommand: `wisely-x402 creator preview-lane ${lane.id} examples/creator-imports/${lane.sampleFile} my-creator`,
      publishCommand: `wisely-x402 creator publish-lane ${lane.id} examples/creator-imports/${lane.sampleFile} my-creator`,
    })),
  };
}

function getCreatorLaneConfig(laneId = "") {
  const registry = readCreatorLanesRegistry();
  const wanted = String(laneId || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (!wanted) return null;
  return registry.lanes.find((lane) => {
    const aliases = [lane.id, ...(lane.aliases || [])].map((item) => String(item).toLowerCase().replace(/[-\s]+/g, "_"));
    return aliases.includes(wanted);
  }) || null;
}

function inferCreatorLaneFromFile(file) {
  const base = path.basename(file).toLowerCase();
  const registry = readCreatorLanesRegistry();
  return registry.lanes.find((lane) => {
    if (base === lane.sampleFile.toLowerCase()) return true;
    return [lane.id, ...(lane.aliases || [])].some((alias) => base.includes(String(alias).toLowerCase().replace(/_/g, "-")));
  }) || null;
}

export function listCreatorLanes() {
  const registry = readCreatorLanesRegistry();
  return {
    status: 200,
    body: {
      schema: registry.schema,
      normalizedFields: registry.normalizedFields,
      laneCount: registry.lanes.length,
      lanes: registry.lanes.map((lane) => ({
        id: lane.id,
        label: lane.label,
        status: lane.status,
        contentType: lane.contentType,
        defaultEntitlement: lane.defaultEntitlement,
        sampleFile: lane.sampleFile,
        acceptedInputs: lane.acceptedInputs,
        doNotCollect: lane.doNotCollect,
        previewCommand: lane.previewCommand,
      })),
    },
  };
}

export function getCreatorLane(laneId) {
  const lane = getCreatorLaneConfig(laneId);
  if (!lane) throw new Error(`unknown_creator_lane:${laneId}`);
  return { status: 200, body: lane };
}

export function creatorLaneTemplate(laneId) {
  const lane = getCreatorLaneConfig(laneId);
  if (!lane) throw new Error(`unknown_creator_lane:${laneId}`);
  const content = fs.readFileSync(lane.samplePath, "utf8");
  return {
    status: 200,
    body: {
      lane: {
        id: lane.id,
        label: lane.label,
        contentType: lane.contentType,
        sampleFile: lane.sampleFile,
        samplePath: lane.samplePath,
      },
      content,
      previewCommand: lane.previewCommand,
      publishCommand: lane.publishCommand,
      safetyNote: "Use exported, pasted, or creator-approved content only. Do not collect platform passwords, private tokens, raw payment data, or member/student private data.",
    },
  };
}

export async function getManifest() {
  return requestJson("GET", `${aiBaseUrl}/manifest`);
}

export async function getInstallProfile() {
  return requestJson("GET", `${aiBaseUrl}/install-profile`);
}

export async function getRailStatus() {
  return requestJson("GET", `${rootBaseUrl}/x402/rails/status`);
}

export async function getRailReadiness(rail = "base") {
  return requestJson("GET", `${rootBaseUrl}/x402/rails/${encodeURIComponent(rail)}/readiness`);
}

export async function getProofCache() {
  return requestJson("GET", `${rootBaseUrl}/x402/proofs/cache`);
}

export async function getFacilitatorStatus() {
  return requestJson("GET", `${rootBaseUrl}/x402/facilitator/status`);
}

export async function getSecuritySummary() {
  return requestJson("GET", `${rootBaseUrl}/x402/facilitator/security`);
}

export async function getIntegrationStatus() {
  return requestJson("GET", `${rootBaseUrl}/x402/integration/status`);
}

export async function getConversionAssets() {
  return requestJson("GET", `${rootBaseUrl}/x402/conversion/assets`);
}

export async function getConversionRoutesStatus() {
  return requestJson("GET", `${rootBaseUrl}/x402/conversion/routes/status`);
}

export async function doctor() {
  const checks = [
    ["health", `${rootBaseUrl}/health`],
    ["aiManifest", `${aiBaseUrl}/manifest`],
    ["serverJson", `${rootBaseUrl}/server.json`],
    ["wellKnownMcp", `${rootBaseUrl}/.well-known/mcp.json`],
    ["wellKnownX402", `${rootBaseUrl}/.well-known/x402.json`],
    ["wellKnownSkill", `${rootBaseUrl}/.well-known/wisely-x402-skill.json`],
    ["mcpManifest", `${aiBaseUrl}/mcp/manifest`],
    ["installProfile", `${aiBaseUrl}/install-profile`],
    ["railStatus", `${rootBaseUrl}/x402/rails/status`],
    ["proofCache", `${rootBaseUrl}/x402/proofs/cache`],
    ["facilitatorStatus", `${rootBaseUrl}/x402/facilitator/status`],
    ["conversionAssets", `${rootBaseUrl}/x402/conversion/assets`],
  ];
  const results = [];
  for (const [name, url] of checks) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json" } });
      const text = await response.text();
      results.push({ name, url, ok: response.ok, status: response.status, bytes: text.length });
    } catch (error) {
      results.push({ name, url, ok: false, error: String(error.message || error).slice(0, 300) });
    }
  }
  return { status: 200, body: { ok: results.every((item) => item.ok), rootBaseUrl, aiBaseUrl, results } };
}

export async function listServices() {
  const manifest = await getManifest();
  const services = manifest.body?.services || [];
  return {
    status: manifest.status,
    body: {
      serviceCount: services.length,
      liveStatus: manifest.body?.liveStatus,
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        family: service.family,
        method: service.method,
        hostedPriceUsd: service.hostedPriceUsd,
        hostedInvokeAllowed: service.hostedInvokeAllowed,
        requiresStreamingForHostedInvoke: service.requiresStreamingForHostedInvoke,
        deprecated: service.deprecated,
        hostedBlocker: service.hostedBlocker,
      })),
    },
  };
}

export async function mcpTools() {
  return requestJson("POST", `${aiBaseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: "tools-list",
    method: "tools/list",
    params: {},
  });
}

export async function callMcpTool(name, args = {}) {
  return requestJson("POST", `${aiBaseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: `call-${name}`,
    method: "tools/call",
    params: { name, arguments: args },
  });
}

export async function quoteCryptoAiService({ serviceId, fromAsset, fromNetwork, amountUsd, userVenue = "" }) {
  return requestJson("POST", `${aiBaseUrl}/quote`, { serviceId, fromAsset, fromNetwork, amountUsd, userVenue });
}

export async function quoteConversionToSettlement({ serviceId, fromAsset, fromNetwork, fromAddress, toAddress, fromTokenAddress = "", fromDecimals, includeTransactionData = false }) {
  const wantsExecutableTransaction = Boolean(includeTransactionData && fromAddress && toAddress);
  return requestJson("POST", `${aiBaseUrl}/conversion/quote`, {
    serviceId,
    fromAsset,
    fromNetwork,
    fromAddress,
    toAddress,
    fromTokenAddress,
    fromDecimals,
    includeTransactionData: wantsExecutableTransaction,
  });
}

export async function quoteExternalX402Seller({
  fromAsset,
  fromNetwork,
  amountUsd,
  paymentRequirement,
  resource = "external-x402-seller",
  userVenue = "",
  sellerUrl = "",
  sellerMethod = "GET",
  sellerBody,
}) {
  return requestJson("POST", `${rootBaseUrl}/x402/quote`, {
    fromAsset,
    fromNetwork,
    amountUsd,
    userVenue,
    resource,
    paymentRequirement,
    sellerUrl,
    sellerMethod,
    sellerBody,
  });
}

export async function getRyeCommerceHandoff() {
  return requestJson("GET", `${rootBaseUrl}/x402/commerce/rye`);
}

export async function buildRyeCommerceQuoteRequest(body = {}) {
  return requestJson("POST", `${rootBaseUrl}/x402/commerce/rye`, body);
}

export async function getGiftCardCommerceStatus() {
  return requestJson("GET", `${rootBaseUrl}/x402/commerce/gift-card`);
}

export async function quoteGiftCardCommerce(body = {}) {
  return requestJson("POST", `${rootBaseUrl}/x402/commerce/gift-card/quote`, body);
}

export async function discoverGiftCardCommerceOptions({ category = "food", country = "US", limit = 6 } = {}) {
  return requestJson("POST", `${rootBaseUrl}/x402/commerce/gift-card/discover`, { category, country, limit });
}

export async function quoteBitrefillMerchantGiftCardCommerce(body = {}) {
  return requestJson("POST", `${rootBaseUrl}/x402/commerce/gift-card/merchant/quote`, body);
}

export async function createGiftCardCommerceIntent(body = {}) {
  return requestJson("POST", `${rootBaseUrl}/x402/commerce/gift-card/intents`, body);
}

export async function giftCardIntentStatus(intentId) {
  return requestJson("GET", `${rootBaseUrl}/x402/commerce/gift-card/intents/${encodeURIComponent(intentId)}`);
}

export async function searchBitrefillGiftCards({ q = "doordash", country = "US" } = {}) {
  return requestJson("POST", `${rootBaseUrl}/x402/commerce/gift-card/providers/bitrefill/search`, { q, country });
}

export async function quoteServiceMatrix({ fromAsset, fromNetwork, amountUsd }) {
  const manifest = await getManifest();
  const services = (manifest.body?.services || []).filter((service) => service.hostedInvokeAllowed);
  const results = [];
  for (const service of services) {
    try {
      const quote = await quoteCryptoAiService({
        serviceId: service.id,
        fromAsset,
        fromNetwork,
        amountUsd: amountUsd || service.hostedPriceUsd || 0.1,
      });
      results.push({
        serviceId: service.id,
        status: quote.status,
        ok: quote.body?.ok,
        selectedRoute: quote.body?.quote?.selectedRoute?.id,
        servicePriceUsd: quote.body?.quote?.servicePriceUsd,
        estimatedRouteCostUsd: quote.body?.quote?.selectedRoute?.estimatedRouteCostUsd,
        estimatedTotalDebitUsd: quote.body?.quote?.selectedRoute?.estimatedTotalDebitUsd,
      });
    } catch (error) {
      results.push({ serviceId: service.id, ok: false, error: String(error.message || error).slice(0, 300) });
    }
  }
  return { status: 200, body: { fromAsset, fromNetwork, quotedServices: results.length, results } };
}

export async function invokeCryptoAiService({ serviceId, input, xPayment = "" }) {
  const headers = xPayment ? { "X-PAYMENT": xPayment } : {};
  return requestJson("POST", `${aiBaseUrl}/invoke`, { serviceId, input }, headers);
}

export async function invokeCryptoAiServiceStream({ serviceId, input, xPayment = "" }) {
  const headers = authHeaders({ accept: "text/event-stream", "content-type": "application/json" });
  if (xPayment) headers["X-PAYMENT"] = xPayment;
  const response = await fetch(`${aiBaseUrl}/invoke?stream=1`, {
    method: "POST",
    headers,
    body: JSON.stringify({ serviceId, input }),
  });
  if (!response.body) throw new Error("stream_body_missing");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    process.stdout.write(decoder.decode(value, { stream: true }));
  }
  process.stdout.write(decoder.decode());
}

export async function builderStatus() {
  return requestJson("GET", `${aiBaseUrl}/builders/status`);
}

export async function builderRevenue({ endpointSlug = "", since = "30d", limit = "" } = {}) {
  const params = new URLSearchParams({ since });
  if (endpointSlug) params.set("endpointSlug", endpointSlug);
  if (limit) params.set("limit", String(limit));
  return requestJson("GET", `${aiBaseUrl}/builders/revenue?${params.toString()}`);
}

export async function builderEvents({ endpointSlug = "", since = "7d", type = "", receiptId = "", limit = "" } = {}) {
  const params = new URLSearchParams({ since });
  if (endpointSlug) params.set("endpointSlug", endpointSlug);
  if (type) params.set("type", type);
  if (receiptId) params.set("receiptId", receiptId);
  if (limit) params.set("limit", String(limit));
  return requestJson("GET", `${aiBaseUrl}/builders/events?${params.toString()}`);
}

export async function listEndpoints() {
  return requestJson("GET", `${aiBaseUrl}/endpoints`);
}

export async function listCreatorCatalogs() {
  return requestJson("GET", `${aiBaseUrl}/creator-catalogs`);
}

export async function creatorCatalogInstall(creatorId = "demo-sales-framework") {
  return requestJson("GET", `${aiBaseUrl}/creator-catalogs/${encodeURIComponent(creatorId)}/install`);
}

export async function searchCreatorCatalog({ creatorId = "demo-sales-framework", query = "", limit = 5, tags = [] } = {}) {
  return requestJson("POST", `${aiBaseUrl}/creator-catalogs/${encodeURIComponent(creatorId)}/search`, { query, limit, tags });
}

export async function recommendCreatorCatalog({ creatorId = "demo-sales-framework", situation = "", goal = "", audience = "", constraints = [], entitlement = "" } = {}) {
  return requestJson("POST", `${aiBaseUrl}/creator-catalogs/${encodeURIComponent(creatorId)}/recommend`, {
    situation,
    goal,
    audience,
    constraints,
    entitlement,
  });
}

export async function fetchCreatorCatalogItem({ creatorId = "demo-sales-framework", itemId = "" } = {}) {
  return requestJson("POST", `${aiBaseUrl}/creator-catalogs/${encodeURIComponent(creatorId)}/fetch`, { itemId });
}

export async function creatorOnboardingInfo() {
  return requestJson("GET", `${aiBaseUrl}/creator-onboarding`);
}

export async function previewCreatorOnboarding(body = {}) {
  return requestJson("POST", `${aiBaseUrl}/creator-onboarding/preview`, body);
}

export async function publishCreatorOnboarding(body = {}) {
  return requestJson("POST", `${aiBaseUrl}/creator-onboarding/publish`, body);
}

export function readCreatorImportFile(file, options = {}) {
  const resolved = path.resolve(file);
  const content = fs.readFileSync(resolved, "utf8");
  const ext = path.extname(resolved).toLowerCase();
  const lane = getCreatorLaneConfig(options.sourceLane || options.lane || "") || inferCreatorLaneFromFile(resolved);
  const contentType = options.contentType || lane?.contentType || (ext === ".csv" ? "csv" : ext === ".json" ? "json" : "markdown");
  const defaultEntitlement = options.defaultEntitlement || lane?.defaultEntitlement || "free";
  return {
    title: options.title || path.basename(resolved, ext).replace(/[-_]+/g, " "),
    creatorId: options.creatorId || path.basename(resolved, ext).toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    contentType,
    content,
    sourceLane: lane?.id || options.sourceLane || "",
    importSource: lane ? {
      laneId: lane.id,
      laneLabel: lane.label,
      sampleFile: lane.sampleFile,
      acceptedInputs: lane.acceptedInputs,
    } : undefined,
    defaultEntitlement,
    safetyNote: "Creator import lanes accept exports, transcripts, pasted text, CSV, JSON, or direct approved items. They must not include platform passwords, private tokens, seed phrases, raw cards, or member/student private data.",
    paidActions: options.paidActionTitle ? [{ title: options.paidActionTitle, priceUsd: Number(options.paidActionPriceUsd || 1) }] : [],
  };
}

export async function endpointInfo(slug) {
  return requestJson("GET", `${aiBaseUrl}/endpoints/${encodeURIComponent(slug)}`);
}

export async function createEndpoint(body) {
  return requestJson("POST", `${aiBaseUrl}/endpoints/create`, body);
}

export async function updateEndpoint(slug, body) {
  return requestJson("PATCH", `${aiBaseUrl}/endpoints/${encodeURIComponent(slug)}`, body);
}

export async function deleteEndpoint(slug) {
  return requestJson("DELETE", `${aiBaseUrl}/endpoints/${encodeURIComponent(slug)}`);
}

export async function endpointLogs(slug) {
  return requestJson("GET", `${aiBaseUrl}/endpoints/${encodeURIComponent(slug)}/logs`);
}

export async function endpointSecretsList(slug) {
  return requestJson("GET", `${aiBaseUrl}/endpoints/${encodeURIComponent(slug)}/secrets`);
}

export async function endpointSecretsSet(slug, secrets) {
  return requestJson("POST", `${aiBaseUrl}/endpoints/${encodeURIComponent(slug)}/secrets`, { secrets });
}

export async function payoutSettings() {
  return requestJson("GET", `${aiBaseUrl}/builders/payout-settings`);
}

export async function updatePayoutSettings(body) {
  return requestJson("PATCH", `${aiBaseUrl}/builders/payout-settings`, body);
}

export async function payoutPackets() {
  return requestJson("GET", `${aiBaseUrl}/builders/payouts`);
}

export async function createPayoutPacket({ endpointSlug = "", since = "30d" } = {}) {
  return requestJson("POST", `${aiBaseUrl}/builders/payouts/request`, { endpointSlug, since });
}

function usage() {
  console.log(`Wisely x402 Agent-Payment Infrastructure CLI

Discovery:
  node client.mjs doctor
  node client.mjs manifest
  node client.mjs install-profile
  node client.mjs services
  node client.mjs mcp tools
  node client.mjs rails status
  node client.mjs rails readiness <base|solana|xrpl|stellar>
  node client.mjs proofs cache
  node client.mjs facilitator status
  node client.mjs facilitator security
  node client.mjs integration status
  node client.mjs conversion assets
  node client.mjs conversion routes

Payments and invoke:
  node client.mjs quote <serviceId> <asset> <network> <amountUsd>
  node client.mjs conversion-quote <serviceId> <asset> <network>
  node client.mjs quote-matrix <asset> <network> <amountUsd>
  node client.mjs external-quote <asset> <network> <amountUsd> [sellerUrl] [GET|POST] [sellerBodyJsonFile]
  node client.mjs commerce rye
  node client.mjs commerce rye-build <productUrl> [asset] [network] [buyerJsonFile]
  node client.mjs commerce gift-card
  node client.mjs commerce gift-card-discover food US
  node client.mjs commerce gift-card-merchant-quote quote.json
  node client.mjs commerce gift-card-quote quote.json
  node client.mjs commerce gift-card-intent quote.json
  node client.mjs commerce gift-card-status <intentId>
  node client.mjs commerce bitrefill-search [query] [country]
  node client.mjs x402-quote <asset> <network> <amountUsd>
  node client.mjs invoke preview <serviceId>
  node client.mjs invoke stream <serviceId>
  node client.mjs invoke-preview <serviceId>   # compatibility alias
  node client.mjs invoke-stream <serviceId>    # compatibility alias

Builder key:
  node client.mjs key:set
  node client.mjs key:where

Builder/account:
  node client.mjs builder status
  node client.mjs builder revenue [endpointSlug] [range]
  node client.mjs builder events [endpointSlug] [range] [type]

Creator catalogs:
  node client.mjs creator catalogs
  node client.mjs creator lanes
  node client.mjs creator lane <laneId>
  node client.mjs creator template <laneId>
  node client.mjs creator install [creatorId]
  node client.mjs creator search [creatorId] [query]
  node client.mjs creator recommend [creatorId] [situation]
  node client.mjs creator fetch [creatorId] <itemId>
  node client.mjs creator onboarding
  node client.mjs creator preview <markdown|csv|json file> [creatorId]
  node client.mjs creator publish <markdown|csv|json file> [creatorId]
  node client.mjs creator preview-lane <laneId> <file> [creatorId]
  node client.mjs creator publish-lane <laneId> <file> [creatorId]

Endpoints:
  node client.mjs endpoints list
  node client.mjs endpoints info <slug>
  node client.mjs endpoints create endpoint.json
  node client.mjs endpoints update <slug> endpoint.json
  node client.mjs endpoints pause <slug>
  node client.mjs endpoints resume <slug>
  node client.mjs endpoints delete <slug>
  node client.mjs endpoints logs <slug>
  node client.mjs endpoints secrets list <slug>
  node client.mjs endpoints secrets set <slug> NAME=value [NAME=value...]

Payout packets:
  node client.mjs payouts settings
  node client.mjs payouts settings:set base USDC 0xYourAddress [label]
  node client.mjs payouts list
  node client.mjs payouts create-packet [endpointSlug] [range]

Auth env:
  WISELY_DEVELOPER_KEY or X402_DEVELOPER_KEY
  WISELY_BUILDER_KEY, or local key from key:set
  WISELY_ADMIN_TOKEN for operator-only actions
`);
}

async function saveBuilderKeyFromStdin() {
  console.error("Paste your Wisely builder key, then press Enter. It will be stored locally and not printed.");
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const value = input.trim();
  if (!value.startsWith("wisely_builder_")) throw new Error("That does not look like a Wisely builder key. Nothing was saved.");
  fs.mkdirSync(path.dirname(builderKeyFile), { recursive: true });
  fs.writeFileSync(builderKeyFile, `${value}\n`, { mode: 0o600 });
  try { fs.chmodSync(builderKeyFile, 0o600); } catch {}
  return { ok: true, keyFile: builderKeyFile, note: "Builder key saved locally. Future CLI calls can use it without putting the key in chat." };
}

async function main() {
  const args = process.argv.slice(2);
  const [cmd = "manifest", sub, a, b, c, d, e] = args;
  if (cmd === "help" || cmd === "--help" || cmd === "-h") return usage();
  if (cmd === "doctor") return console.log(compact(await doctor()));
  if (cmd === "manifest") return console.log(compact(await getManifest()));
  if (cmd === "install-profile") return console.log(compact(await getInstallProfile()));
  if (cmd === "services") return console.log(compact(await listServices()));
  if (cmd === "mcp" && sub === "tools") return console.log(compact(await mcpTools()));
  if (cmd === "mcp" && sub === "call") return console.log(compact(await callMcpTool(a, b ? readJsonFile(b) : {})));
  if (cmd === "rails" && sub === "status") return console.log(compact(await getRailStatus()));
  if (cmd === "rails" && sub === "readiness") return console.log(compact(await getRailReadiness(a || "base")));
  if (cmd === "proofs" && sub === "cache") return console.log(compact(await getProofCache()));
  if (cmd === "facilitator" && sub === "status") return console.log(compact(await getFacilitatorStatus()));
  if (cmd === "facilitator" && sub === "security") return console.log(compact(await getSecuritySummary()));
  if (cmd === "integration" && sub === "status") return console.log(compact(await getIntegrationStatus()));
  if (cmd === "conversion" && sub === "assets") return console.log(compact(await getConversionAssets()));
  if (cmd === "conversion" && sub === "routes") return console.log(compact(await getConversionRoutesStatus()));
  if (cmd === "quote") return console.log(compact(await quoteCryptoAiService({ serviceId: sub || "serp-google-search", fromAsset: a || "SOL", fromNetwork: b || "solana", amountUsd: Number(c || 0.1) })));
  if (cmd === "conversion-quote") return console.log(compact(await quoteConversionToSettlement({
    serviceId: sub || "seedream-image-generation",
    fromAsset: a || "SOL",
    fromNetwork: b || "solana",
    fromAddress: process.env.SOURCE_WALLET_ADDRESS || "",
    toAddress: process.env.BASE_USDC_DESTINATION_ADDRESS || "",
    includeTransactionData: Boolean(process.env.SOURCE_WALLET_ADDRESS && process.env.BASE_USDC_DESTINATION_ADDRESS),
  })));
  if (cmd === "quote-matrix") return console.log(compact(await quoteServiceMatrix({ fromAsset: sub || "SOL", fromNetwork: a || "solana", amountUsd: Number(b || 0.1) })));
  if (cmd === "commerce" && sub === "rye") return console.log(compact(await getRyeCommerceHandoff()));
  if (cmd === "commerce" && sub === "gift-card") return console.log(compact(await getGiftCardCommerceStatus()));
  if (cmd === "commerce" && sub === "gift-card-discover") return console.log(compact(await discoverGiftCardCommerceOptions({ category: a || "food", country: b || "US", limit: Number(c || 6) })));
  if (cmd === "commerce" && sub === "gift-card-merchant-quote") return console.log(compact(await quoteBitrefillMerchantGiftCardCommerce(a ? readJsonFile(a) : {
    productId: "doordash-usa",
    merchantOrderAmountUsd: 18.75,
    fromAsset: "USDC",
    fromNetwork: "base",
  })));
  if (cmd === "commerce" && sub === "gift-card-quote") return console.log(compact(await quoteGiftCardCommerce(a ? readJsonFile(a) : {
    merchant: "doordash",
    merchantOrderAmountUsd: 18.75,
    fromAsset: "USDC",
    fromNetwork: "base",
  })));
  if (cmd === "commerce" && sub === "gift-card-intent") return console.log(compact(await createGiftCardCommerceIntent(a ? readJsonFile(a) : {
    merchant: "doordash",
    merchantOrderAmountUsd: 18.75,
    fromAsset: "USDC",
    fromNetwork: "base",
  })));
  if (cmd === "commerce" && sub === "gift-card-status") return console.log(compact(await giftCardIntentStatus(a || "")));
  if (cmd === "commerce" && sub === "bitrefill-search") return console.log(compact(await searchBitrefillGiftCards({ q: a || "doordash", country: b || "US" })));
  if (cmd === "commerce" && sub === "rye-build") {
    const buyer = d ? readJsonFile(d) : undefined;
    return console.log(compact(await buildRyeCommerceQuoteRequest({
      productUrl: a || "https://www.doordash.com/",
      fromAsset: b || "USDC",
      fromNetwork: c || "base",
      buyer,
    })));
  }
  if (cmd === "external-quote" || cmd === "x402-quote") {
    const sellerBody = e ? readJsonFile(e) : undefined;
    return console.log(compact(await quoteExternalX402Seller({
      fromAsset: sub || "USDC",
      fromNetwork: a || "base",
      amountUsd: Number(b || 0.25),
      sellerUrl: c || "",
      sellerMethod: d || "GET",
      sellerBody,
      paymentRequirement: c ? undefined : {
        accepts: [{
          scheme: "exact",
          network: "base",
          maxAmountRequired: String(Math.round(Number(b || 0.25) * 1_000_000)),
          resource: "/demo-paid-resource",
          payTo: "0x0000000000000000000000000000000000000000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          extra: { name: "USDC", decimals: 6 },
        }],
      },
    })));
  }
  if (cmd === "invoke-preview" || (cmd === "invoke" && sub === "preview")) {
    const serviceId = cmd === "invoke" ? (a || "serp-google-search") : (sub || "serp-google-search");
    const input = serviceId === "serp-google-search" ? { query: "AI agent x402 payment routing", num: 3 } : undefined;
    return console.log(compact(await invokeCryptoAiService({ serviceId, input })));
  }
  if (cmd === "invoke-stream" || (cmd === "invoke" && sub === "stream")) {
    const serviceId = cmd === "invoke" ? (a || "serp-google-search") : (sub || "serp-google-search");
    const input = serviceId === "serp-google-search" ? { query: "AI agent x402 payment routing", num: 3 } : undefined;
    return invokeCryptoAiServiceStream({ serviceId, input });
  }
  if (cmd === "key:set") return console.log(compact(await saveBuilderKeyFromStdin()));
  if (cmd === "key:where") return console.log(compact({ ok: true, keyFile: builderKeyFile, configured: Boolean(builderKey()) }));
  if (cmd === "builder" && sub === "status") return console.log(compact(await builderStatus()));
  if (cmd === "builder" && sub === "revenue") return console.log(compact(await builderRevenue({ endpointSlug: a || "", since: b || "30d" })));
  if (cmd === "builder" && sub === "events") return console.log(compact(await builderEvents({ endpointSlug: a || "", since: b || "7d", type: c || "" })));
  if (cmd === "creator" && sub === "catalogs") return console.log(compact(await listCreatorCatalogs()));
  if (cmd === "creator" && sub === "lanes") return console.log(compact(listCreatorLanes()));
  if (cmd === "creator" && sub === "lane") return console.log(compact(getCreatorLane(a || "")));
  if (cmd === "creator" && sub === "template") return console.log(compact(creatorLaneTemplate(a || "")));
  if (cmd === "creator" && sub === "install") return console.log(compact(await creatorCatalogInstall(a || "demo-sales-framework")));
  if (cmd === "creator" && sub === "search") return console.log(compact(await searchCreatorCatalog({ creatorId: a || "demo-sales-framework", query: b || "personalized plan" })));
  if (cmd === "creator" && sub === "recommend") return console.log(compact(await recommendCreatorCatalog({
    creatorId: a || "demo-sales-framework",
    situation: b || "I need a practical plan this week",
    goal: c || "",
    audience: d || "",
  })));
  if (cmd === "creator" && sub === "fetch") return console.log(compact(await fetchCreatorCatalogItem({ creatorId: a || "demo-sales-framework", itemId: b || "" })));
  if (cmd === "creator" && sub === "onboarding") return console.log(compact(await creatorOnboardingInfo()));
  if (cmd === "creator" && sub === "preview") return console.log(compact(await previewCreatorOnboarding(readCreatorImportFile(a, { creatorId: b || "" }))));
  if (cmd === "creator" && sub === "publish") return console.log(compact(await publishCreatorOnboarding(readCreatorImportFile(a, { creatorId: b || "" }))));
  if (cmd === "creator" && sub === "preview-lane") return console.log(compact(await previewCreatorOnboarding(readCreatorImportFile(b, { sourceLane: a || "", creatorId: c || "" }))));
  if (cmd === "creator" && sub === "publish-lane") return console.log(compact(await publishCreatorOnboarding(readCreatorImportFile(b, { sourceLane: a || "", creatorId: c || "" }))));
  if (cmd === "endpoints" && sub === "list") return console.log(compact(await listEndpoints()));
  if (cmd === "endpoints" && sub === "info") return console.log(compact(await endpointInfo(a)));
  if (cmd === "endpoints" && sub === "create") return console.log(compact(await createEndpoint(readJsonFile(a))));
  if (cmd === "endpoints" && sub === "update") return console.log(compact(await updateEndpoint(a, readJsonFile(b))));
  if (cmd === "endpoints" && sub === "pause") return console.log(compact(await updateEndpoint(a, { status: "paused" })));
  if (cmd === "endpoints" && sub === "resume") return console.log(compact(await updateEndpoint(a, { status: "active" })));
  if (cmd === "endpoints" && sub === "delete") return console.log(compact(await deleteEndpoint(a)));
  if (cmd === "endpoints" && sub === "logs") return console.log(compact(await endpointLogs(a)));
  if (cmd === "endpoints" && sub === "secrets" && a === "list") return console.log(compact(await endpointSecretsList(b)));
  if (cmd === "endpoints" && sub === "secrets" && a === "set") {
    const secrets = {};
    for (const item of args.slice(4)) {
      const idx = item.indexOf("=");
      if (idx <= 0) throw new Error(`bad secret assignment: ${item}`);
      secrets[item.slice(0, idx)] = item.slice(idx + 1);
    }
    return console.log(compact(await endpointSecretsSet(b, secrets)));
  }
  if (cmd === "payouts" && sub === "settings") return console.log(compact(await payoutSettings()));
  if (cmd === "payouts" && sub === "settings:set") return console.log(compact(await updatePayoutSettings({ network: a, asset: b, address: c, label: [d, e].filter(Boolean).join(" ") })));
  if (cmd === "payouts" && sub === "list") return console.log(compact(await payoutPackets()));
  if (cmd === "payouts" && sub === "create-packet") return console.log(compact(await createPayoutPacket({ endpointSlug: a || "", since: b || "30d" })));
  usage();
  throw new Error(`Unknown command: ${args.join(" ")}`);
}

export const quoteAceService = quoteCryptoAiService;
export const quoteX402Conversion = quoteConversionToSettlement;
export const quoteX402Seller = quoteExternalX402Seller;
export const getX402CommerceRyeHandoff = getRyeCommerceHandoff;
export const buildX402CommerceRyeQuoteRequest = buildRyeCommerceQuoteRequest;
export const invokeAceService = invokeCryptoAiService;
export const invokeAceServiceStream = invokeCryptoAiServiceStream;

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const modulePath = fileURLToPath(import.meta.url);

if (invokedPath && invokedPath === modulePath) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseSkillFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("SKILL.md is missing YAML frontmatter");
  const meta = {};
  let currentList = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentList) {
      meta[currentList].push(listItem[1].trim());
      continue;
    }
    currentList = null;
    const scalar = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!scalar) throw new Error(`Invalid SKILL.md frontmatter line: ${line}`);
    const key = scalar[1];
    const value = (scalar[2] || "").trim();
    if (!value) {
      meta[key] = [];
      currentList = key;
      continue;
    }
    if (value.includes(": ") && !/^["'|>]/.test(value)) {
      throw new Error(`Frontmatter value for ${key} contains an unquoted colon`);
    }
    meta[key] = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  for (const required of ["name", "version", "title", "description"]) {
    if (!meta[required]) throw new Error(`SKILL.md frontmatter missing ${required}`);
  }
  return meta;
}

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const skillMeta = parseSkillFrontmatter(path.join(repoRoot, "SKILL.md"));
if (String(skillMeta.version) !== String(packageJson.version)) {
  throw new Error(`Version mismatch: SKILL.md ${skillMeta.version} != package.json ${packageJson.version}`);
}
console.log(`ok skill-frontmatter ${skillMeta.version}`);

const urls = [
  "https://wiselyenterprisesllc.com/",
  "https://wiselyenterprisesllc.com/guides/x402-agent-payment-infrastructure/",
  "https://wiselyenterprisesllc.com/creator-import-proof/",
  "https://payments.wiselyenterprisesllc.com/server.json",
  "https://payments.wiselyenterprisesllc.com/.well-known/x402.json",
  "https://payments.wiselyenterprisesllc.com/ai/manifest",
  "https://payments.wiselyenterprisesllc.com/ai/creator-onboarding",
  "https://payments.wiselyenterprisesllc.com/ai/creator-catalogs",
  "https://payments.wiselyenterprisesllc.com/ai/creator-catalogs/demo-sales-framework/install",
  "https://payments.wiselyenterprisesllc.com/x402/rails/status",
  "https://payments.wiselyenterprisesllc.com/x402/proofs/cache"
];

const failures = [];
for (const url of urls) {
  const res = await fetch(url, { headers: { "user-agent": "wisely-x402-public-smoke/2.1.7" } });
  if (!res.ok) failures.push({ url, status: res.status });
  console.log(`${res.ok ? "ok" : "fail"} ${res.status} ${url}`);
}

const recommend = await fetch("https://payments.wiselyenterprisesllc.com/ai/creator-catalogs/demo-sales-framework/recommend", {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "wisely-x402-public-smoke/2.1.7" },
  body: JSON.stringify({
    situation: "I am testing the creator catalog flow and need a one-week buyer conversation plan.",
    goal: "pick the right free or paid creator action",
  }),
});
const recommendBody = await recommend.text();
console.log(`${recommend.ok ? "ok" : "fail"} ${recommend.status} creator-recommend`);
if (!recommend.ok || !recommendBody.includes("wisely.creator-catalog.recommend.v1")) {
  failures.push({ url: "creator-recommend", status: recommend.status });
}

const preview = await fetch("https://payments.wiselyenterprisesllc.com/ai/creator-onboarding/preview", {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "wisely-x402-public-smoke/2.1.7" },
  body: JSON.stringify({
    creatorId: "smoke-preview",
    title: "Smoke Preview Creator",
    contentType: "csv",
    content: "title,summary,itemType,tags,entitlement,sourceRef,subscriberInputPrompt,priceUsd,paidActionSlug,approved\nOffer lesson,Write one specific buyer-facing offer,lesson,offer;free,free,smoke:offer,,0,,true\nPremium action plan,Paid plan for the subscriber situation,paid_tool,paid;planning,paid,smoke:paid,Send situation and constraints.,1,smoke-premium-action,true",
    paidActions: [{ title: "Personalized next action", priceUsd: 1 }],
  }),
});
const previewBody = await preview.text();
console.log(`${preview.ok ? "ok" : "fail"} ${preview.status} creator-onboarding-preview`);
if (!preview.ok || !previewBody.includes("wisely.creator-onboarding.preview.v1")) {
  failures.push({ url: "creator-onboarding-preview", status: preview.status });
}

if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}

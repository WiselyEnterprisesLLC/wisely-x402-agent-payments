#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const expectedVersion = String(packageJson.version);
const tag = process.env.WISELY_VERSION_TAG || `v${expectedVersion}`;
const rawBase = "https://raw.githubusercontent.com/WiselyEnterprisesLLC/wisely-x402-agent-payments";
const headers = { "user-agent": `wisely-x402-version-smoke/${expectedVersion}` };

function parseSkillVersion(text) {
  const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("SKILL.md frontmatter missing");
  const version = match[1].match(/^version:\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if (!version) throw new Error("SKILL.md version missing");
  if (/description:\s*[^"'\r\n]*:\s+/m.test(match[1])) {
    throw new Error("SKILL.md description contains an unquoted colon");
  }
  return version[1].trim();
}

async function fetchText(url) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 160)}`);
  return text;
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function expectEqual(label, actual, expected = expectedVersion) {
  if (String(actual) !== String(expected)) {
    throw new Error(`${label} version mismatch: ${actual} != ${expected}`);
  }
  console.log(`ok ${label} ${actual}`);
}

const mainPackage = await fetchJson(`${rawBase}/main/package.json`);
const tagPackage = await fetchJson(`${rawBase}/${tag}/package.json`);
const mainSkill = await fetchText(`${rawBase}/main/SKILL.md`);
const tagSkill = await fetchText(`${rawBase}/${tag}/SKILL.md`);
const serverJson = await fetchJson("https://payments.wiselyenterprisesllc.com/server.json");
const installProfile = await fetchJson("https://payments.wiselyenterprisesllc.com/ai/install-profile");

expectEqual("local-package", expectedVersion);
expectEqual("github-main-package", mainPackage.version);
expectEqual(`github-${tag}-package`, tagPackage.version);
expectEqual("github-main-skill", parseSkillVersion(mainSkill));
expectEqual(`github-${tag}-skill`, parseSkillVersion(tagSkill));
expectEqual("live-server-json", serverJson.version);
expectEqual("live-install-profile", installProfile.version);

if (!String(mainSkill).includes(`#${tag}`)) {
  throw new Error(`README/SKILL install snippets should pin ${tag}`);
}

console.log("ok public-version-smoke");

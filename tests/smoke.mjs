#!/usr/bin/env node

const urls = [
  "https://wiselyenterprisesllc.com/",
  "https://wiselyenterprisesllc.com/guides/x402-agent-payment-infrastructure/",
  "https://payments.wiselyenterprisesllc.com/server.json",
  "https://payments.wiselyenterprisesllc.com/.well-known/x402.json",
  "https://payments.wiselyenterprisesllc.com/ai/manifest",
  "https://payments.wiselyenterprisesllc.com/x402/rails/status",
  "https://payments.wiselyenterprisesllc.com/x402/proofs/cache"
];

const failures = [];
for (const url of urls) {
  const res = await fetch(url, { headers: { "user-agent": "wisely-x402-public-smoke/2.0" } });
  if (!res.ok) failures.push({ url, status: res.status });
  console.log(`${res.ok ? "ok" : "fail"} ${res.status} ${url}`);
}

if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2));
  process.exit(1);
}

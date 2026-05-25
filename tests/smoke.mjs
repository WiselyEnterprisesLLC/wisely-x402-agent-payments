#!/usr/bin/env node

const urls = [
  "https://wiselyenterprisesllc.com/",
  "https://wiselyenterprisesllc.com/guides/x402-agent-payment-infrastructure/",
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
  const res = await fetch(url, { headers: { "user-agent": "wisely-x402-public-smoke/2.0" } });
  if (!res.ok) failures.push({ url, status: res.status });
  console.log(`${res.ok ? "ok" : "fail"} ${res.status} ${url}`);
}

const recommend = await fetch("https://payments.wiselyenterprisesllc.com/ai/creator-catalogs/demo-sales-framework/recommend", {
  method: "POST",
  headers: { "content-type": "application/json", "user-agent": "wisely-x402-public-smoke/2.0" },
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
  headers: { "content-type": "application/json", "user-agent": "wisely-x402-public-smoke/2.1" },
  body: JSON.stringify({
    creatorId: "smoke-preview",
    title: "Smoke Preview Creator",
    contentType: "markdown",
    content: "# Offer lesson\nWrite one specific buyer-facing offer.\n\n# Premium action plan\nPaid plan for the subscriber situation.",
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

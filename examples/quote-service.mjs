#!/usr/bin/env node

const serviceId = process.argv[2] || "facilitator-echo";
const amountUsd = process.argv[3] || "0.01";

const res = await fetch("https://payments.wiselyenterprisesllc.com/x402/quote", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    serviceId,
    amountUsd,
    intent: "example-public-quote"
  })
});

console.log(res.status);
console.log(JSON.stringify(await res.json(), null, 2));

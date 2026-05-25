# Wisely x402 Agent-Payment Infrastructure

Hosted x402 endpoints and MCP payment infrastructure for autonomous agents.

Wisely lets agents discover paid tools, quote payment requirements, hand wallet signing back to the caller, invoke hosted or external x402 resources, and keep receipts across Base, Solana, XRPL, and Stellar-compatible rails.

This repository is the public integration surface: docs, schemas, examples, CLI helpers, and portable agent instructions. It does not contain Wisely's private server implementation, signer custody, provider credentials, anti-abuse internals, private ledgers, or routing heuristics.

## Start Here

```bash
npm install -g github:WiselyEnterprisesLLC/wisely-x402-agent-payments
wisely-x402 doctor
wisely-x402 rails status
```

No install required for MCP clients:

```json
{
  "mcpServers": {
    "wisely-x402": {
      "type": "http",
      "url": "https://payments.wiselyenterprisesllc.com/ai/mcp"
    }
  }
}
```

Useful public URLs:

- Website: https://wiselyenterprisesllc.com/
- Guide: https://wiselyenterprisesllc.com/guides/x402-agent-payment-infrastructure/
- Free ClawMart skill: https://www.shopclawmart.com/listings/wisely-x402-agent-payment-infrastructure-354ee359
- MCP server: https://payments.wiselyenterprisesllc.com/ai/mcp
- Server metadata: https://payments.wiselyenterprisesllc.com/server.json
- x402 manifest: https://payments.wiselyenterprisesllc.com/.well-known/x402.json
- Rail status: https://payments.wiselyenterprisesllc.com/x402/rails/status
- Proof cache: https://payments.wiselyenterprisesllc.com/x402/proofs/cache

## What Wisely Does

- Remote MCP server for payment-aware agents.
- Hosted paid endpoints for builders who want to sell one tool call at a time.
- External x402 seller quote/handoff for standard HTTP 402 resources.
- Developer credits for repeat approved calls without prompting for every tiny signature.
- Conversion quote handoff when a buyer starts with one supported crypto asset and the seller requires another.
- Receipts, logs, proof cache, and reconciliation status.

## Settlement Rails

Read the live truth from `/x402/rails/status`.

| Rail | Public role |
| --- | --- |
| Base USDC | Canonical native x402 exact settlement. |
| Solana USDC/USDT | Wisely-native SPL payment adapter with memo-bound x402 receipts. |
| XRPL XRP/RLUSD | Wisely-native XRPL payment adapter with destination-tag and memo-bound x402 receipts. |
| Stellar XLM/USDC | Wisely-native Stellar payment adapter with hash-memo-bound x402 receipts. |

Base is the rail most generic x402 clients should understand first. The other rails are real on-chain Wisely adapters intended for agents using the Wisely skill, MCP server, CLI, or HTTP helpers.

## What To Tell An Agent

```text
Use the Wisely x402 Agent-Payment Infrastructure.
Check the manifest and rail status first.
Quote before payment.
Ask before wallet signing.
Stream progress for slow calls.
Save receipts and proof.
If you see a new x402 seller, use the external quote flow and explain the rail, asset, amount, expiry, and signing step.
```

## Public Package Boundaries

This repo intentionally includes:

- portable skill instructions
- client/CLI helper
- public schemas
- install examples
- public endpoint guides
- security and receipt model

This repo intentionally excludes:

- private signer keys or seed material
- provider API keys
- raw cards or bank credentials
- private customer payloads
- private OpenClaw memory
- private backend implementation details
- private anti-abuse and routing heuristics

## Docs

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Hosted endpoints](docs/hosted-endpoints.md)
- [MCP setup](docs/mcp-setup.md)
- [Rails](docs/rails.md)
- [Creator skills](docs/creator-skills.md)
- [Receipts](docs/receipts.md)
- [FAQ](docs/faq.md)

## Smoke Test

```bash
npm test
```

The smoke test only checks public no-payment discovery paths. It does not send wallet signatures, spend money, or call private endpoints.

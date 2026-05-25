# Rails

Wisely is building toward the independent provider layer for agent commerce.

## Current Rail Wording

| Rail | Wording to use |
| --- | --- |
| Base USDC | Canonical native x402 exact settlement. |
| Solana USDC/USDT | Wisely-native SPL payment adapter with memo-bound x402 receipts. |
| XRPL XRP/RLUSD | Wisely-native XRPL payment adapter with destination-tag and memo-bound x402 receipts. |
| Stellar XLM/USDC | Wisely-native Stellar payment adapter with hash-memo-bound x402 receipts. |

Do not imply that every generic x402 client automatically supports Solana, XRPL, or Stellar. Agents should use Wisely's MCP server, skill, CLI, or HTTP helpers for those adapter rails.

## Readiness Standard

A production rail should have:

- exact payment verification
- live settlement proof
- negative tests
- reconciliation
- abuse controls
- operational monitoring
- public proof
- outside-agent discovery checks

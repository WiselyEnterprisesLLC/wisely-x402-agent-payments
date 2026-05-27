# Wisely x402 Agent-Payment Infrastructure

Hosted x402 endpoints and MCP payment infrastructure for autonomous agents.

Wisely lets agents discover paid tools, quote payment requirements, hand wallet signing back to the caller, invoke hosted or external x402 resources, and keep receipts across Base, Solana, XRPL, and Stellar-compatible rails.

For ChatGPT and other MCP clients that cannot hold a wallet, Wisely now exposes a frictionless wallet handoff: the agent calls `connect_wallet`, the user opens a short-lived signing URL, then signs with a wallet app, desktop extension, detected injected wallet, or WalletConnect when configured. The agent then calls `x402_payment_session_status` and retries the paid request with the returned `X-PAYMENT` header. No private keys or seed phrases enter ChatGPT or Wisely.

This repository is the public integration surface: docs, schemas, examples, CLI helpers, and portable agent instructions. It does not contain Wisely's private server implementation, signer custody, provider credentials, anti-abuse internals, private ledgers, or routing heuristics.

## Start Here

```bash
npm install -g github:WiselyEnterprisesLLC/wisely-x402-agent-payments#v2.1.6
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
- Hosted wallet signing sessions for ChatGPT/MCP clients that need a user-friendly payment link with mobile wallet deep links, desktop injected-wallet selection, and optional WalletConnect.
- Local commerce/browser bridge setup for DoorDash-style user-owned merchant sessions, while Wisely handles x402, gift-card, crypto quote, and receipts remotely.
- Developer credits for repeat approved calls without prompting for every tiny signature.
- Conversion quote handoff when a buyer starts with one supported crypto asset and the seller requires another.
- Receipts, logs, proof cache, and reconciliation status.
- Public paid report endpoints, including a $0.05 `/paid/chan-state-report` that returns a current /pol/ + /biz/ board-intelligence report with streaming progress, receipts, and anti-amplification safety boundaries.

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
If you cannot sign wallet payments yourself, call connect_wallet, show me the signing URL, and tell me I can open it in MetaMask, Coinbase Wallet, Phantom, Trust Wallet, a desktop injected EVM wallet, or WalletConnect if available.
Stream progress for slow calls.
Save receipts and proof.
If you see a new x402 seller, use the external quote flow and explain the rail, asset, amount, expiry, and signing step.
```

## ChatGPT Wallet Handoff

ChatGPT can connect to the Wisely MCP server, but it should not store wallet private keys. Use this flow:

1. The agent calls `start_here`.
2. The agent quotes the paid service or external x402 seller.
3. The agent calls `connect_wallet` or `x402_wallet_handoff`.
4. The user opens the returned `signingUrl` in a wallet-capable browser, or uses the built-in Open MetaMask / Open Coinbase Wallet / Open Phantom / Open Trust Wallet buttons.
5. On desktop, the user can pick a detected injected EVM wallet such as MetaMask, Coinbase Wallet, Rabby, Brave Wallet, Trust, OKX, or Phantom. If the server has a WalletConnect project configured, the user can also connect through WalletConnect.
6. The agent calls `x402_payment_session_status`.
7. If signed, the agent retries the paid resource with the returned `X-PAYMENT` header and saves the receipt.

CLI helper:

```bash
wisely-x402 wallet handoff openai-chat-completions
wisely-x402 wallet status <sessionId>
```

## Creator Catalog Quickstart

Browser wizard:

https://wiselyenterprisesllc.com/creator-onboarding/

```bash
wisely-x402 creator catalogs
wisely-x402 creator lanes
wisely-x402 creator template kajabi_export
wisely-x402 creator install demo-sales-framework
wisely-x402 creator recommend demo-sales-framework "I need the best paid or free action for a new buyer conversation this week"
wisely-x402 creator preview ./my-course-outline.md my-course
wisely-x402 creator preview-lane notion_export examples/creator-imports/notion-playbook.md my-course
```

The recommendation tells the agent whether to fetch a free/subscriber catalog item or probe a paid endpoint for HTTP 402 payment requirements before asking the user to approve payment.

`creator preview` imports Markdown, CSV, JSON, or direct item arrays into a non-persistent draft. `creator preview-lane` and the browser wizard handle video transcripts, PDF text, Notion, Kajabi, Teachable, Skool/community, Discord, membership, teams/training, affiliate, revenue-split, token-gated, and marketplace exports as paste/upload workflows. `creator publish` uses a saved builder key to create the live catalog and optional paid `/tools/{slug}` actions.

Template imports live in [`examples/creator-imports`](examples/creator-imports), with the lane registry in [`examples/creator-imports/creator-lanes.json`](examples/creator-imports/creator-lanes.json). They all normalize to:

```text
title, summary, itemType, tags, entitlement, sourceRef, subscriberInputPrompt, priceUsd, paidActionSlug, approved
```

Safety boundary: these lanes use exports, transcripts, pasted text, public links, or creator-approved summaries. They do not require Notion tokens, Discord bot tokens, Kajabi/Teachable passwords, platform admin credentials, raw cards, private keys, or private member/student data.

Public proof page:

https://wiselyenterprisesllc.com/creator-import-proof/

## Local Commerce Browser Bridge

For DoorDash or similar merchant cart flows, the remote Wisely MCP server is not enough by itself because the cart has to run in the user's own browser/session.

Use this setup:

```bash
wisely-x402 local-bridge setup
wisely-x402 local-bridge start
wisely-x402 local-bridge test
```

Then add a second local MCP server to the user's agent:

```json
{
  "mcpServers": {
    "wisely-x402": {
      "type": "http",
      "url": "https://payments.wiselyenterprisesllc.com/ai/mcp"
    },
    "wisely-local-commerce": {
      "type": "http",
      "url": "http://127.0.0.1:4027/mcp"
    }
  }
}
```

What the agent should tell the user:

```text
I can use Wisely for payment quotes and receipts. For DoorDash, I need a local browser bridge so the cart runs on your computer. Start the bridge, log into DoorDash yourself in the browser window, and do not paste your password here. I will build the cart locally, show you the checkout total and ETA, then use Wisely for the gift-card/crypto/x402 quote. I will stop before any payment or Place Order.
```

If the bridge says Playwright is missing:

```bash
npm install -g playwright
npx playwright install chromium
```

## Paid Report Example

Current /pol/ + /biz/ board report:

```bash
curl -i https://payments.wiselyenterprisesllc.com/paid/chan-state-report
```

The no-payment call returns HTTP `402` with x402 payment requirements. After the caller signs and retries, the endpoint returns a long Markdown report. Use `?stream=1` or `Accept: text/event-stream` when an agent should stream plain-English progress before the final report event.

The report is frank about public extremist, obscene, hateful, conspiratorial, and market-hype content, but does not reproduce targeted abuse, doxxing, slurs, or calls for violence. It is intended as narrative/market intelligence, not endorsement.

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
- [Local commerce bridge](docs/local-commerce-bridge.md)
- [Receipts](docs/receipts.md)
- [FAQ](docs/faq.md)

## Smoke Test

```bash
npm test
npm run creator-lanes-smoke
npm run public-version-smoke
```

The smoke test only checks public no-payment discovery paths. It does not send wallet signatures, spend money, or call private endpoints.

`public-version-smoke` is the post-release check. It compares GitHub `main`, the current tag, live `server.json`, `SKILL.md` frontmatter, and the MCP install profile so stale default-branch views are caught quickly.

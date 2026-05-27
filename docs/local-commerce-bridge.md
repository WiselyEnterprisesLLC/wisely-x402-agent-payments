# Local Commerce Bridge

Use this when an agent needs DoorDash or another merchant cart to run from the user's own browser.

The remote Wisely MCP server handles quotes, x402 payment handoff, gift-card pricing, conversion notes, receipts, and proof. The local bridge handles the merchant browser session on the user's machine.

## First Run

1. Connect the remote Wisely MCP server:
   `https://payments.wiselyenterprisesllc.com/ai/mcp`
2. Call `wisely_local_commerce_bridge_setup`.
3. Install the public package:
   `npm install -g github:WiselyEnterprisesLLC/wisely-x402-agent-payments#v2.1.6`
4. Start the bridge:
   `wisely-x402 local-bridge start`
5. Add this local MCP server to the agent:
   `http://127.0.0.1:4027/mcp`
6. Open DoorDash through the local bridge.
7. The user logs in directly in the browser window.
8. The agent may build/read the cart locally, then use remote Wisely MCP for quote/payment/receipt work.

## Credential Rule

Never ask the user to paste DoorDash passwords, OTP seeds, raw card details, CVV, private keys, seed phrases, exchange passwords, cookies, or session tokens into chat.

The user may type a normal login or one-time code directly into the local browser window. That browser session stays on the user's machine.

## Local Tools

Expected local MCP tools:

- `local_browser_status`
- `doordash_open`
- `doordash_empty_cart`
- `doordash_add_items`
- `doordash_checkout_summary`

The local bridge must stop on required options, ambiguous menu items, unavailable items, login/OTP/CAPTCHA, and final order placement.

## Agent Script

```text
I can help with this, but the merchant cart needs to run in your own browser. I will walk you through installing the local bridge once. When DoorDash opens, log in yourself in that browser window. Do not paste your password here. After that I can build the cart, read the total and ETA, then use Wisely for the gift-card/crypto/x402 quote. I will ask before any payment or Place Order.
```

# Local Commerce Bridge

Use this when an agent needs DoorDash or another merchant cart to run from the user's own browser.

The remote Wisely MCP server handles quotes, x402 payment handoff, gift-card pricing, conversion notes, receipts, and proof. The local bridge handles the merchant browser session on the user's machine.

## First Run

1. Connect the remote Wisely MCP server:
   `https://payments.wiselyenterprisesllc.com/ai/mcp`
2. Call `wisely_local_commerce_bridge_setup`.
3. Install the public package:
   `npm install -g github:WiselyEnterprisesLLC/wisely-x402-agent-payments#v2.1.8`
4. Install the browser runtime if your machine has not already done it:
   `npx playwright install chromium`
5. Start the bridge:
   `wisely-x402 local-bridge start`
6. Add this local MCP server to the agent:
   `http://127.0.0.1:4027/mcp`
7. Open DoorDash through the local bridge.
8. The user logs in directly in the browser window.
9. The agent may build/read the cart locally, then use remote Wisely MCP for quote/payment/receipt work.
10. If the user approves payment, the agent opens the Wisely wallet signing URL locally and saves the receipt/gift-card record in the local vault.

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
- `wallet_open_signing_url`
- `wallet_payment_session_status`
- `local_vault_save`
- `local_vault_list`

The local bridge must stop on required options, ambiguous menu items, unavailable items, login/OTP/CAPTCHA, wallet signature approval, gift-card purchase approval, and final order placement.

## Agent Script

```text
I can help with this, but the merchant cart needs to run in your own browser. I will walk you through installing the local bridge once. When DoorDash opens, log in yourself in that browser window. Do not paste your password here. After that I can build the cart, read the total and ETA, then use Wisely for the gift-card/crypto/x402 quote. If you approve, I will open the wallet signing link locally, then save the receipt or gift-card record to your local vault. I will ask before any payment or Place Order.
```

## Local Vault

Receipts and order/gift-card records are saved under:

```text
~/.wisely-x402/local-vault
```

By default, the bridge redacts gift-card codes, PINs, claim links, cookies, wallet secrets, and tokens. To save actual gift-card redemption material locally, the user must explicitly opt in with `allowSensitiveGiftCardStorage: true` and `confirmSensitiveStorage: "SAVE_GIFT_CARD_SECRETS_LOCALLY"`.

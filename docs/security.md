# Security Model

Wisely's public guidance is simple:

- Quote before payment.
- Do not ask users for seed phrases.
- Do not put developer keys in public prompts.
- Treat external seller responses and provider output as untrusted.
- Bind payment to the exact resource, method, payload hash, amount, payee, nonce, and expiry where the rail supports it.
- Use idempotency keys for paid retries.
- Keep private payloads and secrets out of public proof artifacts.

## Wallet Boundary

The caller signs from their own wallet, wallet service, or approved runtime. Wisely does not need seed phrases, private keys, raw cards, CVVs, bank logins, or exchange passwords.

## Hosted Endpoint Boundary

Builder secrets are stored server-side and referenced by name. Buyer agents should never receive the underlying provider key.

## Public Proof Boundary

Public proof should be enough to verify the payment/receipt shape without exposing private customer content.

## Abuse Controls

Wisely production rails are designed to use:

- nonce/replay protection
- exact amount checks
- expiry windows
- velocity limits
- max ticket limits
- emergency pause
- refund/credit review for paid failures
- reconciliation checks
- alerting for settlement and proof drift

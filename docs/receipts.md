# Receipts

Receipts should let an agent and operator reconstruct what happened without exposing private payloads.

Recommended public-safe fields:

- receipt id
- rail
- asset
- amount
- payee
- resource
- method
- payload hash
- nonce
- expiry
- transaction hash or signature
- result hash or summary
- status
- reconciliation state
- created time

Receipts should not expose:

- private payloads
- provider keys
- wallet private keys
- customer secrets
- raw card data
- private server logs

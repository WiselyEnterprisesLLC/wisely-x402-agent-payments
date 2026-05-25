# Hosted x402 Endpoints

Hosted endpoints let a builder turn a normal API action, MCP tool, creator workflow, or utility into a paid agent-callable endpoint.

## Builder Flow

1. Create the endpoint in the builder console or with a scoped builder key.
2. Define method, path, input schema, output type, price rule, and handler.
3. Store secrets server-side by name if the handler calls another provider.
4. Test the no-payment call. It should return HTTP 402.
5. Test the paid or developer-credit call.
6. Publish buyer instructions.
7. Monitor logs, events, revenue, payout packets, and receipt status.

## Good First Endpoints

- Summarize a URL or document.
- Score a business lead.
- Validate an MCP server for monetization.
- Generate a small image or content artifact.
- Return a creator lesson recommendation.
- Run a paid calculator, checklist, or audit.

## Agent Prompt

```text
Use my Wisely builder key to create a paid x402 endpoint.
Keep secrets server-side.
Test a no-payment call and make sure it returns HTTP 402.
Then give me the buyer instructions, curl example, MCP usage, and receipt fields.
```

# MCP Setup

Use the remote MCP server when your agent supports streamable HTTP MCP.

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

After connecting, ask the agent to:

```text
List the Wisely x402 tools.
Check rail status.
Quote before any payment.
Use developer credits only if I have saved a key in the secure secret store.
Save receipts after paid calls.
```

Public metadata:

- https://payments.wiselyenterprisesllc.com/server.json
- https://payments.wiselyenterprisesllc.com/ai/mcp/manifest
- https://payments.wiselyenterprisesllc.com/.well-known/mcp.json

# AV MCP Server (V1)

This MCP server reuses the existing CLI core modules and backend API.

## Tools

- `init_config`
- `gen_from_curl`
- `adapters_list`
- `adapter_get`
- `execute_api`
- `secrets_set`
- `logs_tail`

## Start

```bash
cd cli
npm run build
cd ../mcp
npm install
npm run start
```

## Claude Desktop config (example)

```json
{
  "mcpServers": {
    "av-mcp": {
      "command": "node",
      "args": ["F:/repo/one-api/mcp/src/index.js"],
      "cwd": "F:/repo/one-api"
    }
  }
}
```

## Smoke prompts

1. `帮我看看我现在有哪些 API 可以用？`
2. `用 reqres 的 users action 跑一次 page=2`

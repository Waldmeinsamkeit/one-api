# one-api monorepo

统一 API 适配平台（后端 + 前端 + CLI + MCP）。

## 项目结构

- `back/`：后端服务（Node.js）
- `front/`：前端控制台（Vite + React + TypeScript）
- `cli/`：命令行工具（AV CLI V1）
- `mcp/`：MCP Server（供 Claude Desktop/Agent 调用）

## 快速启动

### 1) 启动后端

```bash
cd back
node src/server.js
```

### 2) 启动前端

```bash
cd front
npm install
npm run dev
```

前端 `.env` 示例：

```env
VITE_BACKEND_URL=http://localhost:3000
```

## 前端主要页面

- `Adapters`：生成、预览、发布、Sandbox Test
- `Secrets`：凭证录入与管理
- `Logs`：执行日志查询
- `Playground`：快速调试入口
- `LLM`：模型切换、Prompt 编辑、API Key 配置

## CLI 使用说明（AV CLI V1）

先安装并构建：

```bash
cd cli
npm install
npm run build
```

帮助：

```bash
node dist/index.js --help
```

### 常用命令

#### 初始化配置

```bash
node dist/index.js init \
  --profile default \
  --backend-url http://127.0.0.1:3000 \
  --token your_platform_token \
  --workspace-id default \
  --adapter-dir ./adapters
```

#### 根据 cURL 生成适配器

```bash
node dist/index.js gen \
  -f ./sample.curl \
  -t curl \
  --api-slug reqres \
  --action users
```

#### 执行适配器

```bash
node dist/index.js run reqres \
  --action users \
  --payload "{\"page\":2}" \
  --include-hint
```

#### 查看日志

```bash
node dist/index.js logs --tail 10
```

#### 设置密钥

```bash
node dist/index.js secrets set openai_api_key=sk-xxxx
```

### 配置优先级

读取顺序：`ENV > 项目配置(.av-cli.json) > 全局配置`

关键环境变量：

- `AV_CLI_PROFILE`
- `AV_CLI_BACKEND_URL`
- `AV_CLI_TOKEN`
- `AV_CLI_WORKSPACE_ID`
- `AV_CLI_ADAPTER_DIR`
- `AV_CLI_PREFERRED_MODEL`

## MCP 使用说明（A + C 混合版）

MCP Server 复用 `cli` 的核心能力，并提供 AI 自发现工具（list/get adapters）。

### 启动 MCP

```bash
cd cli
npm run build

cd ../mcp
npm install
npm run start
```

### MCP 工具列表

- `init_config`
- `gen_from_curl`
- `adapters_list`
- `adapter_get`
- `execute_api`
- `secrets_set`
- `logs_tail`

### Claude Desktop 配置示例

`claude_desktop_config.json`：

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

### 推荐冒烟测试

1. `帮我看看我现在有哪些 API 可以用？`（应触发 `adapters_list`）
2. `用 reqres 的 users action 跑一次 page=2`（应触发 `execute_api`）

## 验证命令

CLI 回归测试：

```bash
cd cli
npm run test
```

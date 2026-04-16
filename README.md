# One-API Monorepo

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-v18+-blue.svg)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/React-v18-61dafb.svg)](https://reactjs.org/)
[![MCP Ready](https://img.shields.io/badge/MCP-Ready-green.svg)](https://modelcontextprotocol.io/)

**One-API** 是一套由 LLM 驱动的下一代 API 适配与聚合平台。它能够将分散、非标的第三方接口（cURL, OpenAPI, Raw Text）快速转化为标准化的 API 契约，并通过 Web 控制台、命令行（CLI）以及 AI Agent 协议（MCP）对外输出。

> **核心价值**：消除“写代码对接 API”的枯燥工作，让 AI 代理自动理解并调用全世界的接口。

---

## 🏗️ 项目架构

项目采用 Monorepo 结构，各模块职责清晰，通过统一的领域逻辑耦合：

*   **`back/`**：核心引擎。支持适配器动态生成（LLM-based）、运行时映射、Secrets 存储及日志审计。
*   **`front/`**：管理后台。可视化配置模型、管理凭证、Playground 调试及实时日志查看。
*   **`cli/`**：开发者工具。支持本地开发流 `init -> gen -> run`，适用于 CI/CD 与自动化脚本。
*   **`mcp/`**：AI 基础设施。实现 Model Context Protocol，让 Claude Desktop 或其他 Agent 具备“自发现”并执行 API 的能力。

---

## 🚀 快速启动

### 1. 后端服务 (Server)
后端默认使用 SQLite 存储，无需配置重型数据库。
```bash
cd back
npm install
cp .env.example .env  # 配置你的 LLM Key (DeepSeek/OpenAI/Gemini)
node src/server.js
```

### 2. 前端控制台 (Console)
```bash
cd front
npm install
npm run dev
```
访问 `http://localhost:5173`，在 **LLM 栏目** 配置平台 Token。

---

## 🛠️ CLI 工具使用 (AV-CLI)

AV-CLI 是为开发者设计的命令行利器，支持快速将 cURL 转换为适配器。

### 安装与构建
```bash
cd cli
npm install && npm run build
alias av-cli='node $(pwd)/dist/index.js'
```

### 核心工作流
1.  **初始化环境**:
    ```bash
    av-cli init --backend-url http://127.0.0.1:3000 --token YOUR_TOKEN
    ```
2.  **一键生成适配器**:
    ```bash
    # 从本地 curl 命令文件生成
    av-cli gen -f ./weather.curl --api-slug weather --action get_current
    ```
3.  **本地模拟执行**:
    ```bash
    av-cli run weather --action get_current --payload '{"city":"Tokyo"}'
    ```

---

## 🤖 AI 智能集成 (MCP)

通过 MCP 协议，你可以让 AI 助手（如 Claude）直接控制你的 API 库。

### Claude Desktop 配置
编辑 `claude_desktop_config.json`：
```json
{
  "mcpServers": {
    "one-api-mcp": {
      "command": "node",
      "args": ["/PATH/TO/mcp/dist/index.js"],
      "env": {
        "AV_CLI_BACKEND_URL": "http://127.0.0.1:3000",
        "AV_CLI_TOKEN": "你的平台Token"
      }
    }
  }
}
```

### AI 交互示例
> **User**: "帮我看看现在有哪些 API 可以用？"
> **Claude**: (触发 `adapters_list`) "您目前有 `reqres`, `weather` 等 API..."
> **User**: "调用 reqres 的 users 动作，查询第 2 页的数据。"
> **Claude**: (触发 `execute_api`) "收到，执行结果如下..."

---

## 🔒 安全与特性

*   **多模型驱动**：原生支持 DeepSeek, OpenAI, Gemini 混合调度。
*   **安全存储**：Secrets 采用 **AES-GCM** 算法加密存储，仅在运行时解密。
*   **SSRF 防护**：内置 DNS 检查与 IP 黑名单，阻断对内网敏感地址的探测，支持重定向深度校验。
*   **鉴权隔离**：基于 Workspace 的数据隔离，支持 OAuth (Linux.do) 用户登录。
*   **审计日志**：完整记录每次调用的 Trace、Latency、脱敏请求与原始响应。

---

## 📅 路线图 (Roadmap)

- [x] **V1.0**: 适配器生成核心链路与 SQLite 持久化
- [x] **V1.2**: CLI 工具链与 MCP 协议支持
- [x] **V1.5**: 响应 Mapping 契约校验与 `schema_hint` 增强
- [ ] **V2.0 (In Progress)**: **响应流式传输 (Streaming)** 支持，优化 LLM 响应体验
- [ ] **V2.1**: 基于脚本沙箱的复杂逻辑映射转换
- [ ] **V2.5**: 适配器市场 (Hub)，支持一键导入社区预设

---

## 🤝 贡献与反馈

如果你在测试过程中发现任何问题（如 `EACCES` 网络报错或 `JSONPath` 匹配失效），请提交 Issue 或通过控制台查看脱敏日志。

---

**One-API - 让接口适配进入 AI 自动化时代。**
## P2 优化更新（2026-04-13）

本次迭代已完成以下三项：

### 1) 错误码分层与返回结构标准化

后端错误响应已统一为：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": null
  },
  "meta": {
    "request_id": "uuid",
    "timestamp": "2026-04-13T00:00:00.000Z"
  }
}
```

并按类型返回更明确的状态码（401/403/404/422/500）。

### 2) 契约文档自动化（OpenAPI）

- 新增接口：`GET /v1/openapi.json`
- 新增导出命令：

```bash
cd back
npm run openapi:export
```

- 导出文件：`docs/api/openapi.json`

### 3) 适配器鉴权体验增强（auth_mode）

适配器新增显式鉴权模式：

- `auth_mode: "none"`：无鉴权，不允许 `auth_ref` 和 `{{secrets.xxx}}`
- `auth_mode: "secret"`：需鉴权，要求 `auth_ref.secret_name`

同时兼容历史未声明 `auth_mode` 的适配器。
前端 Adapters 页面已增加“无鉴权/需鉴权”可视化提示与发布前校验提示。

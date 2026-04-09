# 开发日志（截至当前）

## 1. 项目结构与基础能力
- 已完成仓库拆分：`back/`（后端）+ `front/`（前端）。
- 后端已实现统一 API 聚合核心流程：适配器生成、发布、执行、Dry Run、日志记录、Secrets 管理。
- 前端已实现控制台主界面：侧边栏导航 + 顶栏 + 主视图。

## 2. 后端已完成内容（back）
- 适配器生成链路：
  - 支持 `source_type`: `curl/openapi/raw`。
  - 支持 `source_url`、`target_format`。
  - 已接入多模型 provider：`openai/gemini/deepseek`。
  - 默认模型自动选择（优先已配置 key 的 provider）。
- 模型管理：
  - `GET /v1/models`
  - `GET /v1/models/active`
  - `POST /v1/models/activate`
  - `POST /v1/models/prompt`
- 平台 Token 管理：
  - Header 脱敏展示支持接口：`GET /v1/platform-token`
  - Token 轮换接口：`POST /v1/platform-token/rotate`
  - 鉴权改为运行时 token（支持 rotate 后立即生效）。
- 运行与日志：
  - `POST /v1/adapters/dry-run` 已改为写入执行日志（`dry_run=true`）。
  - `GET /v1/executions` 列表接口已补齐。
  - 执行详情含：脱敏请求、上游响应、最终输出、trace、latency。
- 安全能力：
  - 密钥 AES-GCM 存储。
  - SSRF 基础防护 + DNS/IP 检查。
  - 生成阶段新增目标地址可达性校验（不可达直接报错，不再“生成成功”）。
- 配置能力：
  - 自动加载 `back/.env`（无需手动导出环境变量）。
  - 新增可达性校验配置：
    - `ENFORCE_TARGET_REACHABILITY`
    - `TARGET_REACHABILITY_TIMEOUT_MS`
- 技能库（Prompt-time）：
  - 新增配置文件：`back/skills/skill-library.json`
  - 新增加载模块：`src/domain/skillLibrary.js`
  - 系统提示词可注入“启用技能”说明。
  - 已启用 `web_search` + `web_fetch` 并更新提示词流程（先搜再抓再提取）。

## 3. 前端已完成内容（front）
- 技术栈：Vite + React + TypeScript + Tailwind + Monaco + Lucide。
- 页面与交互：
  - `Adapters`：生成、预览、发布、Play（Dry Run）。
  - `Secrets`：保存与查看凭证。
  - `Logs`：列表 + 抽屉式详情。
  - `Playground`：快速入口。
  - `说明`：详细操作手册（含模式说明、调用示例）。
- 顶栏能力：
  - Workspace 输入。
  - 平台 Token 显示/隐藏、脱敏显示、复制成功反馈、Rotate。
  - 当前激活模型显示（provider/model）与刷新按钮。
- 说明页补充：
  - 已加入 raw 示例：
    - `"Hi AI, we have this weather API. The URL is https://api.test.com/info. You need to put the city in the body as { 'location': 'city_name' }. It needs a Bearer token in the header."`
  - 已补 `api_slug/action/目标统一格式` 的填写手册和示例。

## 4. 已处理问题
- `Publish to V1` 无明显反馈：已加成功提示并同步列表状态。
- Logs 无记录：已让 Dry Run 写入日志并前端自动刷新。
- 前端 `Invalid token`：
  - 识别为前端缓存 token 与后端运行时 token 不一致问题。
  - 已提供 token 显示、复制、rotate、后端自检路径。

## 5. 当前状态
- 后端自检脚本 `node scripts/verify.js` 可通过。
- 关键接口冒烟已验证：模型、适配器生成、发布、dry-run、日志查询。
- DeepSeek 已可作为激活模型参与生成（可通过 `/v1/models/active` 与生成日志确认）。

## 6. 本次更新小结（2026-04-09）
- 后端新增本地 SQL（SQLite）Secrets 持久化：
  - 新增 `src/domain/sqliteSecretStore.js`，默认开启 `ENABLE_SQLITE_SECRETS=true`。
  - 新增配置 `SQLITE_PATH`（默认 `data/one-api.db`）。
  - `repositories` 已接入 secretStore，Secrets 不再仅内存保存。
- 后端网络错误提示增强：
  - `httpExecutor` 对 `EACCES/EPERM` 增加明确报错文案（网络访问被拒绝）。
  - `safeError` 增强，避免返回空 message。
- 适配器鉴权逻辑调整（关键）：
  - 执行阶段改为“仅当模板中出现 `{{secrets.xxx}}` 时才要求对应 secret”。
  - 默认 fallback 生成模板不再强制 `Authorization: Bearer {{secrets.api_key}}`。
  - Prompt 模板更新为“鉴权可选，仅在上游明确要求时生成 auth_ref/secret 占位符”。
  - 注意：历史已发布适配器若仍含 `{{secrets.api_key}}`，执行时仍会要求 secret；需重新生成并发布新版本。
- 前端 Adapters 体验优化：
  - 将 Adapters 页 `Play` 文案改为 `Sandbox Test`（按钮、弹窗标题、提示文案同步）。
  - 新增“一键导出可调用 API 请求格式”按钮，复制内容包含：
    - Windows CMD
    - PowerShell
    - Bash/Zsh
    - JSON Body 示例
  - 适配器列表改为卡片化样式，补状态徽章、版本/schema、更新时间、空态提示。
- 本次定位到的典型问题：
  - `cmd.exe` 下 `curl -d` 使用单引号会把 `'` 原样传入，导致 JSON 解析报错（需用双引号+转义）。
  - 当前运行环境对部分外网地址存在出站限制，访问 `restcountries.com:443` 曾出现 `EACCES`。
- 本次新增/更新测试：
  - `test/sqliteSecretStore.test.js`
  - `test/httpExecutor.test.js`（补 EACCES 场景）
  - `test/adapterGenerator.test.js`
  - `test/dryRun.test.js`（补“无 secret 占位符可执行”场景）

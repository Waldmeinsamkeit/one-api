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

## 7. 待完成目标（按优先级）
### P0（当前优先）
- [x] 响应映射契约修正（避免错误映射进入线上）：
  - `publish` 前再次执行 schema 校验，阻止无效 `response_mapping` 发布为 active。
  - `response_mapping` 拦截表达式误用（如 `if(...)` 字符串），明确仅支持 JSONPath 提取。
  - 运行时映射支持点号键转嵌套对象（`meta.upstream_status` -> `{ meta: { upstream_status } }`）。
- [x] 持久化补全（二期）：除 secrets 外，将 adapters/executions 也落本地 SQL，避免重启丢失。
  - 新增 `src/domain/sqliteStateStore.js`。
  - `InMemoryRepositories` 增加 `stateStore` 注入并在 adapter/execution 变更后持久化。
  - 服务启动接入 `ENABLE_SQLITE_STATE`（默认开启），与 `SQLITE_PATH` 共用数据库文件。

### P1（下一迭代）
- [x] 前端补全 `source_url` 输入与传参，打通后端抓取链路。
- [x] 模型管理 UI 完整化（models 列表、激活切换、prompt 编辑）。
- [x] 日志能力增强（分页、筛选、按条件查询）。
- [x] SSRF/重定向测试补强（重点覆盖“公网首跳后 302 到内网”阻断）。

### P2（后续优化）
- [ ] 错误码分层与接口返回结构标准化（401/403/422/5xx 等）。
- [ ] 前后端契约文档自动化（OpenAPI 或固定 schema）。
- [ ] 适配器体验增强（显式无鉴权/需鉴权模式提示与校验）。

### 后期目标（暂不执行）
- [ ] `POST /v1/platform-token/rotate` 权限收紧（加入 admin 校验）。

## 8. 今日进展（2026-04-09，认证与管理员）
### 已完成
- Linux.do OAuth 用户登录链路（后端 + 最小前端门禁）：
  - 后端新增：`/auth/login`、`/auth/callback`、`/auth/me`、`/auth/logout`。
  - 会话存储：SQLite `users/sessions` 表，首次登录自动创建用户并自动分配唯一 `workspace_id`（每用户一个 workspace）。
  - API 鉴权改为：优先 Cookie 会话，兼容旧 Bearer token。
  - 前端新增最小登录页：未登录仅显示“使用 Linux.do 登录”按钮；登录后进入原控制台。
- 管理员 M1（后端）：
  - 新增管理员登录链路：`/admin/login`、`/admin/me`、`/admin/logout`。
  - 管理员登录限制为本机 IP：仅 `127.0.0.1` / `::1` / `::ffff:127.0.0.1`。
  - 新增管理员会话表 `admin_sessions`（SQLite 持久化）。
- 管理员 M2（后端）：
  - 新增用户管理接口：`GET /admin/users`、`POST /admin/users/delete`。
  - 删除用户时会级联清理其 workspace 数据：`secrets/adapters/executions` + 用户会话。
- 配置与文档：
  - 新增 OAuth/管理员相关环境变量（`config.js`）。
  - `back/README.md` 已补充 OAuth 与管理员接口说明。
- 测试：
  - 新增并通过：`test/sqliteAuthStore.test.js`、`test/ip.test.js`、`test/repositories.workspace-delete.test.js`。
  - 自检通过：`node scripts/verify.js`。

### 明日待办（继续）
- [x] M3：前端最小管理员页面（登录、用户列表、删除用户按钮）。
  - `/admin` 路径下启用管理员模式。
  - 未登录显示最小管理员登录页。
  - 登录后展示用户列表、搜索框、删除用户按钮。
- [x] M4（第一阶段）：联调与上线测试脚本（内网穿透回调、Cookie/CORS 配置能力）。
  - 新增 `scripts/verify-auth-deploy.js`，用于检查 OAuth/Admin/CORS/Cookie 必填配置。
  - 后端 CORS 改为显式白名单：`CORS_ALLOWED_ORIGINS`。
  - Cookie 策略改为可配置：
    - `SESSION_COOKIE_SAME_SITE`
    - `ADMIN_SESSION_COOKIE_SAME_SITE`
    - `COOKIE_SECURE_MODE`
  - `README.md` 已补内网穿透 + OAuth 测试说明。
- [ ] M4（第二阶段）：真实联调验证（待填正式 OAuth/Admin 环境变量后执行）。
- 补充：管理操作审计日志（谁在何时删除了哪个用户）与失败重试/限流策略。

## 9. 本次更新小结（2026-04-10，P1 迭代）
- 前端新增 `LLM` 栏目（左侧导航）：
  - 展示 models 列表、当前激活状态、切换激活模型。
  - 支持编辑并保存 `system_prompt`。
  - 支持配置 provider API Key（复用 Secrets）：
    - `openai_api_key`
    - `gemini_api_key`
    - `deepseek_api_key`
- 后端模型可用性改为 workspace 维度：
  - `/v1/models` 与 `/v1/models/active` 的 `api_key_configured` 基于当前 workspace 的 Secrets 计算（并保留 `.env` fallback）。
  - LLM 生成时 API Key 解析优先 workspace secret，未配置时回退 `.env`。
- 前端 Adapters 页补全 `source_url` 输入并传参到 `/v1/adapters/generate`。
- Logs 页新增第一版查询能力：关键字筛选、状态筛选、分页大小与翻页控制。
- 新增 SSRF 重定向阻断测试：覆盖“公网首跳 -> 302 到 `127.0.0.1`”被拦截场景。

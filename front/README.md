# one-api front

## Run

```bash
npm install
npm run dev
```

## Env

```env
VITE_BACKEND_URL=http://localhost:3000
VITE_ENABLE_LOGIN_PAGE=false
```

- `VITE_ENABLE_LOGIN_PAGE=false`（默认）：关闭普通前端登录页，仅显示“登录页面已关闭”提示。
- `VITE_ENABLE_LOGIN_PAGE=true`：开启普通前端登录页（OAuth/账号密码）。

## Views

- Adapters: 生成、预览、发布、Play
- Secrets: 凭证管理
- Logs: 执行日志 + 详情抽屉
- Playground: 快速开始入口

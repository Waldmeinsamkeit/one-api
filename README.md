# one-api monorepo

项目已拆分为：
- `back/` 后端服务（Node）
- `front/` 前端控制台（Vite + React + TypeScript）

## 目录

- [后端](F:\repo\one-api\back)
- [前端](F:\repo\one-api\front)

## 启动方式

后端：
```bash
cd back
node src/server.js
```

前端：
```bash
cd front
npm install
npm run dev
```

## 前端环境变量

在 `front` 下新建 `.env`：

```env
VITE_BACKEND_URL=http://localhost:3000
```

## 已实现页面

- `Adapters`：生成、预览、发布、Play 调试
- `Secrets`：凭证录入与列表
- `Logs`：执行列表 + 右侧抽屉详情
- `Playground`：快速进入生成流程

# 部署说明

这个项目当前是本地可运行的前后端工程，部署分两种常见场景。

## 1. 本地开发

1. 确保已经安装 Node.js 18.18+。
2. 在项目根目录复制一份环境文件：

```bash
copy .env.example .env
```

3. 编辑 `.env`，填入需要启用的平台凭证。至少可以先配 Douyin 或 B站其中一个：
   - Douyin：`DOUYIN_CLIENT_KEY`、`DOUYIN_CLIENT_SECRET`
   - B站：`BILIBILI_CLIENT_ID`、`BILIBILI_CLIENT_SECRET`
4. 运行：

```bash
npm.cmd install
npm.cmd run dev
```

5. 浏览器打开：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3001`

## 2. 生产构建

1. 先构建前端：

```bash
npm.cmd run build
```

2. 再启动后端服务：

```bash
npm.cmd start
```

3. 默认会同时提供：

- `dist/` 中的前端页面
- 本地 API 服务

## 3. Douyin 授权配置

如果你要启用抖音官方授权，必须配置以下环境变量：

- `DOUYIN_CLIENT_KEY`
- `DOUYIN_CLIENT_SECRET`
- `DOUYIN_REDIRECT_URI`
- `APP_FRONTEND_URL`

其中回调地址默认需要和抖音开放平台里填写的一致：

`http://127.0.0.1:3001/oauth/douyin/callback`

## 4. B站授权与投稿配置

如果你要启用 B站官方授权和投稿，必须配置以下环境变量：

- `BILIBILI_CLIENT_ID`
- `BILIBILI_CLIENT_SECRET`
- `BILIBILI_REDIRECT_URI`
- `BILIBILI_AUTHORIZATION_URL`
- `BILIBILI_API_BASE_URL`
- `BILIBILI_MEMBER_BASE_URL`
- `BILIBILI_OPENUPOS_BASE_URL`
- `BILIBILI_DEFAULT_TID`
- `BILIBILI_UPLOAD_CHUNK_SIZE`

其中回调地址默认需要和 B站开放平台里填写的一致：

`http://127.0.0.1:3001/oauth/bilibili/callback`

发布 B站内容时，任务里需要至少一个视频素材和一张封面图片。

注意：

- `VITE_BASE_PATH` 只影响前端构建
- `BILIBILI_*` 这些值需要让 Node 后端在运行时也能读到
- 如果你在生产环境里只改了 `.env.production`，请把同样的 B站配置同步到服务器上的 `.env`

## 5. 常见问题

- 如果 PowerShell 里 `npm` 不可用，直接用 `npm.cmd`
- 如果修改了 `.env`，要重启 `npm run dev`
- 如果浏览器仍打开旧页面，先刷新一下

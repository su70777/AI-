# 一键多发平台

这是一个面向课程内容多平台分发的前后端工程，当前已经具备：

- 登录鉴权
- 平台授权管理
- 素材上传与删除
- 分发任务创建、重试、日志
- Douyin 官方 OAuth 接入
- B站官方 OAuth 与视频投稿接入
- 视频号 / 小红书桥接发布接口接入准备

## 目录结构

- `src/`：前端页面与交互逻辑
- `server/`：本地 API 服务、任务队列与发布逻辑
- `shared/`：前后端共用常量、格式化与种子数据

## 启动方式

### Windows PowerShell

如果你在 PowerShell 里执行 `npm` 遇到脚本限制，直接用 `npm.cmd`：

```powershell
npm.cmd install
npm.cmd run dev
```

### Windows CMD

```bat
npm install
npm run dev
```

启动后访问：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3001`

## 默认登录

首次进入会显示登录页，默认账号：

- 用户名：`admin`
- 密码：`admin123`

## Douyin 官方授权

当前工程已经接入 Douyin 官方 OAuth 流程。要启用它，请在运行前配置环境变量：

- `DOUYIN_CLIENT_KEY`
- `DOUYIN_CLIENT_SECRET`
- `DOUYIN_REDIRECT_URI`，默认是 `http://127.0.0.1:3001/oauth/douyin/callback`
- `APP_FRONTEND_URL`，默认是 `http://127.0.0.1:5173`

如果这些变量没有配置，页面里的 Douyin 授权按钮会返回提示，不会真正跳转。

最方便的方式是在项目根目录新建一个 `.env` 文件，例如：

```env
DOUYIN_CLIENT_KEY=你的 client key
DOUYIN_CLIENT_SECRET=你的 client secret
DOUYIN_REDIRECT_URI=http://127.0.0.1:3001/oauth/douyin/callback
APP_FRONTEND_URL=http://127.0.0.1:5173
```

也可以直接复制一份 `.env.example`：

```powershell
Copy-Item .env.example .env
```

## B站官方授权与投稿

当前工程也已经接入 B站官方 OAuth 和视频投稿链路。要启用它，请在运行前配置环境变量：

- `BILIBILI_CLIENT_ID`
- `BILIBILI_CLIENT_SECRET`
- `BILIBILI_REDIRECT_URI`，默认是 `http://127.0.0.1:3001/oauth/bilibili/callback`
- `BILIBILI_AUTHORIZATION_URL`，默认是 `https://passport.bilibili.com/oauth2/authorize`
- `BILIBILI_API_BASE_URL`，默认是 `https://api.bilibili.com`
- `BILIBILI_MEMBER_BASE_URL`，默认是 `https://member.bilibili.com`
- `BILIBILI_OPENUPOS_BASE_URL`，默认是 `https://openupos.bilivideo.com`
- `BILIBILI_DEFAULT_TID`，默认是 `75`
- `BILIBILI_UPLOAD_CHUNK_SIZE`，默认是 `8388608`

如果这些变量没有配置，页面里的 B站授权按钮会提示缺少配置，不会真正跳转。

发布 B站内容时，任务里需要至少一个视频素材和一张封面图片，前端和后端都会做校验。

```env
BILIBILI_CLIENT_ID=你的 client id
BILIBILI_CLIENT_SECRET=你的 client secret
BILIBILI_REDIRECT_URI=http://127.0.0.1:3001/oauth/bilibili/callback
BILIBILI_AUTHORIZATION_URL=https://passport.bilibili.com/oauth2/authorize
```

## 视频号 / 小红书接入方式

视频号和小红书当前在工程里已经从 `mock` 拆成独立 provider：

- 视频号：`wechat_channels`
- 小红书：`redbook`

由于这两个平台的服务器端内容发布能力通常需要官方能力、服务商能力或内部自动化服务配合，工程先采用“桥接发布接口”方式接入。你后续拿到可发布接口后，只需要在环境变量里配置接口地址：

```env
WECHAT_CHANNELS_PUBLISH_ENDPOINT=https://你的服务/发布视频号
WECHAT_CHANNELS_API_KEY=可选密钥

REDBOOK_PUBLISH_ENDPOINT=https://你的服务/发布小红书
REDBOOK_API_KEY=可选密钥

PUBLIC_SERVER_URL=https://lmf.hszk365.cn
```

创建任务时，后端会把统一内容、每个平台的单独微调内容、素材列表等信息通过 `POST JSON` 发给对应桥接接口。`PUBLIC_SERVER_URL` 用来生成素材的公网访问地址。未配置 endpoint 时，任务会明确标记为“待接入/跳过”，不会误报真实发布成功。

更完整的部署和发布说明见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 生产构建

```bash
npm.cmd run build
npm.cmd start
```

`start` 会优先提供 `dist/` 中的前端页面，同时启动本地 API。

## 现在能做什么

- 登录后进入工作台
- 上传课程视频、封面和附件
- 选择平台并创建分发任务
- 查看任务进度、重试失败任务
- 对 Douyin 走官方 OAuth 授权并发起真实发布
- 对 B站走官方 OAuth 授权并发起真实投稿
- 对视频号 / 小红书生成真实发布所需的桥接 payload，并等待官方或服务商发布接口接入

## 说明

- 目前 Douyin 和 B站是两条真实接入链路
- 视频号和小红书已经有独立 provider，但需要配置桥接接口后才能真实发出
- 快手目前仍以本地模拟或待接入方式处理
- 如果你刚装完 Node，但终端里 `node` 还不可用，重开一次 VS Code 终端即可

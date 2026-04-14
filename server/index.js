import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { formatBytes, formatDateTime } from "../shared/format.js";
import {
  addFiles,
  addLog,
  authorizePlatform,
  buildBootstrap,
  computeSummary,
  createTaskRecord,
  deleteFile,
  getDb,
  getPlatformById,
  listFiles,
  listTasks,
  resetDb,
  retryTask,
  revokePlatform,
  updatePlatform,
} from "./lib/store.js";
import { clearAllTaskTimers, scheduleTaskLifecycle } from "./lib/scheduler.js";
import { loginWithPassword, logoutToken, requireAuth } from "./lib/auth.js";
import { createOAuthState, consumeOAuthState } from "./lib/oauth-state.js";
import {
  buildDouyinOAuthUrl,
  exchangeDouyinAuthorizationCode,
  getDouyinClientConfig,
  isDouyinConfigured,
  maskToken,
} from "./lib/providers/douyin.js";
import {
  buildBilibiliOAuthUrl,
  exchangeBilibiliAuthorizationCode,
  getBilibiliClientConfig,
  isBilibiliConfigured,
} from "./lib/providers/bilibili.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const UPLOAD_DIR = path.join(ROOT_DIR, "server", "uploads");
const PORT = Number(process.env.PORT || 3001);
const FRONTEND_ORIGIN = String(process.env.APP_FRONTEND_URL || "http://127.0.0.1:5173").replace(
  /\/+$/,
  "",
);

const app = express();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const storageName = `${Date.now()}-${randomUUID()}${ext}`;
    cb(null, storageName);
  },
});

const upload = multer({
  storage,
});

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

function sendError(res, error, status = 400) {
  const message = error instanceof Error ? error.message : String(error);
  res.status(status).json({ error: { message } });
}

function normalizeTaskFilter(text) {
  return String(text || "").trim().toLowerCase();
}

function buildFilteredTasks(query) {
  const status = String(query.status || "").trim();
  const search = normalizeTaskFilter(query.q);
  let tasks = listTasks();

  if (status && status !== "all") {
    tasks = tasks.filter((task) => task.status === status);
  }

  if (search) {
    tasks = tasks.filter((task) => {
      const haystack = [
        task.id,
        task.title,
        task.status,
        task.owner,
        task.summary,
        task.tags,
        task.mode,
        task.cover,
        ...(task.platformNames || []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }

  return tasks;
}

function toFrontendRedirect(params = {}) {
  const url = new URL(FRONTEND_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function sendOAuthRedirect(res, params = {}) {
  res.redirect(toFrontendRedirect(params).toString());
}

function parseLooseLoginPayload(rawBody) {
  const text = String(rawBody || "").trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Fall through to a loose parser for legacy or malformed clients.
  }

  if (text.includes("=") && text.includes("&")) {
    const params = new URLSearchParams(text);
    const username = String(params.get("username") || "").trim();
    const password = String(params.get("password") || "");
    if (username || password) {
      return { username, password };
    }
  }

  const stripped = text.replace(/^\{|\}$/g, "");
  if (!stripped.includes(":")) {
    return null;
  }

  const payload = {};
  for (const segment of stripped.split(",")) {
    const [rawKey, ...rawValueParts] = segment.split(":");
    if (!rawKey || !rawValueParts.length) {
      continue;
    }

    const key = rawKey.trim().replace(/^['"]|['"]$/g, "");
    const value = rawValueParts.join(":").trim().replace(/^['"]|['"]$/g, "");
    if (key) {
      payload[key] = value;
    }
  }

  if (payload.username || payload.password) {
    return payload;
  }

  return null;
}

app.get("/oauth/douyin/callback", async (req, res) => {
  const statePayload = consumeOAuthState(req.query.state);
  if (!statePayload) {
    return sendOAuthRedirect(res, {
      oauth: "error",
      provider: "douyin",
      message: "授权状态已失效，请重新发起抖音授权。",
    });
  }

  const platformId = String(statePayload.platformId || "douyin").trim();
  const error = String(req.query.error || "").trim();
  const errorDescription = String(req.query.error_description || "").trim();

  if (error) {
    return sendOAuthRedirect(res, {
      oauth: "error",
      provider: "douyin",
      platformId,
      message: errorDescription || error,
    });
  }

  const code = String(req.query.code || "").trim();
  if (!code) {
    return sendOAuthRedirect(res, {
      oauth: "error",
      provider: "douyin",
      platformId,
      message: "未收到授权 code。",
    });
  }

  try {
    const tokens = await exchangeDouyinAuthorizationCode(code);
    const platform = authorizePlatform(platformId, {
      authMethod: "oauth",
      accountName: `抖音账号 ${tokens.openId ? maskToken(tokens.openId) : "已授权"}`,
      accountId: tokens.openId,
      openId: tokens.openId,
      unionId: tokens.unionId,
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenHint: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      authNotes: "通过抖音官方 OAuth 接入",
      touchAuthorizedAt: true,
    });

    addLog(
      `抖音官方授权成功：${platform?.accountName || "未命名账号"}，令牌已写入服务端。`,
    );

    return sendOAuthRedirect(res, {
      oauth: "success",
      provider: "douyin",
      platformId,
      message: `抖音官方授权成功：${platform?.accountName || "已完成授权"}`,
    });
  } catch (callbackError) {
    console.error("Douyin OAuth callback failed", callbackError);
    return sendOAuthRedirect(res, {
      oauth: "error",
      provider: "douyin",
      platformId,
      message: callbackError.message || "抖音授权失败",
    });
  }
});

app.get("/oauth/bilibili/callback", async (req, res) => {
  const statePayload = consumeOAuthState(req.query.state);
  if (!statePayload) {
    return sendOAuthRedirect(res, {
      oauth: "error",
      provider: "bilibili",
      message: "授权状态已失效，请重新发起 B 站授权。",
    });
  }

  const platformId = String(statePayload.platformId || "bilibili").trim();
  const error = String(req.query.error || "").trim();
  const errorDescription = String(req.query.error_description || "").trim();

  if (error) {
    return sendOAuthRedirect(res, {
      oauth: "error",
      provider: "bilibili",
      platformId,
      message: errorDescription || error,
    });
  }

  const code = String(req.query.code || "").trim();
  if (!code) {
    return sendOAuthRedirect(res, {
      oauth: "error",
      provider: "bilibili",
      platformId,
      message: "未收到授权 code。",
    });
  }

  try {
    const tokens = await exchangeBilibiliAuthorizationCode(code);
    const platform = authorizePlatform(platformId, {
      authMethod: "oauth",
      accountName: "B站 OAuth 账号",
      accountId: "",
      openId: tokens.openId,
      unionId: tokens.unionId,
      tokenType: tokens.tokenType,
      scope: tokens.scope,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenHint: maskToken(tokens.accessToken),
      expiresAt: tokens.expiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      authNotes: "通过 B 站官方 OAuth 接入",
      touchAuthorizedAt: true,
      providerId: "bilibili",
    });

    addLog(`B 站官方授权成功：${platform?.accountName || "已完成授权"}，令牌已写入服务端。`);

    return sendOAuthRedirect(res, {
      oauth: "success",
      provider: "bilibili",
      platformId,
      message: `B 站官方授权成功：${platform?.accountName || "已完成授权"}`,
    });
  } catch (callbackError) {
    console.error("Bilibili OAuth callback failed", callbackError);
    return sendOAuthRedirect(res, {
      oauth: "error",
      provider: "bilibili",
      platformId,
      message: callbackError.message || "B 站授权失败",
    });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    data: {
      ok: true,
      time: new Date().toISOString(),
      summary: computeSummary(getDb()),
    },
  });
});

app.post("/api/auth/login", (req, res) => {
  const session = loginWithPassword(req.body?.username, req.body?.password);
  if (!session) {
    return sendError(res, new Error("账号或密码错误"), 401);
  }

  res.json({ data: session });
});

app.use("/api", requireAuth);

app.get("/api/auth/me", (req, res) => {
  res.json({
    data: {
      user: req.user,
      session: req.session,
    },
  });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.session?.token || String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  logoutToken(token);
  res.json({ data: { ok: true } });
});

app.get("/api/bootstrap", (req, res) => {
  res.json({
    data: {
      ...buildBootstrap(),
      user: req.user,
    },
  });
});

app.get("/api/summary", (_req, res) => {
  res.json({ data: computeSummary(getDb()) });
});

app.get("/api/platforms", (_req, res) => {
  res.json({ data: buildBootstrap().platforms });
});

app.post("/api/platforms/:id/oauth/start", (req, res) => {
  try {
    const platform = getPlatformById(req.params.id);
    if (!platform) {
      return sendError(res, new Error("平台不存在"), 404);
    }

    const providerId = String(platform.providerId || platform.id || "").trim();
    let authUrl = "";

    if (providerId === "douyin") {
      if (!isDouyinConfigured()) {
        const config = getDouyinClientConfig();
        return sendError(
          res,
          new Error(
            `请先配置 Douyin 客户端信息：${config.clientKey ? "clientKey 已存在" : "缺少 clientKey"} / ${
              config.clientSecret ? "clientSecret 已存在" : "缺少 clientSecret"
            }`,
          ),
        );
      }

      authUrl = buildDouyinOAuthUrl({ state: createOAuthState({
        platformId: platform.id,
        userId: req.user?.id || "",
        username: req.user?.username || "",
      }) });
    } else if (providerId === "bilibili") {
      if (!isBilibiliConfigured()) {
        const config = getBilibiliClientConfig();
        return sendError(
          res,
          new Error(
            `请先配置 B 站客户端信息：${config.clientId ? "clientId 已存在" : "缺少 clientId"} / ${
              config.clientSecret ? "clientSecret 已存在" : "缺少 clientSecret"
            }`,
          ),
        );
      }

      authUrl = buildBilibiliOAuthUrl({
        state: createOAuthState({
          platformId: platform.id,
          userId: req.user?.id || "",
          username: req.user?.username || "",
        }),
      });
    } else {
      return sendError(res, new Error("当前平台暂不支持官方 OAuth 授权"));
    }

    addLog(`${platform.name} 已生成授权地址，准备跳转官方 OAuth。`);
    res.json({
      data: {
        authUrl,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

app.patch("/api/platforms/:id", (req, res) => {
  try {
    const platform = getPlatformById(req.params.id);
    if (!platform) {
      return sendError(res, new Error("平台不存在"), 404);
    }

    const next = updatePlatform(req.params.id, {
      selected:
        typeof req.body.selected === "boolean" ? req.body.selected : platform.selected,
      connected:
        typeof req.body.connected === "boolean" ? req.body.connected : platform.connected,
    });

    addLog(
      `${platform.name} 状态已更新为 ${
        typeof req.body.connected === "boolean"
          ? req.body.connected
            ? "已连接"
            : "未连接"
          : next.connected
            ? "已连接"
            : "未连接"
      }。`,
    );

    return res.json({ data: next });
  } catch (error) {
    return sendError(res, error);
  }
});

app.post("/api/platforms/:id/authorize", (req, res) => {
  try {
    const platform = authorizePlatform(req.params.id, req.body || {});
    if (!platform) {
      return sendError(res, new Error("平台不存在"), 404);
    }

    addLog(`平台 ${platform.name} 已完成授权，账号 ${platform.accountName || "未命名账号"}。`);
    return res.json({ data: platform });
  } catch (error) {
    return sendError(res, error);
  }
});

app.post("/api/platforms/:id/revoke", (req, res) => {
  try {
    const platform = revokePlatform(req.params.id);
    if (!platform) {
      return sendError(res, new Error("平台不存在"), 404);
    }

    addLog(`平台 ${platform.name} 已取消授权。`);
    return res.json({ data: platform });
  } catch (error) {
    return sendError(res, error);
  }
});

app.get("/api/files", (_req, res) => {
  res.json({ data: listFiles() });
});

app.post("/api/files", upload.array("files"), (req, res) => {
  try {
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    if (!uploadedFiles.length) {
      return sendError(res, new Error("请先选择要上传的文件"));
    }

    const existingKeys = new Set(
      getDb().files.map((file) => `${file.name}::${file.sizeBytes}::${file.mimeType}`),
    );
    const createdFiles = [];

    for (const file of uploadedFiles) {
      const key = `${file.originalname}::${file.size}::${file.mimetype}`;
      if (existingKeys.has(key)) {
        fs.rmSync(file.path, { force: true });
        continue;
      }

      existingKeys.add(key);
      createdFiles.push({
        name: file.originalname,
        originalName: file.originalname,
        sizeBytes: file.size,
        sizeLabel: formatBytes(file.size),
        mimeType: file.mimetype,
        storageName: file.filename,
        storagePath: file.path,
        downloadUrl: `/uploads/${file.filename}`,
        createdAt: formatDateTime(new Date()),
      });
    }

    const result = addFiles(createdFiles);
    if (result.added.length) {
      addLog(`已新增 ${result.added.length} 个素材到素材池。`);
    }

    res.status(201).json({
      data: {
        added: result.added,
        skipped: result.skipped,
        files: result.files,
        summary: computeSummary(getDb()),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

app.delete("/api/files/:id", (req, res) => {
  try {
    const removed = deleteFile(req.params.id);
    if (!removed) {
      return sendError(res, new Error("文件不存在"), 404);
    }

    addLog(`已从素材池移除 ${removed.name}。`);
    res.json({ data: removed });
  } catch (error) {
    return sendError(res, error);
  }
});

app.get("/api/tasks", (req, res) => {
  res.json({
    data: buildFilteredTasks(req.query),
  });
});

app.post("/api/tasks", (req, res) => {
  try {
    const task = createTaskRecord(req.body || {});
    const platformLabel = task.platformNames.join(" / ");
    addLog(`已创建分发任务：${task.title}，目标平台 ${platformLabel}。`);
    scheduleTaskLifecycle(task.id);
    res.status(201).json({ data: task });
  } catch (error) {
    return sendError(res, error);
  }
});

app.post("/api/tasks/:id/retry", (req, res) => {
  try {
    const task = retryTask(req.params.id);
    if (!task) {
      return sendError(res, new Error("任务不存在"), 404);
    }

    addLog(`已重试任务 ${task.title}。`);
    scheduleTaskLifecycle(task.id);
    res.json({ data: task });
  } catch (error) {
    return sendError(res, error);
  }
});

app.get("/api/logs", (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 20), 100));
  const logs = buildBootstrap().logs.slice(0, limit);
  res.json({ data: logs });
});

app.post("/api/reset", (_req, res) => {
  try {
    clearAllTaskTimers();
    const db = resetDb();
    res.json({
      data: {
        ...buildBootstrap(),
        summary: computeSummary(db),
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  app.use(express.static(DIST_DIR));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({
      message: "API 已启动。请先运行 npm run dev，或者先执行 npm run build 后再使用 npm start。",
    });
  });
}

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.parse.failed" && _req.originalUrl === "/api/auth/login") {
    const payload = parseLooseLoginPayload(error.body);
    if (payload) {
      const session = loginWithPassword(payload.username, payload.password);
      if (session) {
        return res.json({ data: session });
      }

      return sendError(res, new Error("账号或密码错误"), 401);
    }

    return sendError(res, new Error("登录请求格式不正确，请刷新页面后重试"), 400);
  }

  console.error(error);
  sendError(res, error, 500);
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`API server listening on http://127.0.0.1:${PORT}`);
});

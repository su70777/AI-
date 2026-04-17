import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createDefaultDb } from "../../shared/seed.js";
import { formatBytes, formatClock, formatDateTime } from "../../shared/format.js";
import {
  DEFAULT_CONNECTED_PLATFORM_IDS,
  DEFAULT_SELECTED_PLATFORM_IDS,
} from "../../shared/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.join(__dirname, "..", "..");
export const DATA_DIR = path.join(ROOT_DIR, "server", "data");
export const UPLOAD_DIR = path.join(ROOT_DIR, "server", "uploads");
export const DB_FILE = path.join(DATA_DIR, "db.json");

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function clone(value) {
  return structuredClone(value);
}

function normalizeText(value) {
  return String(value || "").trim();
}

const PLATFORM_OVERRIDE_FIELDS = new Set([
  "title",
  "summary",
  "tags",
  "topics",
  "visibility",
  "category",
  "copyright",
  "noteType",
  "publishAccount",
  "note",
  "tid",
  "categoryId",
  "noReprint",
  "source",
]);

function normalizePlatformOverrides(input = {}, platformIds = []) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const allowedPlatforms = new Set(platformIds.filter(Boolean));
  const output = {};

  for (const [platformId, rawOverride] of Object.entries(input)) {
    if (allowedPlatforms.size && !allowedPlatforms.has(platformId)) {
      continue;
    }

    if (!rawOverride || typeof rawOverride !== "object" || Array.isArray(rawOverride)) {
      continue;
    }

    const cleanOverride = {};
    for (const [field, value] of Object.entries(rawOverride)) {
      if (!PLATFORM_OVERRIDE_FIELDS.has(field)) {
        continue;
      }

      const cleanValue = normalizeText(value);
      if (cleanValue) {
        cleanOverride[field] = cleanValue;
      }
    }

    if (Object.keys(cleanOverride).length) {
      output[platformId] = cleanOverride;
    }
  }

  return output;
}

function maskToken(value) {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }

  if (text.length <= 10) {
    return `${text.slice(0, 2)}***${text.slice(-2)}`;
  }

  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function generateTaskId() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TASK-${datePart}-${timePart}-${randomPart}`;
}

function findPlatformRecord(platformId) {
  return db.platforms.find((item) => item.id === platformId) || null;
}

function normalizePlatform(platform) {
  let providerId = typeof platform.providerId === "string" ? platform.providerId : "";
  if (platform.id === "douyin" && providerId !== "douyin") {
    providerId = "douyin";
  } else if (platform.id === "bilibili" && providerId !== "bilibili") {
    providerId = "bilibili";
  } else if (platform.id === "wechat" && providerId !== "wechat_channels") {
    providerId = "wechat_channels";
  } else if (platform.id === "redbook" && providerId !== "redbook") {
    providerId = "redbook";
  } else if (!providerId) {
    providerId = "mock";
  }

  return {
    ...platform,
    providerId,
    connected:
      typeof platform.connected === "boolean"
        ? platform.connected
        : DEFAULT_CONNECTED_PLATFORM_IDS.includes(platform.id),
    selected:
      typeof platform.selected === "boolean"
        ? platform.selected
        : DEFAULT_SELECTED_PLATFORM_IDS.includes(platform.id),
    authMethod:
      typeof platform.authMethod === "string"
        ? platform.authMethod
        : DEFAULT_CONNECTED_PLATFORM_IDS.includes(platform.id)
          ? "demo"
          : "",
    accountName:
      typeof platform.accountName === "string"
        ? platform.accountName
        : DEFAULT_CONNECTED_PLATFORM_IDS.includes(platform.id)
          ? `${platform.name} 示例账号`
          : "",
    accountId: typeof platform.accountId === "string" ? platform.accountId : "",
    accessToken: typeof platform.accessToken === "string" ? platform.accessToken : "",
    refreshToken: typeof platform.refreshToken === "string" ? platform.refreshToken : "",
    openId: typeof platform.openId === "string" ? platform.openId : "",
    unionId: typeof platform.unionId === "string" ? platform.unionId : "",
    tokenType: typeof platform.tokenType === "string" ? platform.tokenType : "",
    scope: typeof platform.scope === "string" ? platform.scope : "",
    accessTokenHint:
      typeof platform.accessTokenHint === "string" ? platform.accessTokenHint : "",
    authorizedAt:
      typeof platform.authorizedAt === "string"
        ? platform.authorizedAt
        : DEFAULT_CONNECTED_PLATFORM_IDS.includes(platform.id)
          ? new Date().toISOString()
          : "",
    expiresAt: typeof platform.expiresAt === "string" ? platform.expiresAt : "",
    refreshTokenExpiresAt:
      typeof platform.refreshTokenExpiresAt === "string" ? platform.refreshTokenExpiresAt : "",
    authNotes: typeof platform.authNotes === "string" ? platform.authNotes : "",
  };
}

function normalizeTask(task) {
  const platformIds = Array.isArray(task.platformIds) ? task.platformIds : [];

  return {
    ...task,
    platformIds,
    platformNames: Array.isArray(task.platformNames) ? task.platformNames : [],
    fileIds: Array.isArray(task.fileIds) ? task.fileIds : [],
    fileCount: Number.isFinite(task.fileCount) ? task.fileCount : 0,
    createdAt: task.createdAt || formatDateTime(new Date()),
    updatedAt: task.updatedAt || task.createdAt || formatDateTime(new Date()),
    retryCount: Number.isFinite(task.retryCount) ? task.retryCount : 0,
    publishResults: Array.isArray(task.publishResults) ? task.publishResults : [],
    platformOverrides: normalizePlatformOverrides(task.platformOverrides, platformIds),
    lastPublishedAt: typeof task.lastPublishedAt === "string" ? task.lastPublishedAt : "",
    lastError: typeof task.lastError === "string" ? task.lastError : "",
  };
}

function normalizeFile(file) {
  return {
    ...file,
    sizeBytes: Number.isFinite(file.sizeBytes) ? file.sizeBytes : 0,
    sizeLabel: file.sizeLabel || "未知大小",
    createdAt: file.createdAt || formatDateTime(new Date()),
  };
}

function normalizeLog(log) {
  return {
    ...log,
    createdAt: log.createdAt || formatClock(new Date()),
  };
}

function normalizeDb(input) {
  const defaultDb = createDefaultDb();
  if (!input || typeof input !== "object") {
    return defaultDb;
  }

  const platforms = Array.isArray(input.platforms) ? input.platforms : defaultDb.platforms;
  const files = Array.isArray(input.files) ? input.files : defaultDb.files;
  const tasks = Array.isArray(input.tasks) ? input.tasks : defaultDb.tasks;
  const logs = Array.isArray(input.logs) ? input.logs : defaultDb.logs;

  return {
    platforms: platforms.map(normalizePlatform),
    files: files.map(normalizeFile),
    tasks: tasks.map(normalizeTask),
    logs: logs.map(normalizeLog),
  };
}

function isPlatformAuthorizationActive(platform) {
  if (!platform || !platform.connected) {
    return false;
  }

  const providerId = String(platform.providerId || platform.id || "").trim();
  if (providerId === "douyin") {
    if (!normalizeText(platform.refreshToken)) {
      return false;
    }

    if (platform.refreshTokenExpiresAt) {
      const refreshExpiresAt = new Date(platform.refreshTokenExpiresAt);
      if (!Number.isNaN(refreshExpiresAt.getTime()) && refreshExpiresAt.getTime() <= Date.now()) {
        return false;
      }
    }

    return true;
  }

  if (providerId === "bilibili") {
    if (!normalizeText(platform.accessToken)) {
      return false;
    }

    if (platform.expiresAt) {
      const expiresAt = new Date(platform.expiresAt);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
        return false;
      }
    }

    return true;
  }

  if (!platform.expiresAt) {
    return true;
  }

  const expiresAt = new Date(platform.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return true;
  }

  return expiresAt.getTime() > Date.now();
}

function publicPlatformView(platform) {
  if (!platform) {
    return null;
  }

  const view = clone(platform);
  delete view.accessToken;
  delete view.refreshToken;

  view.authReady = isPlatformAuthorizationActive(platform);
  const realProvider = view.providerId === "douyin" || view.providerId === "bilibili";
  view.authStatus = view.authReady
    ? "ready"
    : realProvider
      ? "waiting"
      : view.connected
        ? "connected"
        : "waiting";
  view.accessTokenHint =
    view.accessTokenHint || maskToken(platform.accessToken) || maskToken(platform.refreshToken);

  return view;
}

function loadDbFromDisk() {
  ensureStorage();

  if (!fs.existsSync(DB_FILE)) {
    const defaultDb = createDefaultDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
    return defaultDb;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    if (!raw.trim()) {
      const defaultDb = createDefaultDb();
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
      return defaultDb;
    }

    return normalizeDb(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to read db file, using seed data", error);
    const defaultDb = createDefaultDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), "utf8");
    return defaultDb;
  }
}

let db = loadDbFromDisk();

export function getDb() {
  return db;
}

export function reloadDb() {
  db = loadDbFromDisk();
  return db;
}

export function persistDb() {
  ensureStorage();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
  return db;
}

export function resetDb() {
  db = createDefaultDb();
  persistDb();
  clearUploadDirectory();
  return db;
}

export function clearUploadDirectory() {
  ensureStorage();
  for (const entry of fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })) {
    const entryPath = path.join(UPLOAD_DIR, entry.name);
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function addLog(message, level = "info") {
  db.logs.unshift({
    id: `log-${randomUUID()}`,
    title: message,
    level,
    createdAt: formatClock(new Date()),
  });

  db.logs = db.logs.slice(0, 50);
  persistDb();
  return clone(db.logs[0]);
}

export function computeSummary(snapshot = db) {
  const successCount = snapshot.tasks.filter((task) => task.status === "success").length;
  const failureCount = snapshot.tasks.filter((task) => task.status === "failed").length;
  const activeCount = snapshot.tasks.filter((task) =>
    ["queued", "publishing"].includes(task.status),
  ).length;
  const connectedPlatformCount = snapshot.platforms.filter((platform) =>
    isPlatformAuthorizationActive(platform),
  ).length;
  const selectedPlatformCount = snapshot.platforms.filter((platform) => platform.selected).length;
  const taskCount = snapshot.tasks.length;
  const successRate = taskCount ? Math.round((successCount / taskCount) * 100) : 0;

  return {
    taskCount,
    connectedPlatformCount,
    selectedPlatformCount,
    successRate,
    failureCount,
    activeCount,
    fileCount: snapshot.files.length,
  };
}

export function buildBootstrap() {
  const snapshot = clone(db);
  return {
    platforms: snapshot.platforms.map((platform) => publicPlatformView(platform)),
    files: snapshot.files,
    tasks: snapshot.tasks,
    logs: snapshot.logs,
    summary: computeSummary(snapshot),
  };
}

export function updatePlatform(platformId, patch = {}) {
  const platform = findPlatformRecord(platformId);
  if (!platform) {
    return null;
  }

  if (typeof patch.connected === "boolean") {
    platform.connected = patch.connected;
  }

  if (typeof patch.selected === "boolean") {
    platform.selected = patch.selected;
  }

  persistDb();
  return publicPlatformView(platform);
}

export function authorizePlatform(platformId, patch = {}) {
  const platform = findPlatformRecord(platformId);
  if (!platform) {
    return null;
  }

  platform.connected = true;
  platform.providerId =
    typeof patch.providerId === "string"
      ? patch.providerId
      : platform.providerId ||
        (platform.id === "douyin"
          ? "douyin"
          : platform.id === "bilibili"
            ? "bilibili"
            : "mock");
  platform.authMethod = String(patch.authMethod || platform.authMethod || "manual").trim();
  platform.accountName = String(
    patch.accountName || platform.accountName || `${platform.name} 账号`,
  ).trim();
  platform.accountId = String(patch.accountId || platform.accountId || "").trim();
  platform.openId = String(patch.openId || platform.openId || "").trim();
  platform.unionId = String(patch.unionId || platform.unionId || "").trim();
  platform.tokenType = String(patch.tokenType || platform.tokenType || "Bearer").trim();
  platform.scope = String(patch.scope || platform.scope || "").trim();
  platform.accessToken = String(patch.accessToken || platform.accessToken || "").trim();
  platform.refreshToken = String(patch.refreshToken || platform.refreshToken || "").trim();
  platform.accessTokenHint = String(
    patch.accessTokenHint || maskToken(platform.accessToken) || platform.accessTokenHint || "",
  ).trim();

  if (patch.touchAuthorizedAt !== false) {
    platform.authorizedAt = new Date().toISOString();
  }

  if (patch.expiresAt) {
    const expiresAt = new Date(patch.expiresAt);
    platform.expiresAt = Number.isNaN(expiresAt.getTime()) ? "" : expiresAt.toISOString();
  } else if (patch.expiresAt === "") {
    platform.expiresAt = "";
  }

  if (patch.refreshTokenExpiresAt) {
    const refreshTokenExpiresAt = new Date(patch.refreshTokenExpiresAt);
    platform.refreshTokenExpiresAt = Number.isNaN(refreshTokenExpiresAt.getTime())
      ? ""
      : refreshTokenExpiresAt.toISOString();
  } else if (patch.refreshTokenExpiresAt === "") {
    platform.refreshTokenExpiresAt = "";
  }

  platform.authNotes = String(patch.authNotes || platform.authNotes || "").trim();

  persistDb();
  return publicPlatformView(platform);
}

export function revokePlatform(platformId) {
  const platform = findPlatformRecord(platformId);
  if (!platform) {
    return null;
  }

  platform.connected = false;
  platform.accessTokenHint = "";
  platform.accessToken = "";
  platform.refreshToken = "";
  platform.accountId = "";
  platform.openId = "";
  platform.unionId = "";
  platform.tokenType = "";
  platform.scope = "";
  platform.expiresAt = "";
  platform.refreshTokenExpiresAt = "";
  platform.authNotes = platform.authNotes || "";

  persistDb();
  return publicPlatformView(platform);
}

export function listFiles() {
  return clone(db.files);
}

export function addFiles(fileRecords = []) {
  const added = [];
  const skipped = [];

  for (const fileRecord of fileRecords) {
    const existing = db.files.find(
      (file) =>
        file.name === fileRecord.name &&
        file.sizeBytes === fileRecord.sizeBytes &&
        file.mimeType === fileRecord.mimeType,
    );

    if (existing) {
      skipped.push(clone(existing));
      continue;
    }

    const normalized = {
      id: fileRecord.id || `file-${randomUUID()}`,
      name: fileRecord.name,
      originalName: fileRecord.originalName || fileRecord.name,
      sizeBytes: Number.isFinite(fileRecord.sizeBytes) ? fileRecord.sizeBytes : 0,
      sizeLabel: fileRecord.sizeLabel || "未知大小",
      mimeType: fileRecord.mimeType || "",
      storageName: fileRecord.storageName || "",
      storagePath: fileRecord.storagePath || "",
      downloadUrl: fileRecord.downloadUrl || "",
      createdAt: fileRecord.createdAt || formatDateTime(new Date()),
    };

    db.files.unshift(normalized);
    added.push(clone(normalized));
  }

  persistDb();
  return { added, skipped, files: clone(db.files) };
}

export function deleteFile(fileId) {
  const index = db.files.findIndex((file) => file.id === fileId);
  if (index === -1) {
    return null;
  }

  const [removed] = db.files.splice(index, 1);
  if (removed.storagePath && fs.existsSync(removed.storagePath)) {
    fs.rmSync(removed.storagePath, { force: true });
  }

  persistDb();
  return clone(removed);
}

export function listTasks() {
  return clone(db.tasks);
}

export function updateTask(taskId, patch = {}) {
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    return null;
  }

  Object.assign(task, patch);
  task.updatedAt = formatDateTime(new Date());
  persistDb();
  return clone(task);
}

export function createTaskRecord(input = {}) {
  const title = normalizeText(input.title);
  if (!title) {
    throw new Error("请先填写分发标题");
  }

  const platformIds = Array.isArray(input.platformIds)
    ? [...new Set(input.platformIds.filter(Boolean))]
    : [];
  const fileIds = Array.isArray(input.fileIds)
    ? [...new Set(input.fileIds.filter(Boolean))]
    : [];

  const platforms = db.platforms.filter((platform) => platformIds.includes(platform.id));
  const files = db.files.filter((file) => fileIds.includes(file.id));

  if (!platforms.length) {
    throw new Error("请至少选择一个目标平台");
  }

  if (!files.length) {
    throw new Error("请先上传至少一个素材文件");
  }

  const unauthorizedPlatforms = platforms.filter(
    (platform) => !isPlatformAuthorizationActive(platform),
  );

  if (unauthorizedPlatforms.length) {
    throw new Error(
      `以下平台尚未完成可发布授权：${unauthorizedPlatforms.map((platform) => platform.name).join(" / ")}`,
    );
  }

  const now = new Date();
  const normalizedPlatformIds = platforms.map((platform) => platform.id);
  const task = {
    id: generateTaskId(),
    title,
    platformIds: normalizedPlatformIds,
    platformNames: platforms.map((platform) => platform.name),
    status: "queued",
    progress: 12,
    createdAt: formatDateTime(now),
    updatedAt: formatDateTime(now),
    schedule: input.schedule ? formatDateTime(new Date(input.schedule)) : "立即发布",
    fileIds: files.map((file) => file.id),
    fileCount: files.length,
    owner: normalizeText(input.owner || "AI课程工厂"),
    summary: normalizeText(input.summary || ""),
    tags: normalizeText(input.tags || ""),
    mode: normalizeText(input.mode || "立即发布"),
    cover: normalizeText(input.cover || "自动提取封面"),
    platformOverrides: normalizePlatformOverrides(input.platformOverrides, normalizedPlatformIds),
    retryCount: 0,
    publishResults: [],
    lastPublishedAt: "",
    lastError: "",
  };

  db.tasks.unshift(task);
  persistDb();
  return clone(task);
}

export function retryTask(taskId) {
  const task = db.tasks.find((item) => item.id === taskId);
  if (!task) {
    return null;
  }

  task.status = "queued";
  task.progress = 18;
  task.retryCount = (task.retryCount || 0) + 1;
  task.updatedAt = formatDateTime(new Date());
  task.publishResults = [];
  task.lastPublishedAt = "";
  task.lastError = "";
  persistDb();
  return clone(task);
}

export function getPlatformById(platformId) {
  const platform = findPlatformRecord(platformId);
  return platform ? publicPlatformView(platform) : null;
}

export function getPlatformRecordById(platformId) {
  const platform = findPlatformRecord(platformId);
  return platform ? clone(platform) : null;
}

export function getTaskById(taskId) {
  const task = db.tasks.find((item) => item.id === taskId);
  return task ? clone(task) : null;
}

export function removeTaskTimers(taskId) {
  return taskId;
}

export { isPlatformAuthorizationActive, publicPlatformView, maskToken };

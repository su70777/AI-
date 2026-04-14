import fs from "node:fs/promises";
import path from "node:path";

const API_BASE_URL = (process.env.DOUYIN_API_BASE_URL || "https://open.douyin.com").replace(
  /\/+$/,
  "",
);
const CLIENT_KEY = String(process.env.DOUYIN_CLIENT_KEY || "").trim();
const CLIENT_SECRET = String(process.env.DOUYIN_CLIENT_SECRET || "").trim();
const DEFAULT_SCOPE = String(process.env.DOUYIN_SCOPE || "video.create").trim();
const DEFAULT_REDIRECT_URI = String(
  process.env.DOUYIN_REDIRECT_URI || "http://127.0.0.1:3001/oauth/douyin/callback",
).trim();
const UPLOAD_FIELD_NAME = String(process.env.DOUYIN_UPLOAD_FIELD_NAME || "video").trim() || "video";

function buildApiUrl(endpoint) {
  return new URL(endpoint, `${API_BASE_URL}/`);
}

function requireClientConfig() {
  if (!CLIENT_KEY || !CLIENT_SECRET) {
    throw new Error("请先配置 DOUYIN_CLIENT_KEY 和 DOUYIN_CLIENT_SECRET");
  }
}

function normalizeText(value) {
  return String(value || "").trim();
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

async function parseDouyinResponse(response, context) {
  const raw = await response.text();
  let payload = {};

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      throw new Error(`${context} 返回了非 JSON 响应`);
    }
  }

  const extra = payload.extra || {};
  const data = payload.data || {};
  const errorCode = Number(
    data.error_code ?? extra.error_code ?? payload.error_code ?? response.status ?? 0,
  );

  if (!response.ok || (errorCode && errorCode !== 0)) {
    const message =
      normalizeText(data.description) ||
      normalizeText(extra.description) ||
      `${context} 请求失败 (${response.status})`;

    const error = new Error(message);
    error.status = response.status;
    error.errorCode = errorCode;
    error.payload = payload;
    throw error;
  }

  return {
    data,
    extra,
    raw: payload,
  };
}

function normalizeTokenPayload(data = {}) {
  const expiresIn = Number(data.expires_in || data.access_token_expires_in || 0);
  const refreshExpiresIn = Number(
    data.refresh_expires_in || data.refresh_token_expires_in || data.refresh_token_expire_in || 0,
  );

  return {
    accessToken: normalizeText(data.access_token),
    refreshToken: normalizeText(data.refresh_token),
    openId: normalizeText(data.open_id),
    unionId: normalizeText(data.union_id),
    scope: normalizeText(data.scope),
    tokenType: normalizeText(data.token_type) || "Bearer",
    expiresIn,
    refreshExpiresIn,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : "",
    refreshTokenExpiresAt: refreshExpiresIn
      ? new Date(Date.now() + refreshExpiresIn * 1000).toISOString()
      : "",
    raw: data,
  };
}

export function isDouyinConfigured() {
  return Boolean(CLIENT_KEY && CLIENT_SECRET);
}

export function getDouyinClientConfig() {
  return {
    clientKey: CLIENT_KEY,
    clientSecret: CLIENT_SECRET,
    redirectUri: DEFAULT_REDIRECT_URI,
    scope: DEFAULT_SCOPE,
    apiBaseUrl: API_BASE_URL,
  };
}

export function buildDouyinOAuthUrl({
  state = "",
  scope = DEFAULT_SCOPE,
  redirectUri = DEFAULT_REDIRECT_URI,
} = {}) {
  if (!CLIENT_KEY) {
    throw new Error("请先配置 DOUYIN_CLIENT_KEY");
  }

  const url = buildApiUrl("/platform/oauth/connect/");
  url.searchParams.set("client_key", CLIENT_KEY);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope || DEFAULT_SCOPE);
  url.searchParams.set("redirect_uri", redirectUri || DEFAULT_REDIRECT_URI);

  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export async function exchangeDouyinAuthorizationCode(code) {
  requireClientConfig();

  const searchParams = new URLSearchParams({
    client_key: CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code: normalizeText(code),
  });

  const response = await fetch(buildApiUrl("/oauth/access_token/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: searchParams.toString(),
  });

  const payload = await parseDouyinResponse(response, "抖音授权换取 access_token");
  return normalizeTokenPayload(payload.data);
}

export async function refreshDouyinAccessToken(refreshToken) {
  requireClientConfig();

  const formData = new FormData();
  formData.append("client_key", CLIENT_KEY);
  formData.append("client_secret", CLIENT_SECRET);
  formData.append("refresh_token", normalizeText(refreshToken));

  const response = await fetch(buildApiUrl("/oauth/refresh_token/"), {
    method: "POST",
    body: formData,
  });

  const payload = await parseDouyinResponse(response, "抖音刷新 access_token");
  return normalizeTokenPayload(payload.data);
}

export function buildDouyinPostText(task = {}) {
  const parts = [];
  const title = normalizeText(task.title);
  const summary = normalizeText(task.summary);
  const tags = normalizeText(task.tags);

  if (title) {
    parts.push(title);
  }
  if (summary) {
    parts.push(summary);
  }
  if (tags) {
    parts.push(
      tags
        .split(/[，,]/)
        .map((item) => normalizeText(item))
        .filter(Boolean)
        .join(" "),
    );
  }

  return parts.filter(Boolean).join("\n").slice(0, 500);
}

export async function uploadDouyinVideo({
  accessToken,
  filePath,
  fileName,
  mimeType,
}) {
  if (!normalizeText(accessToken)) {
    throw new Error("抖音访问令牌缺失，无法上传视频");
  }

  const buffer = await fs.readFile(filePath);
  const formData = new FormData();
  const fileBlob = new Blob([buffer], {
    type: mimeType || "application/octet-stream",
  });

  formData.append(UPLOAD_FIELD_NAME, fileBlob, fileName || path.basename(filePath));

  const response = await fetch(buildApiUrl("/video/upload/"), {
    method: "POST",
    headers: {
      "access-token": accessToken,
    },
    body: formData,
  });

  const payload = await parseDouyinResponse(response, "抖音视频上传");
  const videoId =
    normalizeText(payload.data.video_id) ||
    normalizeText(payload.data.videoId) ||
    normalizeText(payload.data.item_id) ||
    normalizeText(payload.data.itemId);

  if (!videoId) {
    throw new Error("抖音视频上传成功，但未返回 video_id");
  }

  return {
    videoId,
    raw: payload.data,
  };
}

export async function createDouyinVideo({
  accessToken,
  videoId,
  text,
}) {
  if (!normalizeText(accessToken)) {
    throw new Error("抖音访问令牌缺失，无法创建视频");
  }

  const body = {
    video_id: normalizeText(videoId),
    text: normalizeText(text),
  };

  const response = await fetch(buildApiUrl("/video/create/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "access-token": accessToken,
    },
    body: JSON.stringify(body),
  });

  const payload = await parseDouyinResponse(response, "抖音创建视频");
  return {
    itemId: normalizeText(payload.data.item_id) || normalizeText(payload.data.itemId),
    raw: payload.data,
  };
}

export { maskToken };

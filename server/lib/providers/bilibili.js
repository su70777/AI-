import fs from "node:fs/promises";
import path from "node:path";

const PASSPORT_BASE_URL = String(process.env.BILIBILI_PASSPORT_BASE_URL || "https://passport.bilibili.com").replace(
  /\/+$/,
  "",
);
const API_BASE_URL = String(process.env.BILIBILI_API_BASE_URL || "https://api.bilibili.com").replace(
  /\/+$/,
  "",
);
const MEMBER_BASE_URL = String(process.env.BILIBILI_MEMBER_BASE_URL || "https://member.bilibili.com").replace(
  /\/+$/,
  "",
);
const OPENUPOS_BASE_URL = String(
  process.env.BILIBILI_OPENUPOS_BASE_URL || "https://openupos.bilivideo.com",
).replace(/\/+$/, "");

const CLIENT_ID = String(process.env.BILIBILI_CLIENT_ID || "").trim();
const CLIENT_SECRET = String(process.env.BILIBILI_CLIENT_SECRET || "").trim();
const DEFAULT_REDIRECT_URI = String(
  process.env.BILIBILI_REDIRECT_URI || "http://127.0.0.1:3001/oauth/bilibili/callback",
).trim();
const DEFAULT_SCOPE = String(process.env.BILIBILI_SCOPE || "").trim();
const AUTHORIZATION_URL = String(
  process.env.BILIBILI_AUTHORIZATION_URL || `${PASSPORT_BASE_URL}/oauth2/authorize`,
).trim();
const TOKEN_URL = String(
  process.env.BILIBILI_TOKEN_URL || `${API_BASE_URL}/x/account-oauth2/v1/token`,
).trim();
const ARC_INIT_URL = String(
  process.env.BILIBILI_ARC_INIT_URL || `${MEMBER_BASE_URL}/arcopen/fn/archive/video/init`,
).trim();
const ARC_UPLOAD_URL = String(
  process.env.BILIBILI_ARC_UPLOAD_URL || `${OPENUPOS_BASE_URL}/video/v2/part/upload`,
).trim();
const ARC_COMPLETE_URL = String(
  process.env.BILIBILI_ARC_COMPLETE_URL || `${MEMBER_BASE_URL}/arcopen/fn/archive/video/complete`,
).trim();
const ARC_COVER_URL = String(
  process.env.BILIBILI_ARC_COVER_URL || `${MEMBER_BASE_URL}/arcopen/fn/archive/cover/upload`,
).trim();
const ARC_SUBMIT_URL = String(
  process.env.BILIBILI_ARC_SUBMIT_URL || `${MEMBER_BASE_URL}/arcopen/fn/archive/add-by-utoken`,
).trim();
const DEFAULT_TID = Number.parseInt(process.env.BILIBILI_DEFAULT_TID || "75", 10) || 75;
const DEFAULT_CHUNK_SIZE =
  Number.parseInt(process.env.BILIBILI_UPLOAD_CHUNK_SIZE || "8388608", 10) || 8 * 1024 * 1024;

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

function buildUrl(baseUrl) {
  return new URL(baseUrl);
}

function requireClientConfig() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("请先配置 BILIBILI_CLIENT_ID 和 BILIBILI_CLIENT_SECRET");
  }
}

async function parseBilibiliResponse(response, context) {
  const raw = await response.text();
  let payload = {};

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`${context} 返回了非 JSON 响应`);
    }
  }

  const code = Number(payload.code ?? response.status ?? 0);
  if (!response.ok || code !== 0) {
    const message =
      normalizeText(payload.message) ||
      normalizeText(payload.msg) ||
      `${context} 请求失败 (${response.status})`;

    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    error.payload = payload;
    throw error;
  }

  return payload;
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

function buildFormDataFile(fileBuffer, fileName, mimeType) {
  const formData = new FormData();
  const blob = new Blob([fileBuffer], {
    type: mimeType || "application/octet-stream",
  });
  formData.append("file", blob, fileName);
  return formData;
}

function normalizeTagList(tags = "") {
  return normalizeText(tags)
    .split(/[，,、\s]+/)
    .map((tag) => normalizeText(tag))
    .filter(Boolean)
    .join(",");
}

export function isBilibiliConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

export function getBilibiliClientConfig() {
  return {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: DEFAULT_REDIRECT_URI,
    scope: DEFAULT_SCOPE,
    authorizationUrl: AUTHORIZATION_URL,
    tokenUrl: TOKEN_URL,
    defaultTid: DEFAULT_TID,
    chunkSize: DEFAULT_CHUNK_SIZE,
  };
}

export function buildBilibiliOAuthUrl({
  state = "",
  redirectUri = DEFAULT_REDIRECT_URI,
  scope = DEFAULT_SCOPE,
} = {}) {
  if (!CLIENT_ID) {
    throw new Error("请先配置 BILIBILI_CLIENT_ID");
  }

  const url = buildUrl(AUTHORIZATION_URL);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri || DEFAULT_REDIRECT_URI);

  if (scope) {
    url.searchParams.set("scope", scope);
  }

  if (state) {
    url.searchParams.set("state", state);
  }

  return url.toString();
}

export async function exchangeBilibiliAuthorizationCode(code) {
  requireClientConfig();

  const url = buildUrl(TOKEN_URL);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("client_secret", CLIENT_SECRET);
  url.searchParams.set("grant_type", "authorization_code");
  url.searchParams.set("code", normalizeText(code));

  const response = await fetch(url, {
    method: "POST",
  });

  const payload = await parseBilibiliResponse(response, "B站授权换取 access_token");
  return normalizeTokenPayload(payload.data || {});
}

export function buildBilibiliDescription(task = {}) {
  const parts = [];
  const title = normalizeText(task.title);
  const summary = normalizeText(task.summary);

  if (title) {
    parts.push(title);
  }

  if (summary) {
    parts.push(summary);
  }

  return parts.filter(Boolean).join("\n").slice(0, 2000);
}

export function buildBilibiliTags(task = {}) {
  return normalizeTagList(task.tags).slice(0, 200);
}

export function getBilibiliDefaultTid() {
  return DEFAULT_TID;
}

export async function uploadBilibiliVideo({
  accessToken,
  filePath,
  fileName,
  mimeType,
  chunkSize = DEFAULT_CHUNK_SIZE,
}) {
  if (!normalizeText(accessToken)) {
    throw new Error("B站访问令牌缺失，无法上传视频");
  }

  const uploadName = normalizeText(fileName) || path.basename(filePath);
  const initUrl = buildUrl(ARC_INIT_URL);
  initUrl.searchParams.set("client_id", CLIENT_ID);
  initUrl.searchParams.set("access_token", accessToken);

  const initResponse = await fetch(initUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify({ name: uploadName }),
  });

  const initPayload = await parseBilibiliResponse(initResponse, "B站视频上传预处理");
  const uploadToken = normalizeText(initPayload.data?.upload_token);
  if (!uploadToken) {
    throw new Error("B站视频上传预处理成功，但未返回 upload_token");
  }

  const buffer = await fs.readFile(filePath);
  const safeChunkSize = Math.max(1024 * 1024, Number(chunkSize) || DEFAULT_CHUNK_SIZE);
  let partNumber = 1;

  for (let offset = 0; offset < buffer.length; offset += safeChunkSize) {
    const part = buffer.subarray(offset, Math.min(offset + safeChunkSize, buffer.length));
    const uploadUrl = buildUrl(ARC_UPLOAD_URL);
    uploadUrl.searchParams.set("upload_token", uploadToken);
    uploadUrl.searchParams.set("part_number", String(partNumber));

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: part,
    });

    await parseBilibiliResponse(uploadResponse, `B站视频分片上传 #${partNumber}`);
    partNumber += 1;
  }

  const completeUrl = buildUrl(ARC_COMPLETE_URL);
  completeUrl.searchParams.set("upload_token", uploadToken);

  const completeResponse = await fetch(completeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: "",
  });

  await parseBilibiliResponse(completeResponse, "B站视频上传合片");

  return {
    uploadToken,
    partCount: partNumber - 1,
    raw: initPayload.data || {},
  };
}

export async function uploadBilibiliCover({
  accessToken,
  filePath,
  fileName,
  mimeType,
}) {
  if (!normalizeText(accessToken)) {
    throw new Error("B站访问令牌缺失，无法上传封面");
  }

  const coverName = normalizeText(fileName) || path.basename(filePath);
  const buffer = await fs.readFile(filePath);
  const uploadUrl = buildUrl(ARC_COVER_URL);
  uploadUrl.searchParams.set("client_id", CLIENT_ID);
  uploadUrl.searchParams.set("access_token", accessToken);

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: buildFormDataFile(buffer, coverName, mimeType || "image/png"),
  });

  const payload = await parseBilibiliResponse(response, "B站封面上传");
  const coverUrl = normalizeText(payload.data?.url);

  if (!coverUrl) {
    throw new Error("B站封面上传成功，但未返回 url");
  }

  return {
    coverUrl,
    raw: payload.data || {},
  };
}

export async function submitBilibiliArchive({
  accessToken,
  uploadToken,
  title,
  coverUrl,
  desc,
  tags,
  tid = DEFAULT_TID,
  noReprint = 1,
  copyright = 1,
  source = "",
}) {
  if (!normalizeText(accessToken)) {
    throw new Error("B站访问令牌缺失，无法提交稿件");
  }

  const submitUrl = buildUrl(ARC_SUBMIT_URL);
  submitUrl.searchParams.set("client_id", CLIENT_ID);
  submitUrl.searchParams.set("access_token", accessToken);
  submitUrl.searchParams.set("upload_token", uploadToken);

  const body = {
    title: normalizeText(title),
    cover: normalizeText(coverUrl),
    tid: Number(tid) || DEFAULT_TID,
    no_reprint: Number(noReprint) || 1,
    desc: normalizeText(desc),
    tag: normalizeTagList(tags),
    copyright: Number(copyright) || 1,
    source: normalizeText(source),
  };

  const response = await fetch(submitUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  const payload = await parseBilibiliResponse(response, "B站视频稿件提交");
  const resourceId = normalizeText(payload.data?.resource_id);

  if (!resourceId) {
    throw new Error("B站稿件提交成功，但未返回 resource_id");
  }

  return {
    resourceId,
    raw: payload.data || {},
  };
}

export { maskToken };

function normalizeText(value) {
  return String(value || "").trim();
}

const PUBLIC_BASE_URL = normalizeText(process.env.PUBLIC_SERVER_URL || process.env.APP_FRONTEND_URL);

function normalizeTags(tags = "") {
  return normalizeText(tags)
    .split(/[，,、\s]+/)
    .map((tag) => normalizeText(tag))
    .filter(Boolean);
}

function buildPublicUrl(downloadUrl) {
  const url = normalizeText(downloadUrl);
  if (!url || /^https?:\/\//i.test(url) || !PUBLIC_BASE_URL) {
    return url;
  }

  try {
    return new URL(url, PUBLIC_BASE_URL).toString();
  } catch {
    return url;
  }
}

async function readJsonSafely(response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export function buildBridgePayload({ task, platform, files = [], providerId }) {
  return {
    providerId,
    platform: {
      id: platform.id,
      name: platform.name,
      accountName: platform.accountName || "",
      accountId: platform.accountId || "",
    },
    task: {
      id: task.id,
      title: task.title,
      summary: task.summary || "",
      tags: normalizeTags(task.tags),
      tagsText: normalizeText(task.tags),
      schedule: task.schedule || "",
      mode: task.mode || "",
      cover: task.cover || "",
      platformOverride: task.platformOverride || {},
    },
    files: files.map((file) => ({
      id: file.id,
      name: file.name,
      originalName: file.originalName || file.name,
      mimeType: file.mimeType || "",
      sizeBytes: file.sizeBytes || 0,
      sizeLabel: file.sizeLabel || "",
      storageName: file.storageName || "",
      storagePath: file.storagePath || "",
      downloadUrl: file.downloadUrl || "",
      publicUrl: buildPublicUrl(file.downloadUrl),
    })),
    createdAt: new Date().toISOString(),
  };
}

export async function publishViaWebhookBridge({
  endpoint,
  apiKey,
  providerId,
  platform,
  task,
  files,
  missingMessage,
}) {
  const targetUrl = normalizeText(endpoint);
  if (!targetUrl) {
    return {
      providerId,
      platformId: platform.id,
      platformName: platform.name,
      publishMode: "bridge-missing",
      status: "skipped",
      message: missingMessage || `${platform.name} 尚未配置发布桥接接口`,
    };
  }

  const headers = {
    "Content-Type": "application/json",
  };

  const secret = normalizeText(apiKey);
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }

  const response = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(buildBridgePayload({ task, platform, files, providerId })),
  });
  const payload = await readJsonSafely(response);

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.raw ||
      `${platform.name} 桥接接口返回 ${response.status}`;
    throw new Error(message);
  }

  return {
    providerId,
    platformId: platform.id,
    platformName: platform.name,
    publishMode: "webhook-bridge",
    status: "success",
    externalId: payload?.id || payload?.data?.id || payload?.noteId || payload?.publishId || "",
    response: payload,
  };
}

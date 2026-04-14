import { getTaskById, getPlatformRecordById, getDb, authorizePlatform, updateTask } from "./store.js";
import {
  buildDouyinPostText,
  createDouyinVideo,
  refreshDouyinAccessToken,
  uploadDouyinVideo,
} from "./providers/douyin.js";
import {
  buildBilibiliDescription,
  buildBilibiliTags,
  getBilibiliDefaultTid,
  submitBilibiliArchive,
  uploadBilibiliCover,
  uploadBilibiliVideo,
} from "./providers/bilibili.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getSelectedFiles(task) {
  const fileIds = Array.isArray(task?.fileIds) ? task.fileIds : [];
  return getDb().files.filter((file) => fileIds.includes(file.id));
}

function pickPrimaryVideoFile(files) {
  if (!Array.isArray(files) || !files.length) {
    return null;
  }

  return (
    files.find((file) => String(file.mimeType || "").startsWith("video/")) ||
    files[0] ||
    null
  );
}

function pickCoverImageFile(files) {
  if (!Array.isArray(files) || !files.length) {
    return null;
  }

  return (
    files.find((file) => String(file.mimeType || "").startsWith("image/")) ||
    null
  );
}

function isAuthExpired(platform) {
  if (!platform?.expiresAt) {
    return false;
  }

  const expiresAt = new Date(platform.expiresAt);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
}

async function getValidDouyinAccessToken(platform) {
  if (!platform) {
    throw new Error("抖音平台信息不存在");
  }

  if (platform.accessToken && !isAuthExpired(platform)) {
    return {
      accessToken: platform.accessToken,
      platform,
      refreshed: false,
    };
  }

  if (!platform.refreshToken) {
    throw new Error("抖音授权已失效，请重新完成官方授权");
  }

  if (platform.refreshTokenExpiresAt) {
    const refreshExpiresAt = new Date(platform.refreshTokenExpiresAt);
    if (!Number.isNaN(refreshExpiresAt.getTime()) && refreshExpiresAt.getTime() <= Date.now()) {
      throw new Error("抖音 refresh_token 已过期，请重新完成官方授权");
    }
  }

  const refreshed = await refreshDouyinAccessToken(platform.refreshToken);
  const updatedPlatform = authorizePlatform(platform.id, {
    authMethod: "oauth",
    accountName: platform.accountName,
    accountId: platform.accountId || refreshed.openId,
    openId: refreshed.openId,
    unionId: refreshed.unionId,
    tokenType: refreshed.tokenType,
    scope: refreshed.scope,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || platform.refreshToken,
    accessTokenHint: refreshed.accessToken,
    expiresAt: refreshed.expiresAt,
    refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt || platform.refreshTokenExpiresAt,
    authNotes: platform.authNotes,
    touchAuthorizedAt: false,
  });

  return {
    accessToken: refreshed.accessToken,
    platform: updatedPlatform,
    refreshed: true,
  };
}

async function publishToDouyin(task, platform, file) {
  const tokenState = await getValidDouyinAccessToken(platform);
  const caption = buildDouyinPostText(task);
  const uploadResult = await uploadDouyinVideo({
    accessToken: tokenState.accessToken,
    filePath: file.storagePath,
    fileName: file.originalName || file.name,
    mimeType: file.mimeType,
  });

  const createResult = await createDouyinVideo({
    accessToken: tokenState.accessToken,
    videoId: uploadResult.videoId,
    text: caption,
  });

  return {
    providerId: "douyin",
    platformId: platform.id,
    platformName: platform.name,
    publishMode: tokenState.refreshed ? "refreshed-token" : "oauth",
    videoId: uploadResult.videoId,
    itemId: createResult.itemId,
    status: "success",
  };
}

async function publishToBilibili(task, platform, videoFile, coverFile) {
  if (!platform?.accessToken) {
    throw new Error("B站平台尚未完成授权");
  }

  if (!coverFile) {
    throw new Error("B站投稿需要封面图片，请先上传一张图片素材");
  }

  const uploadResult = await uploadBilibiliVideo({
    accessToken: platform.accessToken,
    filePath: videoFile.storagePath,
    fileName: videoFile.originalName || videoFile.name,
    mimeType: videoFile.mimeType,
  });

  const coverResult = await uploadBilibiliCover({
    accessToken: platform.accessToken,
    filePath: coverFile.storagePath,
    fileName: coverFile.originalName || coverFile.name,
    mimeType: coverFile.mimeType,
  });

  const submitResult = await submitBilibiliArchive({
    accessToken: platform.accessToken,
    uploadToken: uploadResult.uploadToken,
    title: task.title,
    coverUrl: coverResult.coverUrl,
    desc: buildBilibiliDescription(task) || task.title,
    tags: buildBilibiliTags(task),
    tid: getBilibiliDefaultTid(),
    noReprint: 1,
    copyright: 1,
    source: "",
  });

  return {
    providerId: "bilibili",
    platformId: platform.id,
    platformName: platform.name,
    publishMode: "oauth",
    uploadToken: uploadResult.uploadToken,
    coverUrl: coverResult.coverUrl,
    resourceId: submitResult.resourceId,
    status: "success",
  };
}

async function publishToMockPlatform(platform) {
  await delay(300);
  return {
    providerId: platform.providerId || "mock",
    platformId: platform.id,
    platformName: platform.name,
    publishMode: "mock",
    status: "simulated",
  };
}

export async function publishTask(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error("任务不存在");
  }

  const files = getSelectedFiles(task);
  const primaryVideoFile = pickPrimaryVideoFile(files);
  const coverImageFile = pickCoverImageFile(files);
  const results = [];

  for (const platformId of task.platformIds || []) {
    const platform = getPlatformRecordById(platformId);
    if (!platform) {
      results.push({
        platformId,
        status: "skipped",
        message: "平台不存在",
      });
      continue;
    }

    if (platform.providerId === "douyin") {
      if (!primaryVideoFile) {
        throw new Error("抖音发布需要至少一个视频素材");
      }

      if (!platform.connected) {
        throw new Error("抖音平台尚未完成授权");
      }

      const result = await publishToDouyin(task, platform, primaryVideoFile);
      results.push(result);
      continue;
    }

    if (platform.providerId === "bilibili") {
      if (!primaryVideoFile) {
        throw new Error("B站投稿需要至少一个视频素材");
      }

      const result = await publishToBilibili(task, platform, primaryVideoFile, coverImageFile);
      results.push(result);
      continue;
    }

    const result = await publishToMockPlatform(platform);
    results.push(result);
  }

  updateTask(taskId, {
    publishResults: results,
    lastPublishedAt: new Date().toISOString(),
    lastError: "",
  });

  return {
    results,
    realCount: results.filter((item) => item.status === "success").length,
    simulatedCount: results.filter((item) => item.status === "simulated").length,
    skippedCount: results.filter((item) => item.status === "skipped").length,
  };
}

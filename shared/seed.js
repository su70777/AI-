import {
  DEFAULT_CONNECTED_PLATFORM_IDS,
  DEFAULT_SELECTED_PLATFORM_IDS,
  PLATFORM_CATALOG,
} from "./constants.js";
import { formatBytes, formatClock, formatDateTime } from "./format.js";

function minutesAgo(baseTime, minutes) {
  return new Date(baseTime - minutes * 60 * 1000);
}

function makeFile(id, name, sizeBytes, minutesBeforeNow, mimeType) {
  const createdAt = minutesBeforeNow
    ? formatDateTime(minutesAgo(Date.now(), minutesBeforeNow))
    : formatDateTime(new Date());

  return {
    id,
    name,
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
    mimeType,
    createdAt,
  };
}

function makeTask({
  id,
  title,
  platformIds,
  status,
  progress,
  minutesBeforeNow,
  schedule,
  fileIds,
  owner,
  summary = "",
  tags = "",
  mode = "立即发布",
  cover = "自动提取封面",
  retryCount = 0,
  publishResults = [],
  lastPublishedAt = "",
  lastError = "",
}) {
  const createdAt = formatDateTime(minutesAgo(Date.now(), minutesBeforeNow));
  return {
    id,
    title,
    platformIds,
    platformNames: platformIds
      .map((platformId) => PLATFORM_CATALOG.find((platform) => platform.id === platformId)?.name)
      .filter(Boolean),
    status,
    progress,
    createdAt,
    updatedAt: createdAt,
    schedule,
    fileIds,
    fileCount: fileIds.length,
    owner,
    summary,
    tags,
    mode,
    cover,
    retryCount,
    publishResults,
    lastPublishedAt,
    lastError,
  };
}

function makeLog(title, minutesBeforeNow) {
  return {
    id: `log-${Math.random().toString(36).slice(2, 10)}`,
    title,
    createdAt: formatClock(minutesAgo(Date.now(), minutesBeforeNow)),
  };
}

export function createDefaultDb() {
  return {
    platforms: PLATFORM_CATALOG.map((platform) => ({
      ...platform,
      providerId:
        platform.id === "douyin"
          ? "douyin"
          : platform.id === "bilibili"
            ? "bilibili"
            : "mock",
      connected: DEFAULT_CONNECTED_PLATFORM_IDS.includes(platform.id),
      selected: DEFAULT_SELECTED_PLATFORM_IDS.includes(platform.id),
      authMethod:
        platform.id === "bilibili"
          ? ""
          : DEFAULT_CONNECTED_PLATFORM_IDS.includes(platform.id)
            ? "demo"
            : "",
      accountName:
        platform.id === "bilibili"
          ? ""
          : DEFAULT_CONNECTED_PLATFORM_IDS.includes(platform.id)
            ? `${platform.name} 示例账号`
            : "",
      accountId: "",
      accessToken: "",
      refreshToken: "",
      openId: "",
      unionId: "",
      tokenType: "",
      scope: "",
      accessTokenHint: "",
      authorizedAt: DEFAULT_CONNECTED_PLATFORM_IDS.includes(platform.id)
        ? new Date().toISOString()
        : "",
      expiresAt: "",
      refreshTokenExpiresAt: "",
      authNotes: "",
    })),
    files: [
      makeFile("file-1", "AI公开课第三期成片.mp4", 1288490188, 38, "video/mp4"),
      makeFile("file-2", "封面图标准版.png", 4865392, 34, "image/png"),
    ],
    tasks: [
      makeTask({
        id: "TASK-20260410-01",
        title: "AI绘画公开课 · 第三讲",
        platformIds: ["douyin", "wechat", "redbook"],
        status: "success",
        progress: 100,
        minutesBeforeNow: 70,
        schedule: "立即发布",
        fileIds: ["file-1", "file-2"],
        owner: "内容运营",
        summary: "统一输出 AI 绘画课程成片。",
        tags: "AI课程, 课程工厂",
        mode: "立即发布",
        cover: "自动提取封面",
        publishResults: [
          { platformId: "douyin", status: "success", publishMode: "mock" },
          { platformId: "wechat", status: "success", publishMode: "mock" },
          { platformId: "redbook", status: "success", publishMode: "mock" },
        ],
        lastPublishedAt: formatDateTime(minutesAgo(Date.now(), 70)),
      }),
      makeTask({
        id: "TASK-20260410-02",
        title: "课程引流短片 · 春季班",
        platformIds: ["douyin", "kuaishou"],
        status: "publishing",
        progress: 62,
        minutesBeforeNow: 45,
        schedule: "2026-04-10 10:00",
        fileIds: ["file-1"],
        owner: "课程运营",
        summary: "引流短片用于拉新。",
        tags: "短视频, 引流",
        mode: "定时发布",
        cover: "平台自适应",
      }),
      makeTask({
        id: "TASK-20260410-03",
        title: "英语启蒙栏目 · 试看片",
        platformIds: ["wechat", "bilibili"],
        status: "failed",
        progress: 78,
        minutesBeforeNow: 20,
        schedule: "立即发布",
        fileIds: ["file-2"],
        owner: "教研",
        summary: "试看片段用于课程推广。",
        tags: "英语启蒙, 试看片",
        mode: "先审后发",
        cover: "上传指定封面",
        lastError: "B站接口返回参数校验失败",
      }),
    ],
    logs: [
      makeLog("英语启蒙栏目 · 试看片在 B站 发布失败，已标记可重试。", 19),
      makeLog("课程引流短片 · 春季班 已进入平台分发队列。", 45),
      makeLog("AI绘画公开课 · 第三讲已完成 3 个平台发布。", 69),
    ],
  };
}

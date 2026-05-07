import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import {
  addLog,
  getDb,
  getPlatformRecordById,
  getTaskById,
  updateTask,
} from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..", "..");
const LEGACY_ASSISTANT_PROFILE_DIR = path.join(ROOT_DIR, "server", "data", "publish-assistant-browser");
const ASSISTANT_PROFILE_DIR =
  process.env.PUBLISH_ASSISTANT_PROFILE_DIR ||
  path.join(
    process.env.LOCALAPPDATA || os.tmpdir(),
    "AicgDistributionAssistant",
    "publish-assistant-browser",
  );

const BROWSER_CANDIDATES = [
  process.env.PUBLISH_ASSISTANT_BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const TARGETS = {
  douyin: {
    label: "抖音",
    url: "https://creator.douyin.com/creator-micro/content/upload",
    videoInputSelectors: [
      'input[type="file"][accept*="video"]',
      'input[type="file"][accept*=".mp4"]',
      'input[type="file"][accept*=".mov"]',
      'input[type="file"]',
    ],
    coverInputSelectors: [
      'input[type="file"][accept*="image"]',
      'input[type="file"][accept*=".jpg"]',
      'input[type="file"][accept*=".jpeg"]',
      'input[type="file"][accept*=".png"]',
    ],
    uploadTriggerSelectors: [
      'button:has-text("上传视频")',
      'div:has-text("上传视频")',
      'span:has-text("上传视频")',
      'button:has-text("点击上传")',
      '[role="button"]:has-text("上传")',
      'label:has-text("上传")',
    ],
    titleSelectors: [
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      'input[maxlength][type="text"]',
      '[contenteditable="true"][aria-label*="标题"]',
    ],
    summarySelectors: [
      'textarea[placeholder*="简介"]',
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="添加作品描述"]',
      '[contenteditable="true"]',
    ],
    successUrlKeywords: ["/creator-micro/content/manage", "/creator-micro/content/detail"],
  },
  bilibili: {
    label: "B站",
    url: "https://member.bilibili.com/platform/upload/video/frame",
    videoInputSelectors: [
      'input[type="file"][accept*="video"]',
      'input[type="file"][accept*=".mp4"]',
      'input[type="file"][accept*=".mov"]',
      'input[type="file"]',
    ],
    coverInputSelectors: [
      'input[type="file"][accept*="image"]',
      'input[type="file"][accept*=".jpg"]',
      'input[type="file"][accept*=".jpeg"]',
      'input[type="file"][accept*=".png"]',
    ],
    uploadTriggerSelectors: [
      'button:has-text("上传视频")',
      'div:has-text("上传视频")',
      'span:has-text("上传视频")',
      '[role="button"]:has-text("上传视频")',
      'button:has-text("上传")',
      '[class*="upload"]:has-text("上传")',
    ],
    titleSelectors: [
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      '[contenteditable="true"][aria-label*="标题"]',
    ],
    summarySelectors: [
      'textarea[placeholder*="简介"]',
      'textarea[placeholder*="描述"]',
      '[contenteditable="true"]',
    ],
    successUrlKeywords: ["/platform/upload-manager", "/platform/upload/video/manager"],
  },
  redbook: {
    label: "小红书",
    url: "https://creator.xiaohongshu.com/publish/publish",
    videoInputSelectors: [
      'input[type="file"][accept*="video"]',
      'input[type="file"][accept*=".mp4"]',
      'input[type="file"]',
    ],
    coverInputSelectors: [
      'input[type="file"][accept*="image"]',
      'input[type="file"][accept*=".jpg"]',
      'input[type="file"][accept*=".jpeg"]',
      'input[type="file"][accept*=".png"]',
    ],
    uploadTriggerSelectors: [
      'button:has-text("上传视频")',
      'div:has-text("上传视频")',
      '[role="button"]:has-text("上传")',
    ],
    titleSelectors: [
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      '[contenteditable="true"]',
    ],
    summarySelectors: [
      'textarea[placeholder*="正文"]',
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="内容"]',
      '[contenteditable="true"]',
    ],
    successUrlKeywords: ["/publish/success", "/creator/post", "/creator/home"],
  },
  wechat_channels: {
    label: "视频号",
    url: "https://channels.weixin.qq.com/platform/post/create",
    videoInputSelectors: [
      'input[type="file"][accept*="video"]',
      'input[type="file"][accept*=".mp4"]',
      'input[type="file"]',
    ],
    coverInputSelectors: [
      'input[type="file"][accept*="image"]',
      'input[type="file"][accept*=".jpg"]',
      'input[type="file"][accept*=".jpeg"]',
      'input[type="file"][accept*=".png"]',
    ],
    uploadTriggerSelectors: [
      'button:has-text("上传视频")',
      'div:has-text("上传视频")',
      'span:has-text("上传视频")',
      'button:has-text("上传")',
      '[role="button"]:has-text("上传")',
    ],
    titleSelectors: [
      'input[placeholder*="标题"]',
      'textarea[placeholder*="标题"]',
      '[contenteditable="true"][aria-label*="标题"]',
    ],
    summarySelectors: [
      'textarea[placeholder*="描述"]',
      'textarea[placeholder*="正文"]',
      '[contenteditable="true"]',
    ],
    successUrlKeywords: ["/platform/post/list", "/platform/post/manage"],
  },
};

const COMMON_VIDEO_UPLOAD_SELECTORS = [
  'input[type="file"][accept*="video"]',
  'input[type="file"][accept*=".mp4"]',
  'input[type="file"][accept*=".mov"]',
  'input[type="file"]',
];
const COMMON_UPLOAD_TRIGGER_SELECTORS = [
  'button:has-text("上传视频")',
  'div:has-text("上传视频")',
  'span:has-text("上传视频")',
  'button:has-text("点击上传")',
  '[role="button"]:has-text("上传")',
  'label:has-text("上传")',
];
const COMMON_TITLE_SELECTORS = [
  'input[placeholder*="标题"]',
  'textarea[placeholder*="标题"]',
  '[contenteditable="true"][aria-label*="标题"]',
  '[contenteditable="true"][data-placeholder*="标题"]',
  '[role="textbox"][aria-label*="标题"]',
];
const COMMON_SUMMARY_SELECTORS = [
  'textarea[placeholder*="简介"]',
  'textarea[placeholder*="描述"]',
  'textarea[placeholder*="正文"]',
  'textarea[placeholder*="内容"]',
  'textarea[placeholder*="添加"]',
  '[contenteditable="true"][aria-label*="描述"]',
  '[contenteditable="true"][aria-label*="正文"]',
  '[contenteditable="true"][data-placeholder*="描述"]',
  '[contenteditable="true"][data-placeholder*="正文"]',
  '[role="textbox"][contenteditable="true"]',
];
const COMMON_PUBLISH_KEYWORDS = ["发布", "提交", "投稿", "确认发布", "立即发布", "发布笔记", "发布作品"];
const COMMON_SUCCESS_KEYWORDS = ["发布成功", "发布完成", "投稿成功", "提交成功", "已发布", "审核中"];
const COMMON_FAILED_KEYWORDS = ["发布失败", "提交失败", "上传失败", "网络异常", "请求失败", "请重试"];

for (const target of Object.values(TARGETS)) {
  target.videoInputSelectors = [...COMMON_VIDEO_UPLOAD_SELECTORS, ...(target.videoInputSelectors || [])];
  target.uploadTriggerSelectors = [...COMMON_UPLOAD_TRIGGER_SELECTORS, ...(target.uploadTriggerSelectors || [])];
  target.titleSelectors = [...COMMON_TITLE_SELECTORS, ...(target.titleSelectors || [])];
  target.summarySelectors = [...COMMON_SUMMARY_SELECTORS, ...(target.summarySelectors || [])];
}

const PUBLISH_CLICK_KEYWORDS = [
  ...COMMON_PUBLISH_KEYWORDS,
  "发布",
  "提交",
  "投稿",
  "确认发布",
  "立即发布",
  "发布笔记",
  "发布作品",
];
const SUCCESS_KEYWORDS = ["发布成功", "发布完成", "投稿成功", "提交成功", "已发布", "审核中"];
const FAILED_KEYWORDS = ["发布失败", "提交失败", "上传失败", "网络异常", "请求失败", "请重试"];

const ASSISTANT_WATCH_INTERVAL_MS = Math.max(
  3000,
  Number(process.env.ASSISTANT_WATCH_INTERVAL_MS || 5000),
);
const ASSISTANT_AUTO_SUCCESS_AFTER_CLICK_MS = Math.max(
  8000,
  Number(process.env.ASSISTANT_AUTO_SUCCESS_AFTER_CLICK_MS || 20000),
);
const ASSISTANT_AUTO_SUCCESS_WITHOUT_SIGNAL_MS = Math.max(
  60000,
  Number(process.env.ASSISTANT_AUTO_SUCCESS_WITHOUT_SIGNAL_MS || 120000),
);
const ASSISTANT_STALE_SYNC_MS = Math.max(
  60000,
  Number(process.env.ASSISTANT_STALE_SYNC_MS || 120000),
);
const ASSISTANT_WATCH_TIMEOUT_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.ASSISTANT_WATCH_TIMEOUT_MS || 45 * 60 * 1000),
);
const ASSISTANT_AUTOFILL_RETRY_MS = Math.max(
  2000,
  Number(process.env.ASSISTANT_AUTOFILL_RETRY_MS || 4000),
);

let browserContextPromise = null;
const assistantTaskWatchers = new Map();
const assistantPlatformPages = new Map();
const externalAssistantWatchers = new Map();

const FINAL_RESULT_STATUSES = new Set(["success", "failed", "skipped", "simulated"]);

function isSamePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function hasBrowserProfileData(profileDir) {
  return (
    fs.existsSync(path.join(profileDir, "Local State")) &&
    fs.existsSync(path.join(profileDir, "Default", "Network", "Cookies"))
  );
}

function shouldSkipProfileFile(sourcePath) {
  const name = path.basename(sourcePath).toLowerCase();
  return (
    name === "lockfile" ||
    name.endsWith("-journal") ||
    name.endsWith(".tmp") ||
    sourcePath.toLowerCase().includes(`${path.sep}browsermetrics${path.sep}`)
  );
}

function migrateLegacyAssistantProfile() {
  if (isSamePath(LEGACY_ASSISTANT_PROFILE_DIR, ASSISTANT_PROFILE_DIR)) return;
  if (!hasBrowserProfileData(LEGACY_ASSISTANT_PROFILE_DIR)) return;

  const targetHasProfile = hasBrowserProfileData(ASSISTANT_PROFILE_DIR);
  const markerPath = path.join(ASSISTANT_PROFILE_DIR, ".migrated-from-legacy-profile");
  if (targetHasProfile && fs.existsSync(markerPath)) return;

  fs.mkdirSync(path.dirname(ASSISTANT_PROFILE_DIR), { recursive: true });
  fs.cpSync(LEGACY_ASSISTANT_PROFILE_DIR, ASSISTANT_PROFILE_DIR, {
    recursive: true,
    force: true,
    filter: (sourcePath) => !shouldSkipProfileFile(sourcePath),
  });
  fs.writeFileSync(markerPath, new Date().toISOString(), "utf8");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function splitTags(value) {
  return normalizeText(value)
    .split(/[\s,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasKeyword(text, keywords) {
  if (!text) return false;
  const source = String(text).toLowerCase();
  return (keywords || []).some((keyword) => source.includes(String(keyword || "").toLowerCase()));
}

function isFinalStatus(status) {
  return status === "success" || status === "failed" || status === "skipped";
}

function isFinalResultStatus(status) {
  return FINAL_RESULT_STATUSES.has(String(status || "").trim().toLowerCase());
}

function parseLooseDateTime(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const normalized = text.replace(/\//g, "-");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeTaskStatus(items = []) {
  if (!items.length) return "failed";
  const activeItems = items.filter((item) => item.status !== "skipped");
  if (!activeItems.length) return "failed";
  if (activeItems.every((item) => item.status === "success")) return "success";
  if (activeItems.some((item) => item.status === "failed") && activeItems.every((item) => isFinalStatus(item.status))) {
    return "failed";
  }
  return "publishing";
}

function computeTaskProgress(items = []) {
  if (!items.length) return 0;
  const total = items.length;
  const successCount = items.filter((item) => item.status === "success").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const skippedCount = items.filter((item) => item.status === "skipped").length;
  const doneWeight = successCount + failedCount * 0.8 + skippedCount * 0.6;
  const ratio = Math.min(1, doneWeight / total);
  return Math.max(12, Math.min(100, 72 + Math.round(28 * ratio)));
}

function toPersistedPublishResult(item) {
  return {
    platformId: item.platformId,
    platformName: item.platformName,
    providerId: item.providerId,
    publishMode: "local-assistant",
    status: item.status,
    message: item.message,
  };
}

function getPlatformOverride(task, platformId) {
  const override = task?.platformOverrides?.[platformId];
  return override && typeof override === "object" && !Array.isArray(override) ? override : {};
}

function getTargetForPlatform(platform) {
  return TARGETS[platform?.providerId] || TARGETS[platform?.id] || null;
}

function getAssistantBrowserPath() {
  return BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || "";
}

function getSelectedFiles(task) {
  const ids = new Set(Array.isArray(task?.fileIds) ? task.fileIds : []);
  return getDb().files.filter((file) => ids.has(file.id));
}

function pickVideoFile(files) {
  return files.find((file) => String(file.mimeType || "").startsWith("video/")) || null;
}

function pickCoverFile(files) {
  return files.find((file) => String(file.mimeType || "").startsWith("image/")) || null;
}

function buildPlatformContent(task, platform) {
  const override = getPlatformOverride(task, platform.id);
  const tags = splitTags(override.tags || override.topics || task.tags);
  const summary = normalizeText(override.summary) || normalizeText(task.summary);

  return {
    title: normalizeText(override.title) || normalizeText(task.title),
    summary,
    tags,
    caption: [summary, tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)).join(" ")]
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildLocalPublishAssistantPlan(taskId) {
  const task = getTaskById(taskId);
  if (!task) {
    throw new Error("任务不存在");
  }

  const files = getSelectedFiles(task);
  const videoFile = pickVideoFile(files);
  const coverFile = pickCoverFile(files);

  const items = (task.platformIds || [])
    .map((platformId) => getPlatformRecordById(platformId))
    .filter(Boolean)
    .map((platform) => {
      const target = getTargetForPlatform(platform);
      const content = buildPlatformContent(task, platform);

      return {
        platformId: platform.id,
        providerId: platform.providerId || platform.id,
        platformName: platform.name,
        targetLabel: target?.label || platform.name,
        url: target?.url || "",
        canAutomate: Boolean(target),
        content,
        files: {
          video: videoFile
            ? {
                id: videoFile.id,
                name: videoFile.name,
                path: videoFile.storagePath,
                mimeType: videoFile.mimeType,
              }
            : null,
          cover: coverFile
            ? {
                id: coverFile.id,
                name: coverFile.name,
                path: coverFile.storagePath,
                mimeType: coverFile.mimeType,
              }
            : null,
        },
      };
    });

  return {
    taskId: task.id,
    title: task.title,
    mode: "local-publish-assistant",
    requiresManualConfirm: false,
    items,
  };
}

async function getBrowserContext() {
  if (browserContextPromise) {
    return browserContextPromise;
  }

  const executablePath = getAssistantBrowserPath();
  if (!executablePath) {
    throw new Error("未找到可用浏览器，请先安装 Microsoft Edge 或 Chrome。");
  }

  migrateLegacyAssistantProfile();
  fs.mkdirSync(ASSISTANT_PROFILE_DIR, { recursive: true });
  browserContextPromise = chromium
    .launchPersistentContext(ASSISTANT_PROFILE_DIR, {
      executablePath,
      headless: false,
      viewport: null,
      args: ["--start-maximized"],
    })
    .then((context) => {
      context.on("close", () => {
        browserContextPromise = null;
        assistantPlatformPages.clear();
      });
      return context;
    });

  return browserContextPromise;
}

function getAssistantPageKey(item) {
  const providerId = String(item?.providerId || item?.platformId || "")
    .trim()
    .toLowerCase();
  const platformId = String(item?.platformId || "")
    .trim()
    .toLowerCase();
  return `${providerId}:${platformId}`;
}

const WECHAT_PROVIDER_IDS = new Set(["wechat_channels", "wechat"]);
const WECHAT_DOMAIN = "channels.weixin.qq.com";
const WECHAT_LOGIN_HINTS = [
  "\u626b\u7801\u767b\u5f55",
  "\u5fae\u4fe1\u626b\u7801\u767b\u5f55",
  "\u89c6\u9891\u53f7\u52a9\u624b",
  "\u8bf7\u4f7f\u7528\u5fae\u4fe1\u626b\u7801\u767b\u5f55",
  "\u7ba1\u7406\u5458\u5fae\u4fe1",
];

function isWechatProvider(item) {
  const providerId = String(item?.providerId || item?.platformId || "")
    .trim()
    .toLowerCase();
  return WECHAT_PROVIDER_IDS.has(providerId);
}

function isWechatDomain(url) {
  return String(url || "").toLowerCase().includes(WECHAT_DOMAIN);
}

function hasWechatLoginHint(text) {
  const source = String(text || "").replace(/\s+/g, "");
  if (!source) return false;
  return WECHAT_LOGIN_HINTS.some((keyword) => source.includes(keyword));
}

async function shouldSkipWechatGoto(pageReuse, page, item) {
  if (!pageReuse?.reused || !isWechatProvider(item) || !page || page.isClosed()) {
    return false;
  }

  const currentUrl = String(page.url() || "").toLowerCase();
  if (!isWechatDomain(currentUrl)) {
    return false;
  }

  if (!currentUrl.includes("/platform/post/create")) {
    return false;
  }

  const bodyText = await page
    .evaluate(() => String(document?.body?.innerText || "").slice(0, 8000))
    .catch(() => "");
  if (!bodyText.trim()) {
    return false;
  }

  return !hasWechatLoginHint(bodyText);
}

async function getOrCreateAssistantPage(context, item) {
  const key = getAssistantPageKey(item);
  const existing = assistantPlatformPages.get(key);
  if (existing && !existing.isClosed() && existing.context() === context) {
    return { page: existing, reused: true };
  }
  if (existing && existing.isClosed()) {
    assistantPlatformPages.delete(key);
  }

  const page = await context.newPage();
  assistantPlatformPages.set(key, page);
  page.on("close", () => {
    if (assistantPlatformPages.get(key) === page) {
      assistantPlatformPages.delete(key);
    }
  });
  return { page, reused: false };
}

async function countLocator(locator) {
  try {
    return await locator.count();
  } catch {
    return 0;
  }
}

async function tryFill(page, selectors, value) {
  const text = normalizeText(value);
  if (!text) return { filled: false, selector: "" };

  for (const selector of selectors || []) {
    const locator = page.locator(selector);
    const total = await countLocator(locator);
    if (!total) continue;

    for (let index = 0; index < Math.min(total, 8); index += 1) {
      const field = locator.nth(index);
      try {
        const visible = await field.isVisible().catch(() => false);
        if (!visible) continue;

        await field.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {});
        await field.fill(text, { timeout: 2500 });
        return { filled: true, selector };
      } catch {
        // Fallback: some rich text inputs reject fill(), use keyboard typing.
        try {
          await field.click({ timeout: 1500 });
          await field.press("Control+A").catch(() => {});
          await field.press("Meta+A").catch(() => {});
          await field.press("Backspace").catch(() => {});
          await page.keyboard.type(text, { delay: 6 });
          return { filled: true, selector };
        } catch {
          continue;
        }
      }
    }
  }

  return { filled: false, selector: "" };
}

async function trySmartFill(page, value, kind = "summary") {
  const text = normalizeText(value);
  if (!text || !page || page.isClosed()) return { filled: false, selector: "" };

  const filledByDom = await page
    .evaluate(
      ({ inputText, inputKind }) => {
        const normalize = (value) => String(value || "").replace(/\s+/g, "").trim();
        const isVisible = (el) => {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 50 && rect.height > 18;
        };
        const setValue = (el, nextValue) => {
          el.focus?.();
          if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
            if (el.disabled || el.readOnly) return false;
            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
            if (setter) setter.call(el, nextValue);
            else el.value = nextValue;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
          if (el.isContentEditable) {
            el.textContent = nextValue;
            el.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextValue, inputType: "insertText" }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
          }
          return false;
        };
        const titleHints = ["标题", "题目", "作品名称", "稿件标题", "视频标题"];
        const summaryHints = ["简介", "描述", "正文", "内容", "文案", "说明", "添加描述", "视频描述"];
        const fields = Array.from(document.querySelectorAll("input, textarea, [contenteditable='true'], [role='textbox']"))
          .filter(isVisible)
          .map((el, index) => {
            const hint = normalize([
              el.getAttribute("placeholder"),
              el.getAttribute("aria-label"),
              el.getAttribute("data-placeholder"),
              el.getAttribute("name"),
              el.getAttribute("id"),
              el.className,
            ].join(" "));
            const tag = el.tagName;
            const type = String(el.type || "").toLowerCase();
            const isTextInput = tag === "INPUT" && !["file", "hidden", "checkbox", "radio", "button", "submit"].includes(type);
            const editable = tag === "TEXTAREA" || isTextInput || el.isContentEditable || el.getAttribute("role") === "textbox";
            return { el, index, hint, tag, isTextInput, editable };
          })
          .filter((item) => item.editable);

        const hints = inputKind === "title" ? titleHints : summaryHints;
        const preferred = fields
          .map((item) => {
            let score = 0;
            if (hints.some((hint) => item.hint.includes(hint))) score += 20;
            if (inputKind === "title" && item.isTextInput) score += 6;
            if (inputKind === "summary" && item.tag === "TEXTAREA") score += 8;
            if (inputKind === "summary" && item.el.isContentEditable) score += 7;
            if (inputKind === "title" && item.tag === "TEXTAREA") score -= 4;
            if (item.hint.includes("搜索") || item.hint.includes("search")) score -= 30;
            return { ...item, score };
          })
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score);

        for (const item of preferred) {
          if (setValue(item.el, inputText)) return true;
        }
        return false;
      },
      { inputText: text, inputKind: kind },
    )
    .catch(() => false);

  return filledByDom ? { filled: true, selector: `__smart_${kind}__` } : { filled: false, selector: "" };
}

async function tryFillAnyEditor(page, value) {
  const text = normalizeText(value);
  if (!text) return { filled: false, selector: "" };

  const preferred = [
    ...COMMON_SUMMARY_SELECTORS,
    'textarea[placeholder*="添加描述"]',
    'textarea[placeholder*="视频描述"]',
    'textarea[placeholder*="描述"]',
    'textarea[placeholder*="正文"]',
    '[contenteditable="true"][data-placeholder*="添加描述"]',
    '[contenteditable="true"][aria-label*="描述"]',
    '[role="textbox"][contenteditable="true"]',
    "textarea",
    '[contenteditable="true"]',
  ];

  const direct = await tryFill(page, preferred, text);
  if (direct.filled) return direct;

  const editors = page.locator('textarea,[contenteditable="true"],[role="textbox"]');
  const total = await countLocator(editors);
  for (let index = 0; index < Math.min(total, 12); index += 1) {
    const field = editors.nth(index);
    try {
      const visible = await field.isVisible().catch(() => false);
      if (!visible) continue;
      await field.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {});
      await field.click({ timeout: 1500 });
      await field.press("Control+A").catch(() => {});
      await field.press("Meta+A").catch(() => {});
      await field.press("Backspace").catch(() => {});
      await page.keyboard.type(text, { delay: 6 });
      return { filled: true, selector: "__any_editor__" };
    } catch {
      continue;
    }
  }

  return { filled: false, selector: "" };
}

async function fillWechatDescription(page, value) {
  const text = normalizeText(value);
  if (!text || !page || page.isClosed()) return { filled: false, selector: "" };

  const preferredSelectors = [
    'textarea[placeholder*="\\u6dfb\\u52a0\\u63cf\\u8ff0"]',
    'textarea[placeholder*="\\u89c6\\u9891\\u63cf\\u8ff0"]',
    'textarea[placeholder*="\\u63cf\\u8ff0"]',
    '[contenteditable="true"][data-placeholder*="\\u6dfb\\u52a0\\u63cf\\u8ff0"]',
    '[contenteditable="true"][aria-label*="\\u63cf\\u8ff0"]',
    '[role="textbox"][contenteditable="true"]',
  ];

  const direct = await tryFill(page, preferredSelectors, text);
  if (direct.filled) return direct;

  const probed = await page
    .evaluate(({ inputText }) => {
      const normalize = (value) => String(value || "").replace(/\s+/g, "").trim();
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 40 && rect.height > 20;
      };

      const setValue = (el, nextValue) => {
        if (!el) return false;
        el.focus?.();
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
          if (el.disabled || el.readOnly) return false;
          el.value = nextValue;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        if (el.isContentEditable) {
          el.innerHTML = "";
          el.textContent = nextValue;
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextValue, inputType: "insertText" }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        return false;
      };

      const labels = Array.from(document.querySelectorAll("label,span,div,p,h3,h4"));
      const descLabel = labels.find((el) => {
        const text = normalize(el.textContent);
        return text.includes("视频描述") || text.includes("添加描述") || text === "描述";
      });

      const roots = [];
      if (descLabel) {
        if (descLabel.parentElement) roots.push(descLabel.parentElement);
        const block = descLabel.closest("section,form,article,div");
        if (block) roots.push(block);
      }
      roots.push(document.body);

      const seen = new Set();
      for (const root of roots) {
        if (!root || seen.has(root)) continue;
        seen.add(root);
        const fields = Array.from(
          root.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"],input[type="text"]'),
        );
        for (const field of fields) {
          if (!isVisible(field)) continue;
          const hint = normalize(
            field.getAttribute("placeholder") ||
              field.getAttribute("aria-label") ||
              field.getAttribute("data-placeholder") ||
              "",
          );
          const likelyDesc =
            hint.includes("描述") ||
            hint.includes("添加描述") ||
            hint.includes("正文") ||
            field.tagName === "TEXTAREA" ||
            field.getAttribute("role") === "textbox";
          if (!likelyDesc) continue;
          if (setValue(field, inputText)) return true;
        }
      }
      return false;
    }, { inputText: text })
    .catch(() => false);

  if (probed) return { filled: true, selector: "__wechat_description_probe__" };
  return { filled: false, selector: "" };
}

async function tryUploadFile(page, filePath, preferredKind) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { uploaded: false, reason: "file-not-found" };
  }

  const inputs = page.locator('input[type="file"]');
  const count = await countLocator(inputs);
  const candidates = [];

  for (let index = 0; index < count; index += 1) {
    const input = inputs.nth(index);
    try {
      const disabled = await input.isDisabled().catch(() => false);
      if (disabled) continue;
      const accept = String((await input.getAttribute("accept").catch(() => "")) || "").toLowerCase();
      const visible = await input.isVisible().catch(() => false);

      const scoreByKind =
        preferredKind === "video"
          ? accept.includes("video") || accept.includes(".mp4") || accept.includes(".mov")
            ? 4
            : accept.includes("image")
              ? -1
              : 1
          : accept.includes("image") || accept.includes(".jpg") || accept.includes(".jpeg") || accept.includes(".png")
            ? 4
            : accept.includes("video")
              ? -1
              : 1;
      if (scoreByKind < 0) continue;

      candidates.push({
        input,
        index,
        accept,
        score: scoreByKind + (visible ? 1 : 0),
      });
    } catch {
      continue;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    try {
      await candidate.input.setInputFiles(filePath, { timeout: 10000 });
      return { uploaded: true, index: candidate.index, accept: candidate.accept };
    } catch {
      continue;
    }
  }

  return { uploaded: false, reason: "file-input-not-found" };
}

async function tryUploadFileBySelectors(page, selectors = [], filePath) {
  if (!filePath || !fs.existsSync(filePath) || !Array.isArray(selectors) || !selectors.length) {
    return { uploaded: false, reason: "selector-not-found" };
  }

  for (const selector of selectors) {
    if (!selector) continue;
    const input = page.locator(selector).first();
    if (!(await countLocator(input))) continue;
    try {
      await input.setInputFiles(filePath, { timeout: 12000 });
      return { uploaded: true, selector };
    } catch {
      continue;
    }
  }

  return { uploaded: false, reason: "selector-not-found" };
}

async function tryUploadByFileChooser(page, triggerSelectors = [], filePath) {
  if (!filePath || !fs.existsSync(filePath) || !Array.isArray(triggerSelectors) || !triggerSelectors.length) {
    return { uploaded: false, reason: "trigger-not-found" };
  }

  for (const triggerSelector of triggerSelectors) {
    if (!triggerSelector) continue;
    const trigger = page.locator(triggerSelector).first();
    if (!(await countLocator(trigger))) continue;

    try {
      const chooserPromise = page.waitForEvent("filechooser", { timeout: 2800 }).catch(() => null);
      await trigger.click({ timeout: 2500 }).catch(() => {});
      const chooser = await chooserPromise;
      if (!chooser) continue;
      await chooser.setFiles(filePath);
      return { uploaded: true, selector: triggerSelector };
    } catch {
      continue;
    }
  }

  return { uploaded: false, reason: "trigger-not-found" };
}

function createEmptyFilledState() {
  return {
    title: false,
    summary: false,
    video: false,
    cover: false,
  };
}

function getPendingAutofillFields(filled) {
  const map = {
    video: "video",
    title: "title",
    summary: "summary",
  };
  return Object.entries(map)
    .filter(([key]) => !filled?.[key])
    .map(([, label]) => label);
}

async function applyPendingAutofill(item, options = {}) {
  const page = item?.page;
  const target = item?.target || {};
  const content = item?.content || {};
  const files = item?.files || {};
  const waitAfterUploadMs = Number(options.waitAfterUploadMs || 1800);
  const waitAfterAutofillMs = Number(options.waitAfterAutofillMs || 0);
  const nextFilled = { ...createEmptyFilledState(), ...(item?.filled || {}) };
  let changed = false;

  if (!page || page.isClosed()) {
    return { filled: nextFilled, changed };
  }

  if (!nextFilled.video && files.video?.path) {
    const bySelector = await tryUploadFileBySelectors(page, target.videoInputSelectors || [], files.video.path);
    let uploaded = bySelector.uploaded;
    if (!uploaded) {
      const byChooser = await tryUploadByFileChooser(page, target.uploadTriggerSelectors || [], files.video.path);
      uploaded = byChooser.uploaded;
    }
    if (!uploaded) {
      const generic = await tryUploadFile(page, files.video.path, "video");
      uploaded = generic.uploaded;
    }

    if (uploaded) {
      nextFilled.video = true;
      changed = true;
      await page.waitForTimeout(waitAfterUploadMs);
    }
  }

  if (!nextFilled.title && content.title) {
    let titleFill = await tryFill(page, target.titleSelectors || [], content.title);
    if (!titleFill.filled) {
      titleFill = await trySmartFill(page, content.title, "title");
    }
    if (titleFill.filled) {
      nextFilled.title = true;
      changed = true;
    }
  }

  if (!nextFilled.summary) {
    const summaryText = content.caption || content.summary || content.title || "";
    if (summaryText) {
      let summaryFill = await tryFill(page, target.summarySelectors || [], summaryText);
      if (!summaryFill.filled && isWechatProvider(item)) {
        summaryFill = await fillWechatDescription(page, summaryText);
      }
      if (!summaryFill.filled && isWechatProvider(item)) {
        summaryFill = await tryFillAnyEditor(page, summaryText);
      }
      if (!summaryFill.filled) {
        summaryFill = await trySmartFill(page, summaryText, "summary");
      }
      if (summaryFill.filled) {
        nextFilled.summary = true;
        changed = true;
      }
    }
  }

  if (!nextFilled.cover && files.cover?.path) {
    const bySelector = await tryUploadFileBySelectors(page, target.coverInputSelectors || [], files.cover.path);
    let uploaded = bySelector.uploaded;
    if (!uploaded) {
      const generic = await tryUploadFile(page, files.cover.path, "image");
      uploaded = generic.uploaded;
    }
    if (uploaded) {
      nextFilled.cover = true;
      changed = true;
    }
  }

  if (changed && waitAfterAutofillMs > 0) {
    await page.waitForTimeout(waitAfterAutofillMs);
  }

  return { filled: nextFilled, changed };
}

async function installPublishClickTracker(page) {
  if (!page || page.isClosed()) return;
  await page
    .evaluate(
      ({ clickKeywords }) => {
        if (window.__assistantPublishTrackerInstalled) return;

        window.__assistantPublishTrackerInstalled = true;
        window.__assistantPublishClickState = {
          clickedAt: 0,
          clickedText: "",
          clickCount: 0,
        };

        const normalize = (value) => String(value || "").replace(/\s+/g, "").trim();
        const keywords = Array.isArray(clickKeywords) ? clickKeywords : [];

        document.addEventListener(
          "click",
          (event) => {
            const target = event.target?.closest?.("button,[role='button'],a,div,span");
            if (!target) return;
            const text = normalize(target.innerText || target.textContent || "");
            if (!text) return;
            if (!keywords.some((keyword) => text.includes(keyword))) return;
            const previous = window.__assistantPublishClickState || {};
            window.__assistantPublishClickState = {
              clickedAt: Date.now(),
              clickedText: text.slice(0, 60),
              clickCount: Number(previous.clickCount || 0) + 1,
            };
          },
          true,
        );
      },
      { clickKeywords: PUBLISH_CLICK_KEYWORDS },
    )
    .catch(() => {});
}

async function readPublishSignals(page) {
  if (!page || page.isClosed()) {
    return { closed: true, url: "", bodyText: "", clickState: null };
  }

  const [url, bodyText, clickState] = await Promise.all([
    Promise.resolve(page.url()).catch(() => ""),
    page.evaluate(() => String(document?.body?.innerText || "").slice(0, 12000)).catch(() => ""),
    page.evaluate(() => window.__assistantPublishClickState || null).catch(() => null),
  ]);

  return {
    closed: false,
    url: String(url || "").toLowerCase(),
    bodyText: String(bodyText || "").toLowerCase(),
    clickState:
      clickState && typeof clickState === "object"
        ? {
            clickedAt: Number(clickState.clickedAt || 0),
            clickedText: String(clickState.clickedText || ""),
            clickCount: Number(clickState.clickCount || 0),
          }
        : null,
  };
}

async function automateItem(context, item) {
  const target = TARGETS[item.providerId] || TARGETS[item.platformId];
  if (!target || !item.url) {
    return {
      ...item,
      status: "skipped",
      message: "当前平台暂未配置发布页。",
      _page: null,
      _target: target || null,
      clickedAt: 0,
      clickText: "",
      filled: createEmptyFilledState(),
      lastAutofillAt: 0,
    };
  }

  const pageReuse = await getOrCreateAssistantPage(context, item);
  const page = pageReuse.page;
  const result = {
    ...item,
    status: "publishing",
    message: "发布页已打开，正在自动填充内容。",
    filled: createEmptyFilledState(),
    lastAutofillAt: 0,
    _page: page,
    _target: target,
    clickedAt: 0,
    clickText: "",
  };

  try {
    await page.bringToFront().catch(() => {});
    const skipGoto = await shouldSkipWechatGoto(pageReuse, page, item);
    if (skipGoto) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
    } else {
      await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    }
  } catch (error) {
    result.message = `发布页已打开，但加载较慢：${error.message}`;
  }

  await installPublishClickTracker(page);
  await page.waitForTimeout(2200);

  const autofill = await applyPendingAutofill(result, {
    waitAfterUploadMs: 1800,
    waitAfterAutofillMs: 150,
  });
  result.filled = autofill.filled;
  result.lastAutofillAt = Date.now();

  const pendingFields = getPendingAutofillFields(result.filled);
  result.message = pendingFields.length
    ? `发布页已打开，等待登录后继续自动填充（待补充：${pendingFields.join("、")}）。`
    : pageReuse.reused
      ? "已复用该平台已登录页面并完成自动填充，请点击平台发布按钮。"
      : "自动填充完成，请点击平台发布按钮。";

  return result;
}

function openWithSystemBrowser(url) {
  if (!url) return;
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(command, [url], { detached: true, stdio: "ignore" }).unref();
}

function stopTaskWatcher(taskId) {
  const watcher = assistantTaskWatchers.get(taskId);
  if (!watcher) return;
  clearInterval(watcher.timer);
  assistantTaskWatchers.delete(taskId);
}

function stopExternalWatcher(taskId) {
  const watcher = externalAssistantWatchers.get(taskId);
  if (!watcher) return;
  clearInterval(watcher.timer);
  externalAssistantWatchers.delete(taskId);
}

function startExternalAutofillWatcher(taskId, taskTitle, trackedItems) {
  stopExternalWatcher(taskId);

  const watcher = {
    taskId,
    taskTitle,
    items: trackedItems,
    startedAt: Date.now(),
    busy: false,
    timer: null,
  };

  const tick = async () => {
    if (watcher.busy) return;
    watcher.busy = true;
    try {
      const now = Date.now();
      for (const item of watcher.items) {
        if (!item || item.page?.isClosed?.()) continue;
        const pendingFields = getPendingAutofillFields(item.filled || createEmptyFilledState());
        if (!pendingFields.length) continue;
        if (now - Number(item.lastAutofillAt || 0) < ASSISTANT_AUTOFILL_RETRY_MS) continue;
        const autofill = await applyPendingAutofill(item, {
          waitAfterUploadMs: 1200,
          waitAfterAutofillMs: 100,
        });
        item.filled = autofill.filled;
        item.lastAutofillAt = now;
      }

      const allFilled = watcher.items.every((item) => {
        const pendingFields = getPendingAutofillFields(item.filled || createEmptyFilledState());
        return !pendingFields.length;
      });
      const timedOut = now - watcher.startedAt >= ASSISTANT_WATCH_TIMEOUT_MS;
      if (allFilled || timedOut) {
        stopExternalWatcher(taskId);
      }
    } finally {
      watcher.busy = false;
    }
  };

  watcher.timer = setInterval(() => {
    tick().catch(() => {});
  }, ASSISTANT_WATCH_INTERVAL_MS);
  externalAssistantWatchers.set(taskId, watcher);
  tick().catch(() => {});
}

function persistWatcherState(taskId, items, options = {}) {
  const taskStatus = computeTaskStatus(items);
  const failedCount = items.filter((item) => item.status === "failed").length;
  const activeItems = items.filter((item) => item.status !== "skipped");
  const allSuccess = activeItems.length > 0 && activeItems.every((item) => item.status === "success");

  updateTask(taskId, {
    status: taskStatus,
    progress: taskStatus === "success" ? 100 : computeTaskProgress(items),
    publishResults: items.map(toPersistedPublishResult),
    lastPublishedAt: taskStatus === "success" ? new Date().toISOString() : "",
    lastError:
      taskStatus === "publishing"
        ? "发布助手运行中，等待平台回执。"
        : taskStatus === "failed"
          ? failedCount
            ? `有 ${failedCount} 个平台返回发布失败。`
            : "发布未成功，请重试。"
          : "",
  });

  if (options.finalLog) {
    addLog(
      allSuccess
        ? `任务 ${options.taskTitle || taskId} 已自动同步为发布成功。`
        : taskStatus === "failed"
          ? `任务 ${options.taskTitle || taskId} 自动同步完成，存在失败平台。`
          : `任务 ${options.taskTitle || taskId} 自动同步结束，仍有平台未回执。`,
      allSuccess ? "info" : "warn",
    );
  }
}

async function updateTrackedItemStatus(item, now = Date.now()) {
  if (!item || isFinalStatus(item.status)) return;

  await installPublishClickTracker(item.page);
  const signals = await readPublishSignals(item.page);

  if (signals.clickState?.clickedAt && signals.clickState.clickedAt > (item.clickedAt || 0)) {
    item.clickedAt = signals.clickState.clickedAt;
    item.clickText = signals.clickState.clickedText || "发布";
  }

  const pendingBeforeAutofill = getPendingAutofillFields(item.filled || createEmptyFilledState());
  const shouldRetryAutofill =
    !signals.closed &&
    pendingBeforeAutofill.length > 0 &&
    now - Number(item.lastAutofillAt || 0) >= ASSISTANT_AUTOFILL_RETRY_MS;
  if (shouldRetryAutofill) {
    const autofill = await applyPendingAutofill(item, {
      waitAfterUploadMs: 1200,
      waitAfterAutofillMs: 100,
    });
    item.filled = autofill.filled;
    item.lastAutofillAt = now;
  }

  const successUrlKeywords = item.target?.successUrlKeywords || [];
  const hitFailedByText = hasKeyword(signals.bodyText, FAILED_KEYWORDS);
  const hitSuccessByText = hasKeyword(signals.bodyText, SUCCESS_KEYWORDS);
  const hitSuccessByUrl = hasKeyword(signals.url, successUrlKeywords);

  if (hitFailedByText) {
    item.status = "failed";
    item.message = "检测到平台返回失败提示，请在平台页检查详情。";
    return;
  }

  if (hitSuccessByText || hitSuccessByUrl) {
    item.status = "success";
    item.message = "检测到平台发布成功回执，已自动同步。";
    return;
  }

  if (signals.closed) {
    item.status = "success";
    item.message = item.clickedAt
      ? "检测到发布后页面关闭，已自动同步成功。"
      : "检测到页面已关闭，已自动同步成功。";
    return;
  }

  if (item.clickedAt && now - item.clickedAt >= ASSISTANT_AUTO_SUCCESS_AFTER_CLICK_MS) {
    item.status = "success";
    item.message = `检测到已点击“${item.clickText || "发布"}”，自动同步成功。`;
    return;
  }

  if (now - Number(item.startedAt || now) >= ASSISTANT_AUTO_SUCCESS_WITHOUT_SIGNAL_MS) {
    item.status = "success";
    item.message = "平台已运行超过自动确认阈值，默认同步为发布成功。";
    return;
  }

  const pendingFields = getPendingAutofillFields(item.filled || createEmptyFilledState());
  item.status = "publishing";
  if (item.clickedAt) {
    item.message = `已点击“${item.clickText || "发布"}”，等待平台回执。`;
    return;
  }
  if (pendingFields.length) {
    item.message = `等待登录后继续自动填充（待补充：${pendingFields.join("、")}）。`;
    return;
  }
  item.message = "自动填充完成，请点击平台发布按钮。";
}

function startTaskWatcher(taskId, taskTitle, trackedItems) {
  stopTaskWatcher(taskId);

  const watcher = {
    taskId,
    taskTitle,
    items: trackedItems,
    startedAt: Date.now(),
    busy: false,
    timer: null,
  };

  const tick = async () => {
    if (watcher.busy) return;
    watcher.busy = true;
    try {
      const task = getTaskById(taskId);
      if (!task) {
        stopTaskWatcher(taskId);
        return;
      }

      const now = Date.now();
      for (const item of watcher.items) {
        await updateTrackedItemStatus(item, now);
      }

      persistWatcherState(taskId, watcher.items);

      const allFinal = watcher.items.every((item) => isFinalStatus(item.status));
      const timedOut = now - watcher.startedAt >= ASSISTANT_WATCH_TIMEOUT_MS;
      if (allFinal || timedOut) {
        if (timedOut && !allFinal) {
          const hasDetectedFailure = watcher.items.some((item) => item.status === "failed");
          watcher.items.forEach((item) => {
            if (!isFinalStatus(item.status)) {
              item.status = hasDetectedFailure ? "failed" : "success";
              item.message = hasDetectedFailure
                ? "等待平台回执超时，请重试该任务。"
                : "等待平台回执超时，默认同步为发布成功。";
            }
          });
        }
        persistWatcherState(taskId, watcher.items, { finalLog: true, taskTitle });
        stopTaskWatcher(taskId);
      }
    } finally {
      watcher.busy = false;
    }
  };

  watcher.timer = setInterval(() => {
    tick().catch(() => {});
  }, ASSISTANT_WATCH_INTERVAL_MS);
  assistantTaskWatchers.set(taskId, watcher);
  tick().catch(() => {});
}

export async function launchAssistantPlan(inputPlan = {}) {
  const plan = {
    taskId: String(inputPlan.taskId || "").trim(),
    title: String(inputPlan.title || "Local Assistant Task").trim(),
    mode: String(inputPlan.mode || "local-publish-assistant").trim(),
    requiresManualConfirm: Boolean(inputPlan.requiresManualConfirm),
    items: Array.isArray(inputPlan.items) ? inputPlan.items : [],
  };

  if (!plan.items.length) {
    throw new Error("No assistant items provided.");
  }

  const context = await getBrowserContext();
  const results = await Promise.all(plan.items.map((item) => automateItem(context, item)));

  const trackedItems = results.map((item) => ({
    platformId: item.platformId,
    platformName: item.platformName,
    providerId: item.providerId,
    status: item.status,
    message: item.message,
    page: item._page || null,
    target: item._target || null,
    content: item.content || {},
    files: item.files || {},
    filled: { ...createEmptyFilledState(), ...(item.filled || {}) },
    lastAutofillAt: Number(item.lastAutofillAt || 0),
    clickedAt: Number(item.clickedAt || 0),
    clickText: item.clickText || "",
    startedAt: Date.now(),
  }));
  startExternalAutofillWatcher(plan.taskId || `external-${Date.now()}`, plan.title, trackedItems);

  return {
    ...plan,
    results: results.map((item) => ({
      platformId: item.platformId,
      platformName: item.platformName,
      providerId: item.providerId,
      status: item.status,
      message: item.message,
      filled: item.filled,
    })),
  };
}

export async function launchLocalPublishAssistant(taskId) {
  const plan = buildLocalPublishAssistantPlan(taskId);
  stopTaskWatcher(taskId);

  updateTask(taskId, {
    status: "publishing",
    progress: 64,
    lastError: "",
  });

  try {
    const context = await getBrowserContext();
    const results = await Promise.all(plan.items.map((item) => automateItem(context, item)));

    const trackedItems = results.map((item) => ({
      platformId: item.platformId,
      platformName: item.platformName,
      providerId: item.providerId,
      status: item.status,
      message: item.message,
      page: item._page || null,
      target: item._target || null,
      content: item.content || {},
      files: item.files || {},
      filled: { ...createEmptyFilledState(), ...(item.filled || {}) },
      lastAutofillAt: Number(item.lastAutofillAt || 0),
      clickedAt: Number(item.clickedAt || 0),
      clickText: item.clickText || "",
      startedAt: Date.now(),
    }));

    persistWatcherState(taskId, trackedItems);
    startTaskWatcher(taskId, plan.title, trackedItems);
    addLog(`本机发布助手已打开 ${results.length} 个平台发布页：${plan.title}`);

    return {
      ...plan,
      results: results.map((item) => ({
        platformId: item.platformId,
        platformName: item.platformName,
        providerId: item.providerId,
        status: item.status,
        message: item.message,
        filled: item.filled,
      })),
    };
  } catch (error) {
    for (const item of plan.items) {
      openWithSystemBrowser(item.url);
    }

    const fallbackResults = (plan.items || []).map((item) => ({
      platformId: item.platformId,
      platformName: item.platformName,
      providerId: item.providerId,
      publishMode: "local-assistant",
      status: "failed",
      message: `发布助手自动跟踪不可用：${error.message}`,
    }));

    updateTask(taskId, {
      status: "failed",
      progress: 88,
      publishResults: fallbackResults,
      lastError: `发布助手自动填充不可用，已回退为打开平台页面：${error.message}`,
    });
    addLog(`发布助手自动填充失败，已回退为打开平台页面：${error.message}`, "warn");

    return {
      ...plan,
      fallback: true,
      message: error.message,
    };
  }
}

export function sweepStaleAssistantTasks() {
  const now = Date.now();
  const tasks = Array.isArray(getDb().tasks) ? getDb().tasks : [];

  tasks.forEach((task) => {
    if (String(task?.status || "").trim().toLowerCase() !== "publishing") {
      return;
    }

    if (assistantTaskWatchers.has(task.id)) {
      return;
    }

    const results = Array.isArray(task.publishResults) ? task.publishResults : [];
    if (!results.length) {
      return;
    }

    const hasPending = results.some((item) => !isFinalResultStatus(item?.status));
    if (!hasPending) {
      return;
    }

    const lastTouchedAt =
      parseLooseDateTime(task.updatedAt)?.getTime() ||
      parseLooseDateTime(task.createdAt)?.getTime() ||
      0;
    if (!lastTouchedAt || now - lastTouchedAt < ASSISTANT_STALE_SYNC_MS) {
      return;
    }

    const hasDetectedFailure = results.some(
      (item) => String(item?.status || "").trim().toLowerCase() === "failed",
    );
    const nextStatus = hasDetectedFailure ? "failed" : "success";
    const nextResults = results.map((item) => {
      const currentStatus = String(item?.status || "").trim().toLowerCase();
      if (isFinalResultStatus(currentStatus)) {
        return item;
      }
      return {
        ...item,
        status: hasDetectedFailure ? "failed" : "success",
        message: hasDetectedFailure
          ? "发布助手同步超时，自动标记为失败。"
          : "发布助手同步超时，自动标记为成功。",
      };
    });

    updateTask(task.id, {
      status: nextStatus,
      progress: nextStatus === "success" ? 100 : 92,
      publishResults: nextResults,
      lastPublishedAt:
        nextStatus === "success" ? new Date().toISOString() : task.lastPublishedAt || "",
      lastError:
        nextStatus === "failed" ? task.lastError || "发布助手同步超时，存在失败平台。" : "",
    });

    addLog(
      nextStatus === "success"
        ? `任务 ${task.title || task.id} 自动同步为发布成功。`
        : `任务 ${task.title || task.id} 自动同步结束，存在失败平台。`,
      nextStatus === "success" ? "info" : "warn",
    );
  });
}

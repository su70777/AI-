import cors from "cors";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { launchAssistantPlan } from "../server/lib/localPublishAssistant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "assistant-data");
const DOWNLOAD_DIR = path.join(DATA_DIR, "downloads");
const LOG_FILE = path.join(DATA_DIR, "assistant.log");
const HOST = String(process.env.ASSISTANT_HOST || "127.0.0.1").trim();
const PORT = Math.max(1024, Number(process.env.ASSISTANT_PORT || 3047));
const VERSION = "1.0.2";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function writeLog(message) {
  const line = `[${timestamp()}] ${message}${os.EOL}`;
  fs.appendFileSync(LOG_FILE, line, "utf8");
  console.log(message);
}

function safeFileName(value) {
  return String(value || "download.bin")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "download.bin";
}

function formatMs(ms) {
  const value = Number(ms || 0);
  return `${Math.max(0, Math.round(value))}ms`;
}

function buildPlanFileCacheKey(file) {
  if (!file || typeof file !== "object") {
    return "";
  }
  const id = String(file.id || "").trim();
  const url = String(file.downloadUrl || file.download_url || file.url || "").trim();
  if (!id && !url) {
    return "";
  }
  return `${id}::${url}`;
}

function resolveDownloadOutput(file, downloadUrl) {
  const extension =
    path.extname(safeFileName(file?.name)) ||
    path.extname(new URL(downloadUrl).pathname) ||
    ".bin";
  const outputName = `${safeFileName(file?.id || Date.now())}${extension}`;
  return {
    outputName,
    outputPath: path.join(DOWNLOAD_DIR, outputName),
  };
}

async function downloadPlanFile(file, options = {}) {
  if (!file || typeof file !== "object") {
    return file;
  }

  const logPrefix = String(options.logPrefix || "").trim();
  const fileLabel = String(file.name || file.id || "unnamed-file").trim();

  if (file.path && fs.existsSync(file.path)) {
    writeLog(`${logPrefix}Using provided local file: ${fileLabel}`);
    return file;
  }

  const downloadUrl = file.downloadUrl || file.download_url || file.url;
  if (!downloadUrl) {
    return file;
  }

  const { outputName, outputPath } = resolveDownloadOutput(file, downloadUrl);
  if (fs.existsSync(outputPath)) {
    const sizeBytes = fs.statSync(outputPath).size;
    writeLog(`${logPrefix}Cache hit for ${fileLabel} -> ${outputName} (${sizeBytes} bytes)`);
    return {
      ...file,
      path: outputPath,
    };
  }

  const headers = file.downloadHeaders && typeof file.downloadHeaders === "object" ? file.downloadHeaders : {};
  const startedAt = Date.now();
  writeLog(`${logPrefix}Downloading ${fileLabel} -> ${outputName}`);
  const response = await fetch(downloadUrl, { headers });
  if (!response.ok) {
    throw new Error(`Download failed for ${file.name || file.id || downloadUrl}: HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error(`Download failed for ${file.name || file.id || downloadUrl}: empty response body`);
  }

  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(outputPath));
  const sizeBytes = fs.statSync(outputPath).size;
  writeLog(`${logPrefix}Download completed for ${fileLabel} in ${formatMs(Date.now() - startedAt)} (${sizeBytes} bytes)`);

  return {
    ...file,
    path: outputPath,
    mimeType: file.mimeType || file.mime_type || response.headers.get("content-type") || "application/octet-stream",
  };
}

async function ensurePreparedPlanFile(file, downloadCache, options = {}) {
  const cacheKey = buildPlanFileCacheKey(file);
  const logPrefix = String(options.logPrefix || "").trim();
  if (cacheKey && downloadCache.has(cacheKey)) {
    writeLog(`${logPrefix}Reusing prepared file for ${String(file?.name || file?.id || cacheKey)}`);
    return downloadCache.get(cacheKey);
  }

  const promise = downloadPlanFile(file, options);
  if (cacheKey) {
    downloadCache.set(cacheKey, promise);
  }
  return promise;
}

async function preparePlanFiles(plan) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const taskLabel = String(plan?.title || plan?.taskId || "untitled").trim();
  const logPrefix = `[prepare:${taskLabel}] `;
  const startedAt = Date.now();
  const downloadCache = new Map();
  const preparedItems = [];

  for (const item of items) {
    const files = item?.files || {};
    preparedItems.push({
      ...item,
      files: {
        ...files,
        video: await ensurePreparedPlanFile(files.video, downloadCache, { logPrefix }),
        cover: await ensurePreparedPlanFile(files.cover, downloadCache, { logPrefix }),
      },
    });
  }

  writeLog(
    `${logPrefix}Prepared ${items.length} platform item(s) with ${downloadCache.size} unique remote file(s) in ${formatMs(Date.now() - startedAt)}`,
  );

  return {
    ...plan,
    items: preparedItems,
  };
}

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "local-publish-assistant",
    version: VERSION,
    host: HOST,
    port: PORT,
    time: timestamp(),
  });
});

app.post("/api/assistant/launch-plan", async (req, res) => {
  const plan = req.body || {};
  const title = String(plan.title || plan.taskId || "untitled");
  writeLog(`Received assistant plan: ${title}`);
  res.json({ ok: true, data: { accepted: true, title } });

  Promise.resolve()
    .then(async () => {
      const preparedPlan = await preparePlanFiles(plan);
      const result = await launchAssistantPlan(preparedPlan);
      writeLog(`Assistant plan launched for ${result.results?.length || 0} platform(s).`);
    })
    .catch((error) => {
      const message = error instanceof Error ? error.stack || error.message : String(error);
      writeLog(`Assistant plan failed: ${message}`);
    });
});

const server = app.listen(PORT, HOST, () => {
  writeLog(`Local assistant listening on http://${HOST}:${PORT}`);
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    writeLog(`Local assistant already running on http://${HOST}:${PORT}`);
    process.exit(0);
  }

  writeLog(`Local assistant crashed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    writeLog(`Received ${signal}, shutting down.`);
    server.close(() => process.exit(0));
  });
}

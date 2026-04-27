import cors from "cors";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchAssistantPlan } from "../server/lib/localPublishAssistant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "assistant-data");
const LOG_FILE = path.join(DATA_DIR, "assistant.log");
const HOST = String(process.env.ASSISTANT_HOST || "127.0.0.1").trim();
const PORT = Math.max(1024, Number(process.env.ASSISTANT_PORT || 3047));
const VERSION = "1.0.0";

fs.mkdirSync(DATA_DIR, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function writeLog(message) {
  const line = `[${timestamp()}] ${message}${os.EOL}`;
  fs.appendFileSync(LOG_FILE, line, "utf8");
  console.log(message);
}

const app = express();

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
  try {
    const plan = req.body || {};
    writeLog(`Received assistant plan: ${String(plan.title || plan.taskId || "untitled")}`);
    const result = await launchAssistantPlan(plan);
    writeLog(`Assistant plan launched for ${result.results?.length || 0} platform(s).`);
    res.json({ ok: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeLog(`Assistant plan failed: ${message}`);
    res.status(500).json({
      ok: false,
      error: {
        message,
      },
    });
  }
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

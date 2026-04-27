import { publishViaWebhookBridge } from "./webhookBridge.js";

const PUBLISH_ENDPOINT = process.env.REDBOOK_PUBLISH_ENDPOINT || "";
const API_KEY = process.env.REDBOOK_API_KEY || "";

export function isRedbookBridgeConfigured() {
  return Boolean(PUBLISH_ENDPOINT);
}

export function getRedbookBridgeConfig() {
  return {
    publishEndpoint: PUBLISH_ENDPOINT,
    hasApiKey: Boolean(API_KEY),
  };
}

export async function publishToRedbook(task, platform, files = []) {
  return publishViaWebhookBridge({
    endpoint: PUBLISH_ENDPOINT,
    apiKey: API_KEY,
    providerId: "redbook",
    platform,
    task,
    files,
    missingMessage:
      "小红书暂未配置官方/服务商发布接口，请先填写 REDBOOK_PUBLISH_ENDPOINT。",
  });
}

import { publishViaWebhookBridge } from "./webhookBridge.js";

const PUBLISH_ENDPOINT = process.env.WECHAT_CHANNELS_PUBLISH_ENDPOINT || "";
const API_KEY = process.env.WECHAT_CHANNELS_API_KEY || "";

export function isWechatChannelsBridgeConfigured() {
  return Boolean(PUBLISH_ENDPOINT);
}

export function getWechatChannelsBridgeConfig() {
  return {
    publishEndpoint: PUBLISH_ENDPOINT,
    hasApiKey: Boolean(API_KEY),
  };
}

export async function publishToWechatChannels(task, platform, files = []) {
  return publishViaWebhookBridge({
    endpoint: PUBLISH_ENDPOINT,
    apiKey: API_KEY,
    providerId: "wechat_channels",
    platform,
    task,
    files,
    missingMessage:
      "视频号暂未配置官方/服务商发布接口，请先填写 WECHAT_CHANNELS_PUBLISH_ENDPOINT。",
  });
}

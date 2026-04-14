export const PLATFORM_CATALOG = [
  {
    id: "douyin",
    name: "抖音",
    note: "短视频流量主阵地，适合课程切片和爆点内容。",
  },
  {
    id: "wechat",
    name: "视频号",
    note: "适合私域转化和课程直播回放分发。",
  },
  {
    id: "redbook",
    name: "小红书",
    note: "适合内容种草和学习路径拆解。",
  },
  {
    id: "kuaishou",
    name: "快手",
    note: "适合下沉流量与高频内容节奏。",
  },
  {
    id: "bilibili",
    name: "B站",
    note: "适合长视频教学与知识型内容沉淀。",
  },
];

export const TASK_STATUS_LABELS = {
  queued: "排队中",
  publishing: "分发中",
  success: "发布成功",
  failed: "发布失败",
  draft: "待提交",
};

export const DEFAULT_SELECTED_PLATFORM_IDS = ["douyin", "wechat", "redbook"];
export const DEFAULT_CONNECTED_PLATFORM_IDS = [
  "douyin",
  "wechat",
  "redbook",
  "bilibili",
];

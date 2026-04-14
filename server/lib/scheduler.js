import { addLog, getTaskById, updateTask } from "./store.js";
import { publishTask } from "./publisher.js";

const timers = new Map();

function clearTaskTimer(taskId) {
  const timer = timers.get(taskId);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  timers.delete(taskId);
}

export function clearAllTaskTimers() {
  for (const taskId of timers.keys()) {
    clearTaskTimer(taskId);
  }
}

export function scheduleTaskLifecycle(taskId) {
  clearTaskTimer(taskId);

  const timer = setTimeout(() => {
    const task = getTaskById(taskId);
    if (!task) {
      clearTaskTimer(taskId);
      return;
    }

    updateTask(taskId, {
      status: "publishing",
      progress: 58,
    });
    addLog(`任务 ${task.title} 已进入分发流程，正在对接平台接口。`);

    publishTask(taskId)
      .then((result) => {
        const nextStatus = result.skippedCount && !result.realCount ? "failed" : "success";
        updateTask(taskId, {
          status: nextStatus,
          progress: nextStatus === "success" ? 100 : 88,
          publishResults: result.results,
          lastError: nextStatus === "success" ? "" : "部分平台尚未接入真实发布接口",
        });
        addLog(
          nextStatus === "success"
            ? `任务 ${task.title} 已完成分发，抖音真实发布与其他平台队列已处理。`
            : `任务 ${task.title} 已完成部分分发，但存在未接入的平台。`,
          nextStatus === "success" ? "info" : "warn",
        );
      })
      .catch((error) => {
        updateTask(taskId, {
          status: "failed",
          progress: 82,
          lastError: error.message,
        });
        addLog(`任务 ${task.title} 发布失败：${error.message}`, "error");
      })
      .finally(() => {
        clearTaskTimer(taskId);
      });
  }, 1200);

  timers.set(taskId, timer);
}

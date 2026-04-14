import { distributionApi } from "../api/distributionApi.js";

const STATUS = { all: "全部", queued: "排队中", publishing: "发布中", success: "发布成功", failed: "发布失败", draft: "待提交" };
const AUTH = { ready: "已授权", connected: "已接入", waiting: "待授权" };
const $ = (id) => document.getElementById(id);

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const toLocal = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const progress = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

const summarize = (items = []) => {
  const s = items.reduce((a, i) => ((a[i.status] = (a[i.status] || 0) + 1), a), {});
  return `真实 ${s.success || 0} / 模拟 ${s.simulated || 0} / 跳过 ${s.skipped || 0}`;
};

const authLabel = (p) => AUTH[p?.authStatus] || AUTH.waiting;
const authTone = (p) => (p?.authReady ? "connected" : "waiting");
const oauthButtonLabel = (p) => {
  if (p?.providerId === "bilibili") {
    return p?.authReady ? "重新授权" : "B站 OAuth";
  }

  return p?.authReady ? "重新授权" : "抖音 OAuth";
};

export function createDistributionApp(doc) {
  const el = {
    siteHome: $("siteHome"),
    authScreen: $("login"),
    appShell: $("appShell"),
    loginForm: $("loginForm"),
    loginUsername: $("loginUsername"),
    loginPassword: $("loginPassword"),
    loginButton: $("loginButton"),
    loginError: $("loginError"),
    logoutButton: $("logoutButton"),
    resetDemoButton: $("resetDemoButton"),
    currentUserPill: $("currentUserPill"),
    apiStatusPill: $("apiStatusPill"),
    searchInput: $("searchInput"),
    jumpToFormButton: $("jumpToFormButton"),
    fileInput: $("fileInput"),
    dropZone: $("dropZone"),
    fileList: $("fileList"),
    materialHint: $("materialHint"),
    platformGrid: $("platformGrid"),
    selectedPlatformSummary: $("selectedPlatformSummary"),
    authPlatformSelect: $("authPlatformSelect"),
    platformAuthForm: $("platformAuthForm"),
    revokeAuthButton: $("revokeAuthButton"),
    authFormHint: $("authFormHint"),
    accountGrid: $("accountGrid"),
    taskForm: $("taskForm"),
    taskTableBody: $("taskTableBody"),
    emptyState: $("emptyState"),
    logList: $("logList"),
    toastStack: $("toastStack"),
    sidebarTaskCount: $("sidebarTaskCount"),
    sidebarSuccessRate: $("sidebarSuccessRate"),
    connectedPlatformCount: $("connectedPlatformCount"),
    fileCount: $("fileCount"),
    metricTaskCount: $("metricTaskCount"),
    metricPlatformCount: $("metricPlatformCount"),
    metricSuccessRate: $("metricSuccessRate"),
    metricFailureCount: $("metricFailureCount"),
    statusFilters: $("statusFilters"),
  };

  const state = {
    user: null,
    summary: {},
    platforms: [],
    files: [],
    tasks: [],
    logs: [],
    taskFilter: "all",
    search: "",
    activeAuthPlatformId: "",
    selectedFileIds: new Set(),
    refreshTimer: 0,
    refreshPromise: null,
    apiOnline: false,
    formDirty: false,
    oauthFlash: null,
  };

  const setText = (node, text) => node && (node.textContent = text == null ? "" : String(text));
  const setHidden = (node, hidden) => node && (node.hidden = hidden);
  const setPill = (node, tone, text) => {
    if (!node) return;
    node.className = `status-pill ${tone}`;
    node.textContent = text;
  };
  const toast = (title, message, tone = "success") => {
    if (!el.toastStack) return;
    const node = doc.createElement("div");
    node.className = `toast ${tone}`;
    node.innerHTML = `<strong>${esc(title)}</strong><div>${esc(message)}</div>`;
    el.toastStack.appendChild(node);
    setTimeout(() => node.remove(), 3200);
  };
  const showLogin = (message = "") => {
    setHidden(el.siteHome, false);
    setHidden(el.authScreen, false);
    setHidden(el.appShell, true);
    setPill(el.apiStatusPill, "warning", "请先登录");
    if (el.loginError) {
      el.loginError.hidden = !message;
      el.loginError.textContent = message;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const showApp = () => {
    setHidden(el.siteHome, true);
    setHidden(el.authScreen, true);
    setHidden(el.appShell, false);
    if (el.loginError) el.loginError.hidden = true;
  };
  const stopPolling = () => {
    if (state.refreshTimer) {
      clearInterval(state.refreshTimer);
      state.refreshTimer = 0;
    }
  };
  const startPolling = () => {
    stopPolling();
    state.refreshTimer = setInterval(() => refreshData({ silent: true }), 3000);
  };
  const getPlatform = (id) => state.platforms.find((p) => p.id === id) || null;
  const cleanUrl = () => {
    const p = new URLSearchParams(window.location.search);
    const f = {
      oauth: p.get("oauth"),
      provider: p.get("provider"),
      platformId: p.get("platformId"),
      message: p.get("message"),
      username: p.get("username"),
      password: p.get("password"),
    };
    const has = f.oauth || f.provider || f.platformId || f.message || f.username || f.password;
    if (has) window.history.replaceState({}, doc.title, `${window.location.pathname}${window.location.hash || ""}`);
    return has ? f : null;
  };

  function syncAuthOptions() {
    if (!el.authPlatformSelect) return;
    const active = state.activeAuthPlatformId || state.platforms[0]?.id || "";
    el.authPlatformSelect.innerHTML = state.platforms
      .map((p) => `<option value="${esc(p.id)}" ${p.id === active ? "selected" : ""}>${esc(p.name)}</option>`)
      .join("");
    el.authPlatformSelect.value = state.platforms.some((p) => p.id === active) ? active : state.platforms[0]?.id || "";
  }

  function fillAuthForm(id, focus = false) {
    const p = getPlatform(id) || state.platforms[0];
    if (!p || !el.platformAuthForm) return;
    state.activeAuthPlatformId = p.id;
    state.formDirty = false;
    syncAuthOptions();
    el.platformAuthForm.authMethod.value = p.authMethod || "manual";
    el.platformAuthForm.accountName.value = p.accountName || "";
    el.platformAuthForm.tokenHint.value = p.accessTokenHint || "";
    el.platformAuthForm.expiresAt.value = toLocal(p.expiresAt);
    el.platformAuthForm.authNotes.value = p.authNotes || "";
    if (focus) el.platformAuthForm.accountName.focus();
  }

  function ensureFilesSelected() {
    const ids = new Set(state.files.map((f) => f.id));
    state.selectedFileIds = new Set([...state.selectedFileIds].filter((id) => ids.has(id)));
    if (!state.selectedFileIds.size && state.files.length) state.selectedFileIds = new Set(state.files.map((f) => f.id));
  }

  function applyData(data) {
    state.user = data.user || state.user;
    state.summary = data.summary || {};
    state.platforms = Array.isArray(data.platforms) ? data.platforms : [];
    state.files = Array.isArray(data.files) ? data.files : [];
    state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    state.logs = Array.isArray(data.logs) ? data.logs : [];
    state.apiOnline = true;
    if (!state.activeAuthPlatformId || !getPlatform(state.activeAuthPlatformId)) state.activeAuthPlatformId = state.platforms[0]?.id || "";
    ensureFilesSelected();
  }

  function renderMetrics() {
    const s = state.summary || {};
    const taskCount = s.taskCount ?? state.tasks.length;
    const connected = s.connectedPlatformCount ?? 0;
    const successRate = s.successRate ?? 0;
    setText(el.sidebarTaskCount, taskCount);
    setText(el.sidebarSuccessRate, `${successRate}%`);
    setText(el.connectedPlatformCount, connected);
    setText(el.fileCount, s.fileCount ?? state.files.length);
    setText(el.metricTaskCount, taskCount);
    setText(el.metricPlatformCount, connected);
    setText(el.metricSuccessRate, `${successRate}%`);
    setText(el.metricFailureCount, s.failureCount ?? 0);
    setText(el.currentUserPill, state.user?.displayName || state.user?.username || "未登录");
    setText(el.materialHint, state.selectedFileIds.size ? `${state.selectedFileIds.size} 个素材已选` : "请先选择素材");
    setText(el.selectedPlatformSummary, `已选 ${s.selectedPlatformCount ?? 0} 个 / 可用 ${connected} 个`);
    setPill(el.apiStatusPill, state.apiOnline ? "success" : "warning", state.apiOnline ? "后端在线" : "后端离线");
  }

  function renderPlatforms() {
    if (el.platformGrid) {
      el.platformGrid.innerHTML = state.platforms.map((p) => `
        <article class="platform-card ${p.selected ? "selected" : ""}">
          <div class="platform-card-head"><strong>${esc(p.name)}</strong><span class="state ${authTone(p)}">${esc(authLabel(p))}</span></div>
          <div class="platform-note">${esc(p.note || "")}</div>
          <div class="platform-subnote">账号：${esc(p.accountName || "未绑定")}</div>
          <div class="platform-subnote">凭证：${esc(p.accessTokenHint || "暂无")}</div>
          <div class="task-actions">
            <button class="task-action" type="button" data-action="toggle-platform" data-platform-id="${esc(p.id)}">${p.selected ? "取消选择" : "选择平台"}</button>
            <button class="task-action" type="button" data-action="prefill-platform" data-platform-id="${esc(p.id)}">编辑配置</button>
            ${p.providerId === "douyin" || p.providerId === "bilibili" ? `<button class="task-action" type="button" data-action="start-oauth" data-platform-id="${esc(p.id)}">${oauthButtonLabel(p)}</button>` : ""}
          </div>
        </article>`).join("");
    }
    if (el.accountGrid) {
      el.accountGrid.innerHTML = state.platforms.map((p) => `
        <article class="account-card ${p.authReady ? "connected" : "waiting"}">
          <div class="account-head"><strong>${esc(p.name)}</strong><span class="task-status ${p.authReady ? "success" : "draft"}">${esc(authLabel(p))}</span></div>
          <div class="account-sub">${esc(p.accountName || "未绑定账号")}</div>
          <div class="account-sub">授权方式：${esc(p.authMethod || "未设置")}</div>
          <div class="account-sub">选中状态：${p.selected ? "已纳入任务" : "未纳入任务"}</div>
          <div class="account-sub">凭证提示：${esc(p.accessTokenHint || "暂无")}</div>
          <div class="task-actions">
            <button class="task-action" type="button" data-action="prefill-platform" data-platform-id="${esc(p.id)}">编辑配置</button>
            ${p.providerId === "douyin" || p.providerId === "bilibili" ? `<button class="task-action" type="button" data-action="start-oauth" data-platform-id="${esc(p.id)}">${oauthButtonLabel(p)}</button>` : ""}
            <button class="task-action" type="button" data-action="revoke-platform" data-platform-id="${esc(p.id)}">撤销授权</button>
          </div>
        </article>`).join("");
    }
  }

  function renderFiles() {
    if (!el.fileList) return;
    if (!state.files.length) {
      el.fileList.innerHTML = `<div class="empty-state"><strong>暂无上传素材</strong><span>先上传视频、封面图或文案附件。</span></div>`;
      return;
    }
    el.fileList.innerHTML = state.files.map((f) => {
      const selected = state.selectedFileIds.has(f.id);
      return `<div class="file-chip ${selected ? "selected" : ""}"><div><strong>${esc(f.name)}</strong><div class="file-meta">${esc(f.sizeLabel || "")} · ${esc(f.mimeType || "未知类型")} · ${esc(f.createdAt || "")}</div></div><div class="task-actions"><button class="task-action" type="button" data-action="toggle-file" data-file-id="${esc(f.id)}">${selected ? "已选中" : "选择"}</button><button class="remove-button" type="button" data-action="delete-file" data-file-id="${esc(f.id)}">删除</button></div></div>`;
    }).join("");
  }

  function renderTasks() {
    if (!el.taskTableBody || !el.emptyState) return;
    const q = state.search.toLowerCase();
    const list = state.tasks.filter((t) => (state.taskFilter === "all" || t.status === state.taskFilter) && (!q || [t.id, t.title, t.status, t.owner, t.summary, t.tags, t.mode, t.cover, ...(t.platformNames || [])].join(" ").toLowerCase().includes(q)));
    el.taskTableBody.innerHTML = list.map((t) => {
      const results = Array.isArray(t.publishResults) ? t.publishResults : [];
      const retry = t.status === "failed" ? `<button class="task-action" type="button" data-action="retry-task" data-task-id="${esc(t.id)}">重试</button>` : "";
      return `<tr>
        <td><div class="task-title">${esc(t.title)}</div><div class="platform-subnote">${esc(t.owner || "")} · ${esc(t.schedule || "")}</div></td>
        <td><div class="platform-badges">${(t.platformNames || []).map((n) => `<span class="platform-badge">${esc(n)}</span>`).join("") || '<span class="platform-badge">未选择</span>'}</div></td>
        <td><span class="task-status ${STATUS[t.status] ? t.status : "draft"}">${esc(STATUS[t.status] || t.status || "待提交")}</span>${t.lastError ? `<div class="platform-subnote">${esc(t.lastError)}</div>` : ""}</td>
        <td><div class="progress"><span style="width:${progress(t.progress)}%"></span></div><div class="progress-label">${progress(t.progress)}%${results.length ? ` · ${esc(summarize(results))}` : ""}</div></td>
        <td>${esc(t.createdAt || "")}</td>
        <td><div class="task-actions"><button class="task-action" type="button" data-action="copy-task-id" data-task-id="${esc(t.id)}">复制ID</button>${retry}</div></td>
      </tr>`;
    }).join("");
    setHidden(el.emptyState, list.length > 0);
  }

  function renderLogs() {
    if (!el.logList) return;
    el.logList.innerHTML = state.logs.length ? state.logs.slice(0, 8).map((l) => `<div class="log-item"><strong>${esc(l.title)}</strong><time>${esc(l.createdAt || "")}</time></div>`).join("") : `<div class="empty-state"><strong>暂无日志</strong><span>操作记录会显示在这里。</span></div>`;
  }

  function renderFilters() {
    if (!el.statusFilters) return;
    [...el.statusFilters.querySelectorAll("[data-filter]")].forEach((b) => b.classList.toggle("active", b.dataset.filter === state.taskFilter));
  }

  function renderAll() {
    renderMetrics();
    syncAuthOptions();
    renderPlatforms();
    renderFiles();
    renderTasks();
    renderLogs();
    renderFilters();
  }

  function refreshData({ silent = false } = {}) {
    if (state.refreshPromise) return state.refreshPromise;
    state.refreshPromise = distributionApi.bootstrap().then((data) => {
      applyData(data);
      showApp();
      renderAll();
      if (!silent) toast("数据已更新", "工作台已刷新。", "success");
    }).catch((error) => {
      state.apiOnline = false;
      renderMetrics();
      if (!distributionApi.getAuthToken()) {
        stopPolling();
        state.user = null;
        showLogin(error.message || "请先登录");
        return;
      }
      if (!silent) toast("刷新失败", error.message || "无法拉取数据。", "error");
      setPill(el.apiStatusPill, "danger", "后端异常");
    }).finally(() => {
      state.refreshPromise = null;
    });
    return state.refreshPromise;
  }

  function handleAction(target) {
    const action = target?.dataset?.action;
    const platformId = target?.dataset?.platformId || "";
    const fileId = target?.dataset?.fileId || "";
    const taskId = target?.dataset?.taskId || "";

    if (action === "toggle-platform") return handlePlatformToggle(platformId);
    if (action === "prefill-platform") return handlePrefillPlatform(platformId);
    if (action === "start-oauth") return handleStartOAuth(platformId);
    if (action === "revoke-platform") return handleRevokePlatform(platformId);
    if (action === "toggle-file") return handleToggleFile(fileId);
    if (action === "delete-file") return handleDeleteFile(fileId);
    if (action === "retry-task") return handleRetryTask(taskId);
    if (action === "copy-task-id") return handleCopyTaskId(taskId);
    return null;
  }

  async function enterWorkbenchAfterLogin(session) {
    distributionApi.setAuthToken(session.token);
    state.user = session.user || null;
    state.apiOnline = true;
    showApp();
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      renderAll();
    } catch (renderError) {
      console.error("Post-login render failed", renderError);
      renderMetrics();
    }
    toast("登录成功", `欢迎回来，${session.user?.displayName || session.user?.username || ""}。`, "success");
    startPolling();
    void refreshData({ silent: true });
  }

  function bindEvents() {
    el.loginForm?.addEventListener("submit", handleLoginSubmit);
    el.logoutButton?.addEventListener("click", handleLogout);
    el.resetDemoButton?.addEventListener("click", handleReset);
    el.taskForm?.addEventListener("submit", handleTaskSubmit);
    el.platformAuthForm?.addEventListener("submit", handlePlatformAuthSubmit);
    el.revokeAuthButton?.addEventListener("click", () => handleRevokePlatform(el.authPlatformSelect?.value || state.activeAuthPlatformId));
    el.jumpToFormButton?.addEventListener("click", () => el.taskForm?.scrollIntoView({ behavior: "smooth", block: "start" }));
    el.fileInput?.addEventListener("change", (e) => handleFileUpload(e.target?.files));
    el.dropZone?.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.dropZone.classList.add("dragover");
    });
    el.dropZone?.addEventListener("dragleave", () => el.dropZone.classList.remove("dragover"));
    el.dropZone?.addEventListener("drop", (e) => {
      e.preventDefault();
      el.dropZone.classList.remove("dragover");
      handleFileUpload(e.dataTransfer?.files);
    });
    el.searchInput?.addEventListener("input", (e) => {
      state.search = String(e.target?.value || "").trim().toLowerCase();
      renderTasks();
    });
    el.statusFilters?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      state.taskFilter = btn.dataset.filter || "all";
      renderFilters();
      renderTasks();
    });
    el.authPlatformSelect?.addEventListener("change", (e) => fillAuthForm(String(e.target?.value || "").trim(), false));
    el.platformAuthForm?.addEventListener("input", () => { state.formDirty = true; });
    el.platformGrid?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (btn) handleAction(btn);
    });
    el.accountGrid?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (btn) handleAction(btn);
    });
    el.fileList?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (btn) handleAction(btn);
    });
    el.taskTableBody?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (btn) handleAction(btn);
    });
    window.addEventListener("online", () => {
      state.apiOnline = true;
      setPill(el.apiStatusPill, "success", "后端在线");
    });
    window.addEventListener("offline", () => {
      state.apiOnline = false;
      setPill(el.apiStatusPill, "danger", "网络离线");
    });
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();
    const btn = el.loginButton;
    if (btn) btn.disabled = true;
    try {
      const f = new FormData(el.loginForm);
      const session = await distributionApi.login({
        username: String(f.get("username") || "").trim(),
        password: String(f.get("password") || ""),
      });
      await enterWorkbenchAfterLogin(session);
    } catch (error) {
      showLogin(error.message || "登录失败");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleLogout() {
    try { await distributionApi.logout(); } catch {}
    stopPolling();
    distributionApi.clearAuthToken();
    state.user = null;
    state.platforms = [];
    state.files = [];
    state.tasks = [];
    state.logs = [];
    showLogin("已退出登录");
  }

  async function handleReset() {
    if (!window.confirm("确定要重置演示数据吗？")) return;
    try {
      await distributionApi.reset();
      state.selectedFileIds = new Set();
      await refreshData({ silent: true });
      toast("已重置", "演示数据恢复完成。", "success");
    } catch (error) {
      toast("重置失败", error.message || "无法重置演示数据。", "error");
    }
  }

  async function handleFileUpload(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    try {
      const result = await distributionApi.uploadFiles(list);
      await refreshData({ silent: true });
      toast("素材已上传", `新增 ${result.added?.length || 0} 个，跳过 ${result.skipped?.length || 0} 个。`, "success");
    } catch (error) {
      toast("上传失败", error.message || "素材上传失败。", "error");
    } finally {
      if (el.fileInput) el.fileInput.value = "";
    }
  }

  async function handleDeleteFile(fileId) {
    try {
      await distributionApi.deleteFile(fileId);
      state.selectedFileIds.delete(fileId);
      await refreshData({ silent: true });
      toast("已删除", "素材已移除。", "success");
    } catch (error) {
      toast("删除失败", error.message || "无法删除素材。", "error");
    }
  }

  async function handleToggleFile(fileId) {
    if (state.selectedFileIds.has(fileId)) state.selectedFileIds.delete(fileId);
    else state.selectedFileIds.add(fileId);
    renderFiles();
    renderMetrics();
  }

  async function handlePlatformToggle(platformId) {
    const p = getPlatform(platformId);
    if (!p) return;
    const next = !p.selected;
    if (next && !p.authReady) {
      toast("请先授权", `${p.name} 还不能进入队列。`, "warn");
      return;
    }
    try {
      await distributionApi.updatePlatform(platformId, { selected: next });
      await refreshData({ silent: true });
      toast("平台已更新", `${p.name} 已${next ? "加入" : "移出"}队列。`, "success");
    } catch (error) {
      toast("更新失败", error.message || "无法更新平台。", "error");
    }
  }

  function handlePrefillPlatform(platformId) {
    fillAuthForm(platformId, true);
    toast("已填充", "可以直接编辑授权配置。", "success");
  }

  async function handleRevokePlatform(platformId) {
    if (!platformId) return;
    try {
      await distributionApi.revokePlatform(platformId);
      await refreshData({ silent: true });
      fillAuthForm(platformId, false);
      toast("已撤销授权", "平台授权信息已清空。", "warn");
    } catch (error) {
      toast("撤销失败", error.message || "无法撤销授权。", "error");
    }
  }

  async function handleStartOAuth(platformId) {
    if (!platformId) return;
    try {
      const result = await distributionApi.startPlatformOAuth(platformId);
      toast("即将跳转", "正在前往官方授权页。", "success");
      window.location.href = result.authUrl;
    } catch (error) {
      toast("OAuth 失败", error.message || "无法启动授权。", "error");
    }
  }

  async function handlePlatformAuthSubmit(event) {
    event.preventDefault();
    const platformId = String(el.authPlatformSelect?.value || state.activeAuthPlatformId || "").trim();
    if (!platformId) return toast("请选择平台", "请先选择一个平台。", "warn");
    const f = new FormData(el.platformAuthForm);
    const payload = {
      authMethod: String(f.get("authMethod") || "manual").trim(),
      accountName: String(f.get("accountName") || "").trim(),
      accessTokenHint: String(f.get("tokenHint") || "").trim(),
      expiresAt: String(f.get("expiresAt") || "").trim() ? new Date(String(f.get("expiresAt"))).toISOString() : "",
      authNotes: String(f.get("authNotes") || "").trim(),
    };
    try {
      await distributionApi.authorizePlatform(platformId, payload);
      await refreshData({ silent: true });
      fillAuthForm(platformId, false);
      toast("授权已保存", "配置已更新。", "success");
    } catch (error) {
      toast("保存失败", error.message || "无法保存授权信息。", "error");
    }
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    const selectedPlatforms = state.platforms.filter((p) => p.selected);
    const unauthorized = selectedPlatforms.filter((p) => !p.authReady);
    const selectedFiles = [...state.selectedFileIds].map((id) => state.files.find((f) => f.id === id)).filter(Boolean);
    if (!selectedPlatforms.length) return toast("请选择平台", "至少选择一个目标平台。", "warn");
    if (unauthorized.length) return toast("存在未授权平台", `${unauthorized.map((p) => p.name).join(" / ")} 还不能发布。`, "warn");
    if (!selectedFiles.length) return toast("请选择素材", "请至少保留一个可发布素材。", "warn");
    if (selectedPlatforms.some((p) => p.providerId === "bilibili")) {
      const hasVideo = selectedFiles.some((file) => String(file.mimeType || "").startsWith("video/"));
      const hasCover = selectedFiles.some((file) => String(file.mimeType || "").startsWith("image/"));
      if (!hasVideo) return toast("B站需要视频", "请先上传至少一个视频素材。", "warn");
      if (!hasCover) return toast("B站需要封面图", "请先上传一张图片素材作为封面。", "warn");
    }
    const f = new FormData(el.taskForm);
    const btn = el.taskForm.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      await distributionApi.createTask({
        title: String(f.get("title") || "").trim(),
        summary: String(f.get("summary") || "").trim(),
        tags: String(f.get("tags") || "").trim(),
        schedule: String(f.get("schedule") || "").trim(),
        mode: String(f.get("mode") || "立即发布").trim(),
        cover: String(f.get("cover") || "自动提取封面").trim(),
        owner: state.user?.displayName || state.user?.username || "AI课程工厂",
        platformIds: selectedPlatforms.map((p) => p.id),
        fileIds: selectedFiles.map((f) => f.id),
      });
      await refreshData({ silent: true });
      toast("任务已创建", "分发任务已进入队列。", "success");
    } catch (error) {
      toast("创建失败", error.message || "无法创建分发任务。", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleRetryTask(taskId) {
    try {
      await distributionApi.retryTask(taskId);
      await refreshData({ silent: true });
      toast("已重试", "任务将重新进入队列。", "success");
    } catch (error) {
      toast("重试失败", error.message || "无法重试任务。", "error");
    }
  }

  async function handleCopyTaskId(taskId) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(taskId);
      else {
        const t = doc.createElement("textarea");
        t.value = taskId;
        doc.body.appendChild(t);
        t.select();
        doc.execCommand("copy");
        t.remove();
      }
      toast("已复制", `任务 ID ${taskId} 已复制。`, "success");
    } catch (error) {
      toast("复制失败", error.message || "无法复制任务 ID。", "error");
    }
  }

  async function init() {
    state.oauthFlash = cleanUrl();
    bindEvents();
    if (el.loginUsername && !el.loginUsername.value) el.loginUsername.value = "admin";
    if (el.loginPassword && !el.loginPassword.value) el.loginPassword.value = "admin123";

    if (state.oauthFlash?.platformId) state.activeAuthPlatformId = state.oauthFlash.platformId;

    const queryLogin =
      state.oauthFlash?.username && state.oauthFlash?.password
        ? {
            username: String(state.oauthFlash.username || "").trim(),
            password: String(state.oauthFlash.password || ""),
          }
        : null;

    if (!distributionApi.getAuthToken()) {
      if (queryLogin) {
        showLogin();
        syncAuthOptions();
        try {
          const session = await distributionApi.login(queryLogin);
          await enterWorkbenchAfterLogin(session);
          return;
        } catch (error) {
          showLogin(error.message || "登录失败");
          return;
        }
      }
      showLogin();
      syncAuthOptions();
      if (state.oauthFlash?.oauth === "success") toast("授权完成", state.oauthFlash.message || "平台授权已返回。", "success");
      if (state.oauthFlash?.oauth === "error") toast("授权失败", state.oauthFlash.message || "平台授权未成功。", "error");
      return;
    }

    try {
      await refreshData({ silent: true });
      fillAuthForm(state.activeAuthPlatformId || state.platforms[0]?.id || "", false);
      if (state.oauthFlash?.oauth === "success") toast("授权完成", state.oauthFlash.message || "平台授权已成功返回。", "success");
      if (state.oauthFlash?.oauth === "error") toast("授权失败", state.oauthFlash.message || "平台授权未成功。", "error");
      startPolling();
    } catch (error) {
      if (!distributionApi.getAuthToken()) showLogin(error.message || "请先登录");
      else toast("初始化失败", error.message || "工作台启动失败。", "error");
    }
  }

  return { init };
}

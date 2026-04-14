const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const AUTH_TOKEN_KEY = "aicg-distribution-auth-token";

let authToken = "";

function readStoredToken() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
  } catch (error) {
    console.warn("Unable to read auth token from localStorage", error);
    return "";
  }
}

function writeStoredToken(token) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (error) {
    console.warn("Unable to persist auth token", error);
  }
}

authToken = readStoredToken();

async function request(path, options = {}) {
  const { body, method = "GET", formData } = options;
  const init = {
    method,
    headers: {},
  };

  if (authToken) {
    init.headers.Authorization = `Bearer ${authToken}`;
  }

  if (formData instanceof FormData) {
    init.body = formData;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const raw = await response.text();
  let payload = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      payload = raw;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      authToken = "";
      writeStoredToken("");
    }

    const message =
      payload?.error?.message ||
      payload?.message ||
      `请求失败 (${response.status})`;
    throw new Error(message);
  }

  return payload?.data ?? payload;
}

export const distributionApi = {
  getAuthToken: () => authToken,
  setAuthToken: (token) => {
    authToken = token || "";
    writeStoredToken(authToken);
  },
  clearAuthToken: () => {
    authToken = "";
    writeStoredToken("");
  },
  login: (payload) => request("/auth/login", { method: "POST", body: payload }),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  bootstrap: () => request("/bootstrap"),
  summary: () => request("/summary"),
  health: () => request("/health"),
  reset: () => request("/reset", { method: "POST" }),
  listPlatforms: () => request("/platforms"),
  updatePlatform: (platformId, patch) =>
    request(`/platforms/${platformId}`, { method: "PATCH", body: patch }),
  listFiles: () => request("/files"),
  uploadFiles: (files) => {
    const formData = new FormData();
    Array.from(files || []).forEach((file) => {
      formData.append("files", file);
    });

    return request("/files", { method: "POST", formData });
  },
  deleteFile: (fileId) => request(`/files/${fileId}`, { method: "DELETE" }),
  listTasks: (query = {}) => {
    const params = new URLSearchParams();
    if (query.status) {
      params.set("status", query.status);
    }
    if (query.q) {
      params.set("q", query.q);
    }
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return request(`/tasks${suffix}`);
  },
  createTask: (payload) => request("/tasks", { method: "POST", body: payload }),
  retryTask: (taskId) => request(`/tasks/${taskId}/retry`, { method: "POST" }),
  listLogs: (limit = 20) => request(`/logs?limit=${limit}`),
  authorizePlatform: (platformId, payload) =>
    request(`/platforms/${platformId}/authorize`, { method: "POST", body: payload }),
  revokePlatform: (platformId) =>
    request(`/platforms/${platformId}/revoke`, { method: "POST" }),
  startPlatformOAuth: (platformId) =>
    request(`/platforms/${platformId}/oauth/start`, { method: "POST" }),
};

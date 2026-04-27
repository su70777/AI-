import { randomUUID, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_USERNAME = process.env.APP_ADMIN_USER || "admin";
const DEFAULT_PASSWORD = process.env.APP_ADMIN_PASSWORD || "admin123";

const sessions = new Map();

function toBuffer(value) {
  return Buffer.from(String(value ?? ""), "utf8");
}

function safeEquals(left, right) {
  const leftBuffer = toBuffer(left);
  const rightBuffer = toBuffer(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

export function loginWithPassword(username, password) {
  const normalizedUsername = String(username || "").trim();
  const normalizedPassword = String(password || "");

  if (
    !safeEquals(normalizedUsername, DEFAULT_USERNAME) ||
    !safeEquals(normalizedPassword, DEFAULT_PASSWORD)
  ) {
    return null;
  }

  const user = {
    id: "user-admin",
    username: DEFAULT_USERNAME,
    displayName: "系统管理员",
    role: "admin",
  };
  const token = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;

  sessions.set(token, { user, expiresAt });

  return {
    token,
    user,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function getSessionFromRequest(req) {
  pruneExpiredSessions();

  const headerToken = String(req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const token = headerToken || String(req.headers["x-session-token"] || "").trim();
  if (!token) {
    return null;
  }

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return {
    token,
    user: session.user,
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}

export function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return res.status(401).json({
      error: {
        message: "请先登录后再访问工作台",
      },
    });
  }

  req.session = session;
  req.user = session.user;
  return next();
}

export function logoutToken(token) {
  if (!token) {
    return false;
  }

  return sessions.delete(token);
}

export function getAuthConfig() {
  return {
    username: DEFAULT_USERNAME,
  };
}

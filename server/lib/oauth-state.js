import { randomUUID } from "node:crypto";

const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

const pendingStates = new Map();

function pruneExpiredStates() {
  const now = Date.now();
  for (const [state, record] of pendingStates.entries()) {
    if (record.expiresAt <= now) {
      pendingStates.delete(state);
    }
  }
}

export function createOAuthState(payload = {}, ttlMs = DEFAULT_STATE_TTL_MS) {
  pruneExpiredStates();

  const state = randomUUID();
  pendingStates.set(state, {
    ...payload,
    expiresAt: Date.now() + ttlMs,
  });

  return state;
}

export function consumeOAuthState(state) {
  pruneExpiredStates();

  const key = String(state || "").trim();
  if (!key) {
    return null;
  }

  const record = pendingStates.get(key);
  if (!record) {
    return null;
  }

  pendingStates.delete(key);
  return record;
}

export function clearOAuthStates() {
  pendingStates.clear();
}

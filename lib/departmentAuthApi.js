import { sendJson, readJsonBody, redactSecrets } from "./http.js";
import {
  clearDepartmentCookieHeader,
  departmentSessionCookieHeader,
  signSession,
  verifySession,
  readDepartmentCookie,
} from "./auth.js";
import {
  LOG_UNLOCK_OPTIONS,
  OPEN_ACCESS_TEAM,
  PLATFORM_TEAM_LOCK_ENABLED,
  normalizeLogUnlock,
  verifyDepartmentPassword,
} from "./departmentAuth.js";
import {
  clearDepartmentUnlockFailures,
  departmentUnlockLocked,
  recordDepartmentUnlockFailure,
} from "./unlockLockout.js";

export async function handleDepartmentUnlock(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    const body = await readJsonBody(req);
    if (!body || typeof body !== "object") {
      sendJson(res, 400, { error: "JSON body is required." });
      return;
    }
    const department = normalizeLogUnlock(body.department);
    const password = String(body.password || "");
    if (!department || !LOG_UNLOCK_OPTIONS.includes(department)) {
      sendJson(res, 400, { error: "Select a department." });
      return;
    }
    if (!password) {
      sendJson(res, 400, { error: "Password is required." });
      return;
    }
    if (await departmentUnlockLocked(department)) {
      sendJson(res, 401, { error: "That password does not unlock this department." });
      return;
    }
    if (!(await verifyDepartmentPassword(department, password))) {
      await recordDepartmentUnlockFailure(department);
      sendJson(res, 401, { error: "That password does not unlock this department." });
      return;
    }
    await clearDepartmentUnlockFailures(department);
    const token = signSession({ department, unlockedAt: Date.now() });
    res.setHeader("Set-Cookie", departmentSessionCookieHeader(token, req));
    sendJson(res, 200, { department });
  } catch (e) {
    const raw = String(e.message || "");
    const error = /ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|database/i.test(raw)
      ? "Could not reach the password store. Try again in a moment."
      : redactSecrets(raw);
    sendJson(res, 500, { error });
  }
}

export async function handleDepartmentMe(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET only." });
    return;
  }
  if (!PLATFORM_TEAM_LOCK_ENABLED) {
    sendJson(res, 200, { department: OPEN_ACCESS_TEAM, platformOpen: true });
    return;
  }
  const session = verifySession(readDepartmentCookie(req));
  const department = normalizeLogUnlock(session?.department);
  sendJson(res, 200, { department: department || null, platformOpen: false });
}

export async function handleDepartmentLock(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  res.setHeader("Set-Cookie", clearDepartmentCookieHeader(req));
  sendJson(res, 200, { department: null });
}

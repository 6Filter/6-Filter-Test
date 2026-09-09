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
  normalizeLogUnlock,
  verifyDepartmentPassword,
} from "./departmentAuth.js";

export async function handleDepartmentUnlock(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  try {
    const body = await readJsonBody(req);
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
    if (!(await verifyDepartmentPassword(department, password))) {
      sendJson(res, 401, { error: "That password does not unlock this department." });
      return;
    }
    const token = signSession({ department, unlockedAt: Date.now() });
    res.setHeader("Set-Cookie", departmentSessionCookieHeader(token, req));
    sendJson(res, 200, { department });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handleDepartmentMe(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "GET only." });
    return;
  }
  const session = verifySession(readDepartmentCookie(req));
  const department = normalizeLogUnlock(session?.department);
  sendJson(res, 200, { department: department || null });
}

export async function handleDepartmentLock(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "POST only." });
    return;
  }
  res.setHeader("Set-Cookie", clearDepartmentCookieHeader(req));
  sendJson(res, 200, { department: null });
}

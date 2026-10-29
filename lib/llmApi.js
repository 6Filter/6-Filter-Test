import { callLlm } from "./callLlm.js";
import { listProvidersForClient, normalizeProvider, runWithLlm } from "./llmContext.js";
import { query, usingPostgres } from "./db.js";
import { requireUnlockedDepartment } from "./propositionAccess.js";

const CLAUDE_PROMPT_MAX_CHARS = 20_000;
const CLAUDE_DAILY_QUOTA = 50;

async function claudeCallsToday(email) {
  if (!usingPostgres() || !email) return 0;
  const rows = await query(
    `SELECT COALESCE(SUM(calls), 0)::int AS n
     FROM llm_usage_daily
     WHERE day = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
       AND lower(user_email) = $1
       AND label = 'claude-api'`,
    [String(email).toLowerCase()]
  );
  return Number(rows[0]?.n) || 0;
}

export async function handleProviders(req, res, { sendJson }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed. Use GET." });
    return;
  }
  sendJson(res, 200, { providers: listProvidersForClient() });
}

export async function handleLlmGenerate(req, res, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed. Use POST." });
    return;
  }

  try {
    if (String(req.user?.role || "").trim() !== "ADMIN") {
      sendJson(res, 403, { error: "This endpoint is restricted to ADMIN." });
      return;
    }
    const billingDepartment = requireUnlockedDepartment(req.user);
    const payload =
      typeof req.body === "object" && req.body != null ? req.body : await readBody(req) || {};
    const { userText, system, image } = payload;
    if (!userText || !system) {
      sendJson(res, 400, { error: "userText and system are required." });
      return;
    }
    const promptChars = String(userText).length + String(system).length;
    if (promptChars > CLAUDE_PROMPT_MAX_CHARS) {
      sendJson(res, 400, { error: `Prompt too large (max ${CLAUDE_PROMPT_MAX_CHARS} characters).` });
      return;
    }
    const email = String(req.user?.email || "").trim().toLowerCase();
    const used = await claudeCallsToday(email);
    if (used >= CLAUDE_DAILY_QUOTA) {
      sendJson(res, 429, { error: "Daily Claude quota reached for this account." });
      return;
    }
    const provider = normalizeProvider(payload.provider);
    const { text } = await runWithLlm(
      provider,
      () => callLlm({ userText, system, image: image || null, label: "claude-api" }),
      { department: billingDepartment, userEmail: email }
    );
    sendJson(res, 200, { text, provider });
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    sendJson(res, status, { error: redactSecrets(e.message) });
  }
}

import { callLlm } from "./callLlm.js";
import { listProvidersForClient, normalizeProvider, runWithLlm } from "./llmContext.js";
import { requireUnlockedDepartment } from "./propositionAccess.js";

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
    const billingDepartment = requireUnlockedDepartment(req.user);
    const payload =
      typeof req.body === "object" && req.body != null ? req.body : await readBody(req) || {};
    const { userText, system, image } = payload;
    if (!userText || !system) {
      sendJson(res, 400, { error: "userText and system are required." });
      return;
    }
    const provider = normalizeProvider(payload.provider);
    const { text } = await runWithLlm(
      provider,
      () => callLlm({ userText, system, image: image || null }),
      { department: billingDepartment }
    );
    sendJson(res, 200, { text, provider });
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    sendJson(res, status, { error: redactSecrets(e.message) });
  }
}

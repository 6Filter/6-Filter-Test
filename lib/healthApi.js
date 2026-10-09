import { sessionSecretConfigured } from "./auth.js";
import { isUsingPostgres, pingDatabase, countPropositions, countIdeas, countIncompleteResearch, notePropositionCountForHealth } from "./db.js";
import { dbExpiresInDays } from "./dbExpiry.js";
import { noteDbExpiryAlarm } from "./dbExpiryNotice.js";
import { postSlackWebhook } from "./managerReview.js";
import { redactSecrets, sendJson } from "./http.js";

function deployedCommit() {
  const raw = String(process.env.RENDER_GIT_COMMIT || "").trim();
  return raw || null;
}

function expiryFields() {
  const days = dbExpiresInDays();
  if (days == null) return {};
  return { dbExpiresInDays: days };
}

export async function handleHealth(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }
  try {
    const ping = await pingDatabase();
    if (!ping.ok || ping.db === "unavailable") {
      let propositions = null;
      try {
        propositions = await countPropositions();
      } catch {
        propositions = null;
      }
      sendJson(res, 503, {
        ok: false,
        db: "unavailable",
        usePostgres: false,
        propositions,
        error: "Database unavailable. Try again shortly.",
        ...expiryFields(),
      });
      return;
    }
    const propositions = await countPropositions();
    const ideas = await countIdeas();
    const noted = await notePropositionCountForHealth(propositions);
    if (noted?.alarm) {
      await postSlackWebhook({ text: noted.alarm });
    }
    const expiry = await noteDbExpiryAlarm();
    if (expiry?.alarm) {
      await postSlackWebhook({ text: expiry.alarm });
    }
    const usePostgres = isUsingPostgres();
    sendJson(res, 200, {
      ok: true,
      db: ping.db || (usePostgres ? "postgres" : "file"),
      usePostgres,
      propositions,
      researchIncomplete: await countIncompleteResearch(),
      ideas,
      sessionSecretConfigured: sessionSecretConfigured(),
      commit: deployedCommit(),
      ...expiryFields(),
    });
  } catch (e) {
    const status = e?.status === 503 ? 503 : 500;
    sendJson(res, status, {
      ok: false,
      db: status === 503 ? "unavailable" : undefined,
      error: redactSecrets(e.message),
    });
  }
}

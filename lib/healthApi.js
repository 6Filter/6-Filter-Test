import { sessionSecretConfigured } from "./auth.js";
import { isUsingPostgres, pingDatabase, countPropositions, countProbePropositions, countIdeas, countIncompleteResearch, notePropositionCountForHealth } from "./db.js";
import { dbExpiresInDays } from "./dbExpiry.js";
import { noteDbExpiryAlarm } from "./dbExpiryNotice.js";
import { postSlackWebhook } from "./managerReview.js";
import { alertBackupLag } from "./alerts.js";
import { latestBackupAt } from "./managerReviewEvents.js";
import { redactSecrets, sendJson } from "./http.js";

function deployedCommit() {
  const raw = String(process.env.RENDER_GIT_COMMIT || "").trim();
  return raw || null;
}

function expiryFields() {
  const days = dbExpiresInDays();
  const expiresAt = String(process.env.DB_EXPIRES_AT || "").trim();
  const expiresMs = Date.parse(expiresAt);
  const out = {};
  if (days != null) out.dbExpiresInDays = days;
  if (Number.isFinite(expiresMs)) {
    out.dbExpiresAt = new Date(expiresMs).toISOString();
    // Ideas are deleted 14 days after DB expiry (same grace as ideaWipeAt).
    out.ideasWipeAt = new Date(expiresMs + 14 * 86400000).toISOString();
  }
  return out;
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
    const probes = await countProbePropositions();
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
    let lastBackupAt = null;
    try {
      lastBackupAt = await latestBackupAt();
    } catch {
      lastBackupAt = null;
    }
    if (lastBackupAt) {
      const ageMs = Date.now() - new Date(lastBackupAt).getTime();
      if (Number.isFinite(ageMs) && ageMs > 36 * 3600_000) {
        await alertBackupLag({ lastBackupAt, hours: 36 }).catch(() => {});
      }
    } else if (usePostgres) {
      await alertBackupLag({ lastBackupAt: null, hours: 36 }).catch(() => {});
    }
    try {
      const { remindPendingReviews } = await import("./managerReviewServer.js");
      await remindPendingReviews();
    } catch {
      /* non-fatal */
    }
    let divisionFloorDrift = { ok: true, drift: [] };
    try {
      const { computeDivisionFloorDrift } = await import("./divisionConfig.js");
      divisionFloorDrift = await computeDivisionFloorDrift();
    } catch (e) {
      divisionFloorDrift = { ok: false, drift: [], error: String(e?.message || e) };
    }
    sendJson(res, 200, {
      ok: true,
      db: ping.db || (usePostgres ? "postgres" : "file"),
      usePostgres,
      propositions,
      probes,
      researchIncomplete: await countIncompleteResearch(),
      ideas,
      sessionSecretConfigured: sessionSecretConfigured(),
      commit: deployedCommit(),
      lastBackupAt: lastBackupAt ? new Date(lastBackupAt).toISOString() : null,
      divisionFloorDrift,
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

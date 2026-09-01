import { firstForbiddenField, ownerLabel } from "./fieldOwnership.js";
import {
  createProposition,
  deleteProposition,
  getPropositionById,
  listPropositions,
  updateProposition,
} from "./db.js";
import { computeAllAdvisoryChecks } from "./propositionScoring.js";

function withAdvisory(proposition) {
  return {
    proposition,
    advisoryChecks: computeAllAdvisoryChecks(proposition),
  };
}

export async function handlePropositionsCollection(req, res, { sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    try {
      let limit = 100;
      try {
        const url = typeof req.url === "string" ? new URL(req.url, "http://localhost") : null;
        const n = Number(req.query?.limit ?? url?.searchParams.get("limit"));
        if (Number.isFinite(n) && n > 0) limit = Math.min(200, Math.floor(n));
      } catch {
        /* keep default */
      }
      const propositions = await listPropositions(limit);
      sendJson(res, 200, { propositions });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method === "POST") {
    try {
      const proposition = await createProposition();
      sendJson(res, 201, { proposition });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

export async function handlePropositionById(req, res, id, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!id) {
    sendJson(res, 400, { error: "Proposition id is required." });
    return;
  }

  if (req.method === "GET") {
    try {
      const proposition = await getPropositionById(id);
      if (!proposition) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      sendJson(res, 200, withAdvisory(proposition));
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method === "PUT") {
    try {
      const body = typeof readBody === "function" ? await readBody(req) : req.body || {};
      const payload = body?.proposition && typeof body.proposition === "object" ? body.proposition : body;
      const current = await getPropositionById(id);
      if (!current) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      const role = req.user?.role || "";
      const forbidden = firstForbiddenField(role, current, payload);
      if (forbidden) {
        const ownedBy = ownerLabel(forbidden);
        sendJson(res, 403, {
          error: ownedBy
            ? `You cannot change ${forbidden} (owned by ${ownedBy}).`
            : `You cannot change ${forbidden}.`,
          field: forbidden,
        });
        return;
      }
      const proposition = await updateProposition(id, payload);
      if (!proposition) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      sendJson(res, 200, withAdvisory(proposition));
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const role = req.user?.role || "";
      if (role !== "ADMIN" && role !== "BM") {
        sendJson(res, 403, { error: "Only BM or ADMIN can delete a proposition.", field: "id" });
        return;
      }
      const ok = await deleteProposition(id);
      if (!ok) {
        sendJson(res, 404, { error: "Proposition not found." });
        return;
      }
      sendJson(res, 200, { ok: true, id });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

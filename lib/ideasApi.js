import { analyzeIdea } from "./analyzeIdea.js";
import {
  linkFormatTrendToIdea,
  linkSizingRunToIdea,
} from "./categoryIntelligence/store.js";
import { deleteIdea, escalateIdea, getIdeaById, listIdeas, saveIdea } from "./db.js";
import { prepareIdeaInput } from "./extractAttachment.js";
import { runWithLlm, normalizeProvider, providerLabel } from "./llmContext.js";
import { friendlyParseError } from "./scoring.js";

function npdFromPayload(payload) {
  return {
    attribute: payload.attribute,
    benchmarkName: payload.benchmarkName,
    isPureCommodity: Boolean(payload.isPureCommodity),
    division: payload.division,
    declaredNetMarginPct: payload.declaredNetMarginPct,
    benchmarkExists: Boolean(payload.benchmarkExists),
    pointsBeat: payload.pointsBeat,
    pricePerUnit: payload.pricePerUnit,
    volumeLossPctAtFixedPoint: payload.volumeLossPctAtFixedPoint,
  };
}

export async function handleIdeasCollection(req, res, { readBody, sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET") {
    try {
      let limit = 20;
      let ideaType = null;
      try {
        const url =
          typeof req.url === "string" ? new URL(req.url, "http://localhost") : null;
        const rawLimit = req.query?.limit ?? url?.searchParams.get("limit");
        const n = Number(rawLimit);
        if (Number.isFinite(n) && n > 0) limit = Math.min(100, Math.floor(n));

        const rawType = String(
          req.query?.ideaType ?? url?.searchParams.get("ideaType") ?? ""
        )
          .trim()
          .toLowerCase();
        if (rawType === "process" || rawType === "product") ideaType = rawType;
      } catch {
        /* keep defaults */
      }
      const ideas = await listIdeas(limit, ideaType);
      sendJson(res, 200, { ideas, ideaType: ideaType || "all" });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed. Use GET or POST." });
    return;
  }

  try {
    const payload = typeof req.body === "object" && req.body != null ? req.body : await readBody(req);
    const ideaType = payload.ideaType === "process" ? "process" : "product";
    let prepared;
    try {
      prepared = await prepareIdeaInput(payload.idea, payload.image || null);
    } catch (e) {
      sendJson(res, e.status && Number.isInteger(e.status) ? e.status : 400, {
        error: redactSecrets(e.message || "Could not read the uploaded file."),
      });
      return;
    }
    const idea = prepared.idea;
    const image = prepared.image;

    if (!idea) {
      sendJson(res, 400, {
        error: "Describe the idea or upload a PDF, Word file, or image.",
      });
      return;
    }

    const provider = normalizeProvider(payload.provider);
    const result = await runWithLlm(provider, () =>
      analyzeIdea(
        idea,
        image,
        ideaType,
        ideaType === "product" ? npdFromPayload(payload) : {}
      )
    );
    result.llmProvider = provider;
    result.llmLabel = providerLabel(provider);
    const saved = await saveIdea({ idea, image, result, status: "analyzed" });
    if (saved?.id) {
      if (result.filter1?.sizingRunId) {
        await linkSizingRunToIdea(result.filter1.sizingRunId, saved.id);
      }
      if (result.filter4?.formatTrendId) {
        await linkFormatTrendToIdea(result.filter4.formatTrendId, saved.id);
      }
    }
    sendJson(res, 201, saved);
  } catch (e) {
    const status = e.status && Number.isInteger(e.status) ? e.status : 500;
    const message = friendlyParseError(e);
    sendJson(res, status, { error: redactSecrets(message) });
  }
}

export async function handleIdeaById(req, res, id, { sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "DELETE") {
    try {
      if (!id) {
        sendJson(res, 400, { error: "Idea id is required." });
        return;
      }
      const deleted = await deleteIdea(id);
      if (!deleted) {
        sendJson(res, 404, { error: "Idea not found." });
        return;
      }
      sendJson(res, 200, { deleted: true, id });
    } catch (e) {
      sendJson(res, 500, { error: redactSecrets(e.message) });
    }
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed. Use GET or DELETE." });
    return;
  }

  try {
    const idea = await getIdeaById(id);
    if (!idea) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    sendJson(res, 200, idea);
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handleIdeaEscalate(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    const payload = typeof req.body === "object" && req.body != null ? req.body : await readBody(req);
    const filterName = String(payload.filterName || "").trim();
    const disputedEvidence = String(payload.disputedEvidence || "").trim();

    if (!id) {
      sendJson(res, 400, { error: "Idea id is required." });
      return;
    }
    if (!filterName) {
      sendJson(res, 400, { error: "filterName is required." });
      return;
    }
    if (!disputedEvidence) {
      sendJson(res, 400, { error: "disputedEvidence is required." });
      return;
    }

    const updated = await escalateIdea(id, { filterName, disputedEvidence });
    if (!updated) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    sendJson(res, 200, updated);
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

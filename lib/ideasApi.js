import { analyzeIdea } from "./analyzeIdea.js";
import {
  linkFormatTrendToIdea,
  linkSizingRunToIdea,
  latestSizingArchetypeForIdea,
  saveCalibration,
} from "./categoryIntelligence/store.js";
import { deleteIdea, escalateIdea, getIdeaById, getIdeaByInputHash, listIdeas, readSupportingDocsRaw, saveIdea, writeSupportingDocs } from "./db.js";
import { LIST_PROPOSITIONS_CAP } from "./lockedConstants.js";
import { buildDocxBuffer, buildPdfBuffer, exportFilename } from "./exportScreenReport.js";
import { prepareIdeaInput } from "./extractAttachment.js";
import { runWithLlm, normalizeProvider, providerLabel } from "./llmContext.js";
import { requireUnlockedDepartment } from "./propositionAccess.js";
import { screenFingerprint } from "./screenFingerprint.js";
import { friendlyParseError } from "./scoring.js";
import { sanitizeImageBase64 } from "./mediaType.js";
import { randomUUID } from "node:crypto";

const SUPPORTING_DOC_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const SUPPORTING_DOC_MAX_BYTES = 8 * 1024 * 1024;
const SUPPORTING_DOC_TYPE_MSG = "Supporting documents must be PDF or Word (.pdf, .doc, .docx).";
const SUPPORTING_DOC_GO_MSG = "Supporting documents can only be added to an idea that has passed (GO).";
const SUPPORTING_DOC_SIZE_MSG = "That file is too large — 8 MB max.";

function resolveSupportingMediaType(mediaType, name) {
  const t = String(mediaType || "").toLowerCase().trim();
  if (SUPPORTING_DOC_TYPES.has(t)) return t;
  const n = String(name || "").toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".doc")) return "application/msword";
  return null;
}

function safeDownloadName(name) {
  const cleaned = String(name || "research.pdf")
    .replace(/["\r\n]/g, "")
    .replace(/[/\\]/g, "_")
    .trim();
  return cleaned || "research.pdf";
}

function base64ByteLength(data) {
  const s = sanitizeImageBase64(data);
  if (!s) return 0;
  try {
    return Buffer.from(s, "base64").length;
  } catch {
    return 0;
  }
}

function sendFile(res, buffer, filename, contentType) {
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(buffer);
}

function requestedFormat(req) {
  const raw =
    req.query?.format ??
    (() => {
      try {
        return new URL(req.url, "http://localhost").searchParams.get("format");
      } catch {
        return null;
      }
    })();
  const format = String(raw || "pdf").trim().toLowerCase();
  if (format === "doc" || format === "word" || format === "docx") return "docx";
  if (format === "pdf") return "pdf";
  return null;
}

function npdFromPayload(payload) {
  return {
    attribute: payload.attribute,
    benchmarkName: payload.benchmarkName,
    isPureCommodity: Boolean(payload.isPureCommodity),
    division: payload.division,
    declaredNetMarginPct: payload.declaredNetMarginPct,
    benchmarkExists: payload.benchmarkExists == null ? null : Boolean(payload.benchmarkExists),
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
        if (Number.isFinite(n) && n > 0) limit = Math.min(LIST_PROPOSITIONS_CAP, Math.floor(n));

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
    const ideaType = "product";
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
    const npd = ideaType === "product" ? npdFromPayload(payload) : {};
    const inputHash = screenFingerprint({ idea, image, ideaType, npd, provider });
    const cached = await getIdeaByInputHash(inputHash);
    if (cached) {
      console.log(`[primus/screen] cache-hit id=${cached.id} hash=${inputHash.slice(0, 12)}`);
      sendJson(res, 200, cached);
      return;
    }

    console.log(`[primus/screen] cache-miss hash=${inputHash.slice(0, 12)} — running analysis`);
    const billingDepartment = requireUnlockedDepartment(req.user);
    const result = await runWithLlm(
      provider,
      () => analyzeIdea(idea, image, ideaType, npd),
      { department: billingDepartment }
    );
    result.llmProvider = provider;
    result.llmLabel = providerLabel(provider);

    const raced = await getIdeaByInputHash(inputHash);
    if (raced) {
      console.log(`[primus/screen] cache-hit after analyze id=${raced.id} hash=${inputHash.slice(0, 12)}`);
      sendJson(res, 200, raced);
      return;
    }

    const saved = await saveIdea({ idea, image, result, status: "analyzed", inputHash });
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

export async function handleIdeaExport(req, res, id, { sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed. Use GET." });
    return;
  }

  try {
    if (!id) {
      sendJson(res, 400, { error: "Idea id is required." });
      return;
    }
    const format = requestedFormat(req);
    if (!format) {
      sendJson(res, 400, { error: "Use format=pdf or format=docx." });
      return;
    }
    const idea = await getIdeaById(id);
    if (!idea) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    if (format === "docx") {
      const buffer = await buildDocxBuffer(idea);
      sendFile(
        res,
        buffer,
        exportFilename(idea, "docx"),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      return;
    }
    const buffer = await buildPdfBuffer(idea);
    sendFile(res, buffer, exportFilename(idea, "pdf"), "application/pdf");
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

function optionalFiniteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function handleRecordOutcome(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    if (!id) {
      sendJson(res, 400, { error: "Idea id is required." });
      return;
    }

    const payload = typeof req.body === "object" && req.body != null ? req.body : await readBody(req);
    const actualNetMarginPct = optionalFiniteNumber(payload.actualNetMarginPct);
    const actualRevenueCr = optionalFiniteNumber(payload.actualRevenueCr);

    const idea = await getIdeaById(id);
    if (!idea) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }

    const npd = idea.npdInputs || idea.npd || {};
    const filter2 = idea.filter2 || {};
    const saved = [];
    const ideaLabel = String(idea.idea || "").slice(0, 80);

    if (actualNetMarginPct != null && actualNetMarginPct !== 0 && npd.division) {
      const estimate = optionalFiniteNumber(filter2.usedNetMarginPct ?? filter2.declaredNetMarginPct);
      if (estimate != null && estimate !== 0) {
        saved.push(
          await saveCalibration({
            engineId: "FILTER2_MARGIN",
            outputMeasured: "net margin pct",
            archetype: npd.division,
            multiplier: estimate / actualNetMarginPct,
            measuredFromCategory: ideaLabel,
            confidence: "single observation",
          })
        );
      }
    }

    if (actualRevenueCr != null && actualRevenueCr !== 0) {
      const estimatedRevenue = optionalFiniteNumber(idea.adjustedRevenueCr);
      if (estimatedRevenue != null && estimatedRevenue !== 0) {
        const sizingArchetype = await latestSizingArchetypeForIdea(id);
        const archetype = sizingArchetype || npd.division || "unclassified";
        saved.push(
          await saveCalibration({
            engineId: "WEIGHTAGE_REVENUE",
            outputMeasured: "revenue Cr",
            archetype,
            multiplier: estimatedRevenue / actualRevenueCr,
            measuredFromCategory: ideaLabel,
            confidence: "single observation",
          })
        );
      }
    }

    if (!saved.length) {
      sendJson(res, 400, {
        error:
          "Nothing recordable — check the idea has a division/revenue estimate and you entered at least one actual value.",
      });
      return;
    }

    sendJson(res, 201, { saved });
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handleSupportingDoc(req, res, id, { readBody, sendJson, redactSecrets }) {
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
    if (!id) {
      sendJson(res, 400, { error: "Idea id is required." });
      return;
    }

    const payload = typeof req.body === "object" && req.body != null ? req.body : await readBody(req);
    const name = String(payload.name || "").trim();
    const mediaType = resolveSupportingMediaType(payload.mediaType, name);
    const data = sanitizeImageBase64(payload.data);

    if (!name) {
      sendJson(res, 400, { error: "File name is required." });
      return;
    }
    if (!mediaType) {
      sendJson(res, 400, { error: SUPPORTING_DOC_TYPE_MSG });
      return;
    }
    if (!data) {
      sendJson(res, 400, { error: "File data is required." });
      return;
    }

    const sizeBytes = base64ByteLength(data);
    if (!sizeBytes) {
      sendJson(res, 400, { error: "Could not read that file." });
      return;
    }
    if (sizeBytes > SUPPORTING_DOC_MAX_BYTES) {
      sendJson(res, 400, { error: SUPPORTING_DOC_SIZE_MSG });
      return;
    }

    const row = await readSupportingDocsRaw(id);
    if (!row) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    if (row.overallVerdict !== "CLEARED") {
      sendJson(res, 400, { error: SUPPORTING_DOC_GO_MSG });
      return;
    }

    const entry = {
      id: `sd_${randomUUID()}`,
      name,
      mediaType,
      sizeBytes,
      data,
      uploadedAt: new Date().toISOString(),
    };
    const updated = await writeSupportingDocs(id, [...row.docs, entry]);
    if (!updated) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    sendJson(res, 200, updated);
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

export async function handleSupportingDocById(req, res, id, docId, { sendJson, redactSecrets }) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "DELETE") {
    sendJson(res, 405, { error: "Method not allowed. Use GET or DELETE." });
    return;
  }

  try {
    if (!id) {
      sendJson(res, 400, { error: "Idea id is required." });
      return;
    }
    if (!docId) {
      sendJson(res, 400, { error: "Document id is required." });
      return;
    }

    const row = await readSupportingDocsRaw(id);
    if (!row) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    const entry = row.docs.find((d) => String(d.id) === String(docId));
    if (!entry) {
      sendJson(res, 404, { error: "Supporting document not found." });
      return;
    }

    if (req.method === "GET") {
      const data = sanitizeImageBase64(entry.data);
      const buffer = Buffer.from(data, "base64");
      sendFile(res, buffer, safeDownloadName(entry.name), entry.mediaType || "application/octet-stream");
      return;
    }

    const next = row.docs.filter((d) => String(d.id) !== String(docId));
    const updated = await writeSupportingDocs(id, next);
    if (!updated) {
      sendJson(res, 404, { error: "Idea not found." });
      return;
    }
    sendJson(res, 200, updated);
  } catch (e) {
    sendJson(res, 500, { error: redactSecrets(e.message) });
  }
}

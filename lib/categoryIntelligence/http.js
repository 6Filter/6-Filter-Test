import { getIdeaById } from "../db.js";
import { computeEngine } from "./engines.js";
import { applyCalibration, recomputeFromEngines } from "./assemble.js";
import { buildSizingWorkbookBuffer } from "./exportWorkbook.js";
import { runFormatTrend } from "./runFormatTrend.js";
import { getOrRunCategorySizing } from "./getOrRunSizing.js";
import {
  getSizingRun,
  hasAnyCalibration,
  saveCalibration,
  updateSizingRun,
} from "./store.js";
import { runWithLlm } from "../llmContext.js";
import { canAccessIdea, ideaAccessSubject, requireUnlockedDepartment } from "../propositionAccess.js";

async function assertIdeaIdAccess(user, ideaId, sendJson, res) {
  const id = String(ideaId || "").trim();
  if (!id) return true;
  const idea = await getIdeaById(id);
  if (!idea || !(await canAccessIdea(user, ideaAccessSubject(idea)))) {
    sendJson(res, 404, { error: "Idea not found." });
    return false;
  }
  return true;
}

async function assertRunIdeaAccess(user, run, sendJson, res) {
  const ideaId = String(run?.ideaId || run?.idea_id || "").trim();
  if (!ideaId) return true;
  return assertIdeaIdAccess(user, ideaId, sendJson, res);
}

function sendXlsx(res, buffer, filename) {
  res.statusCode = 200;
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.end(buffer);
}

export async function handleCategoryIntelRequest(req, res, url, { readBody, sendJson, redactSecrets }) {
  if (url === "/api/calibration") {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method === "GET") {
      const hasAny = await hasAnyCalibration();
      sendJson(res, 200, { hasAny });
      return true;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed. Use GET or POST." });
      return true;
    }
    const payload = typeof req.body === "object" && req.body != null ? req.body : await readBody(req) || {};
    const engineId = String(payload.engineId || "").trim();
    const archetype = String(payload.archetype || "").trim();
    const estimate = Number(payload.estimate);
    const auditedActual = Number(payload.auditedActual);
    if (
      !engineId ||
      !archetype ||
      !Number.isFinite(estimate) ||
      !Number.isFinite(auditedActual) ||
      estimate === 0 ||
      auditedActual === 0
    ) {
      sendJson(res, 400, {
        error: "engineId, archetype, a non-zero estimate, and a non-zero auditedActual are required.",
      });
      return true;
    }
    const row = await saveCalibration({
      engineId,
      outputMeasured: payload.outputMeasured || "category value",
      archetype,
      multiplier: auditedActual / estimate,
      measuredFromCategory: payload.measuredFromCategory || "",
      confidence: payload.confidence || "",
    });
    sendJson(res, 201, row);
    return true;
  }

  if (url === "/api/category-sizing/run") {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed. Use POST." });
      return true;
    }
    const payload = typeof req.body === "object" && req.body != null ? req.body : await readBody(req) || {};
    let ideaText = String(payload.ideaText || payload.categoryName || "").trim();
    const ideaId = String(payload.ideaId || "").trim();
    if (ideaId) {
      if (!(await assertIdeaIdAccess(req.user, ideaId, sendJson, res))) return true;
      if (!ideaText) {
        const idea = await getIdeaById(ideaId);
        ideaText = String(idea?.idea || idea?.result?.idea || "").trim();
      }
    }
    if (!ideaText) {
      sendJson(res, 400, { error: "ideaId or categoryName is required." });
      return true;
    }
    try {
      const billingDepartment = requireUnlockedDepartment(req.user);
      const { parsed, error } = await runWithLlm(
        "claude",
        () =>
          getOrRunCategorySizing({
            ideaText,
            categoryName: payload.categoryName,
            attribute: payload.attribute,
            benchmarkName: payload.benchmarkName,
            isPureCommodity: Boolean(payload.isPureCommodity),
            pricePerUnit: payload.pricePerUnit,
            scope: payload.scope,
          }),
        { department: billingDepartment, userEmail: req.user?.email }
      );
      if (!parsed) {
        sendJson(res, 422, {
          error:
            error === "parse"
              ? "Category sizing research could not be parsed. Re-run."
              : "Category sizing returned no research. Re-run.",
        });
        return true;
      }
      sendJson(res, 201, parsed);
    } catch (e) {
      sendJson(res, e.status || 500, { error: e.message || "Category sizing failed." });
    }
    return true;
  }

  const exportMatch = url.match(/^\/api\/category-sizing\/export\/([^/]+)$/);
  if (exportMatch) {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed. Use GET." });
      return true;
    }
    const runId = decodeURIComponent(exportMatch[1]);
    const existingExport = await getSizingRun(runId);
    if (!existingExport) {
      sendJson(res, 404, { error: "Sizing run not found." });
      return true;
    }
    if (!(await assertRunIdeaAccess(req.user, existingExport, sendJson, res))) return true;
    const buffer = await buildSizingWorkbookBuffer(runId);
    if (!buffer) {
      sendJson(res, 404, { error: "Sizing run not found." });
      return true;
    }
    const safeId = runId.slice(0, 8).replace(/[^a-zA-Z0-9-]/g, "");
    sendXlsx(res, buffer, `category-sizing-${safeId || "run"}.xlsx`);
    return true;
  }

  const engineMatch = url.match(/^\/api\/category-sizing\/([^/]+)\/engine\/([^/]+)$/);
  if (engineMatch) {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed. Use POST." });
      return true;
    }
    const runId = decodeURIComponent(engineMatch[1]);
    const engineId = decodeURIComponent(engineMatch[2]).toUpperCase();
    const payload = typeof req.body === "object" && req.body != null ? req.body : await readBody(req) || {};
    const existing = await getSizingRun(runId);
    if (!existing) {
      sendJson(res, 404, { error: "Sizing run not found." });
      return true;
    }
    if (!(await assertRunIdeaAccess(req.user, existing, sendJson, res))) return true;
    const inputs = payload.inputs && typeof payload.inputs === "object" ? payload.inputs : payload;
    const computed = computeEngine(engineId, inputs);
    if (computed == null) {
      sendJson(res, 400, {
        error: `Engine ${engineId} was not run — a required input is missing.`,
      });
      return true;
    }
    const calibrated = await applyCalibration(engineId, existing.categoryArchetype, computed);
    const nextRun = [...(existing.enginesRun || []).filter((e) => e.engineId !== engineId)];
    nextRun.push({
      engineId,
      inputs,
      estimateCr: calibrated.value,
      rawEstimateCr: computed,
      calibrationNote: calibrated.note,
      sources: Array.isArray(payload.sources) ? payload.sources : [],
      weakness: payload.weakness || "Human override from a primary-source document.",
    });
    const nextNot = (existing.enginesNotRun || []).filter((e) => e.engineId !== engineId);
    const assembled = await recomputeFromEngines(nextRun, nextNot, {
      categoryArchetype: existing.categoryArchetype,
      growthDecomposition: existing.growthDecomposition,
      whatCouldNotBeEstablished: existing.whatCouldNotBeEstablished,
    });
    const updated = await updateSizingRun(runId, assembled);
    sendJson(res, 200, updated);
    return true;
  }

  if (url === "/api/format-trend/run") {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed. Use POST." });
      return true;
    }
    const payload = typeof req.body === "object" && req.body != null ? req.body : await readBody(req) || {};
    let ideaText = String(payload.ideaText || "").trim();
    const ideaId = String(payload.ideaId || "").trim();
    if (ideaId) {
      if (!(await assertIdeaIdAccess(req.user, ideaId, sendJson, res))) return true;
      if (!ideaText) {
        const idea = await getIdeaById(ideaId);
        ideaText = String(idea?.idea || idea?.result?.idea || "").trim();
      }
    }
    if (!ideaText) {
      sendJson(res, 400, { error: "ideaId or ideaText is required." });
      return true;
    }
    try {
      const billingDepartment = requireUnlockedDepartment(req.user);
      const { parsed, error } = await runWithLlm(
        "claude",
        () => runFormatTrend({ ideaText }),
        { department: billingDepartment, userEmail: req.user?.email }
      );
      if (!parsed) {
        sendJson(res, 422, {
          error:
            error === "parse"
              ? "Format-trend research could not be parsed. Re-run."
              : "Format-trend returned no research. Re-run.",
        });
        return true;
      }
      sendJson(res, 201, parsed);
    } catch (e) {
      sendJson(res, e.status || 500, { error: e.message || "Format trend failed." });
    }
    return true;
  }

  return false;
}

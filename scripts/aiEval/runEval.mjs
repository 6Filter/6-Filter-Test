/**
 * Run a labelled set through a pipeline, score fields, audit citations, repeat for stability.
 */
import { usdFromUsage } from "../../lib/goldBudget.js";
import { auditCitations } from "./citationAudit.mjs";
import { SCORE_FIELDS } from "./fields.mjs";
import { parseLabelledSet } from "./labels.mjs";
import { fieldAgreement, fieldStability, scorePrediction } from "./score.mjs";
import { writeReports } from "./report.mjs";

export const DEFAULT_REPEATS = 3;

export async function runEval({
  labelsText,
  pipeline,
  repeats = DEFAULT_REPEATS,
  outDir = "",
  fetchOpts = {},
  includeExamples = false,
} = {}) {
  if (!pipeline || typeof pipeline.run !== "function") {
    throw new Error("pipeline.run is required");
  }
  const ideas = parseLabelledSet(labelsText, { includeExamples });
  if (!ideas.length) throw new Error("no labelled ideas");
  const startedAt = new Date().toISOString();
  const entries = [];
  const byIdea = {};
  const n = Math.max(1, Number(repeats) || DEFAULT_REPEATS);

  for (const idea of ideas) {
    byIdea[idea.id] = [];
    for (let runIndex = 0; runIndex < n; runIndex += 1) {
      const predicted = await pipeline.run(idea, { runIndex });
      const score = scorePrediction(predicted, idea.labels);
      const citationAudit = await auditCitations(predicted, fetchOpts);
      const listPriceUsd = usdFromUsage(predicted.usage || {});
      const entry = {
        ideaId: idea.id,
        runIndex,
        predicted,
        score,
        citationAudit,
        listPriceUsd,
      };
      entries.push(entry);
      byIdea[idea.id].push(entry);
    }
  }

  const agreement = fieldAgreement(entries);
  const stability = fieldStability(byIdea);
  const totals = {
    durationMs: entries.reduce((s, e) => s + (Number(e.predicted?.durationMs) || 0), 0),
    listPriceUsd: entries.reduce((s, e) => s + (Number(e.listPriceUsd) || 0), 0),
    citationChecked: entries.reduce((s, e) => s + (e.citationAudit?.checked || 0), 0),
    citationFound: entries.reduce((s, e) => s + (e.citationAudit?.found || 0), 0),
    citationMissing: entries.reduce((s, e) => s + (e.citationAudit?.missing || 0), 0),
    citationBlocked: entries.reduce((s, e) => s + (e.citationAudit?.blocked || 0), 0),
  };
  const summary = {
    startedAt,
    pipeline: pipeline.name || "unknown",
    repeats: n,
    ideaCount: ideas.length,
    fields: SCORE_FIELDS,
    totals,
  };
  let paths = null;
  if (outDir) {
    paths = writeReports(outDir, { entries, agreement, stability, summary });
  }
  return { ideas, entries, agreement, stability, summary, paths };
}

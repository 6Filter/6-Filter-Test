/**
 * Adapter around the production research pipeline.
 * Never reads eval-key.txt or any key file. Never points at live Render/Neon/Supabase.
 * Live calls require { live: true } and ANTHROPIC_API_KEY already in the environment.
 */
import { TECH_SHIFT_DIMS, normalizeRisk, normalizeYesNo, normalizeVerdict, parseGst } from "./fields.mjs";

const LIVE_DB_HINT = /render\.com|neon\.tech|supabase\.co|onrender\.com/i;

export function envLooksLikeLiveDatabase(env = process.env) {
  for (const key of ["DATABASE_URL", "POSTGRES_URL"]) {
    const v = String(env[key] || "");
    if (LIVE_DB_HINT.test(v)) return true;
  }
  return false;
}

export function assertSafeToRunLive(env = process.env) {
  if (envLooksLikeLiveDatabase(env)) {
    const err = new Error("refusing live database (Render/Neon/Supabase)");
    err.code = "EVAL_LIVE_DB";
    throw err;
  }
  const key = String(env.ANTHROPIC_API_KEY || "").trim();
  if (!key) {
    const err = new Error("ANTHROPIC_API_KEY is not set in the environment; will not read key files");
    err.code = "EVAL_NO_KEY";
    throw err;
  }
}

function relevanceToYesNo(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (["strong", "adequate", "relevant", "supported", "yes", "true"].includes(s)) return "yes";
  if (["none", "weak", "not-relevant", "not-found", "no", "false", "contradicted"].includes(s)) return "no";
  return "";
}

function eventsDatedAndSourced(events) {
  const list = Array.isArray(events) ? events : [];
  if (!list.length) return false;
  return list.every((e) => {
    const date = String(e?.date || "").trim();
    const url = String(e?.source_url || e?.sourceUrl || "").trim();
    return Boolean(date) && Boolean(url);
  });
}

function techFromFindings(research, suggestions) {
  const dims =
    suggestions?.f4?.techShiftRisk?.dimensions ||
    research?.f4?.techShiftRisk?.dimensions ||
    research?.f4?.dimensions ||
    {};
  const out = {};
  for (const key of TECH_SHIFT_DIMS) {
    const n = normalizeRisk(dims[key]?.risk ?? dims[key]);
    if (n) out[key] = n;
  }
  return out;
}

function pushCite(out, seen, url, quote, field) {
  const u = String(url || "").trim();
  const q = String(quote || "").trim();
  if (!u) return;
  const key = `${u}|${q}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ url: u, quote: q, field });
}

function walkCitations(research = {}, suggestions = {}) {
  const out = [];
  const seen = new Set();
  const f1 = research.f1 || {};
  const assessments = f1.assessments || {};
  for (const [name, a] of Object.entries(assessments)) {
    const raw = a?.raw || a || {};
    pushCite(out, seen, raw.source_url || raw.sourceUrl, raw.quote, `f1.${name}`);
  }
  const bc = f1.benchmarkCheck || {};
  pushCite(out, seen, bc.source_url, bc.quote || bc.reason, "benchmark");
  const claims = f1.claimChecks || {};
  for (const [name, block] of Object.entries(claims)) {
    const list = Array.isArray(block?.claims) ? block.claims : [block];
    for (const c of list) {
      pushCite(out, seen, c?.source_url, c?.quote, `claim.${name}`);
    }
  }
  const events = research.f3?.priceEvents?.events || research.f3?.events || [];
  for (const e of events) {
    pushCite(out, seen, e.source_url || e.sourceUrl, e.quote, "price-event");
  }
  const sources = research.sources || suggestions.sources || [];
  for (const s of Array.isArray(sources) ? sources : []) {
    pushCite(out, seen, s.url || s.source_url, s.quote || s.title, "source");
  }
  return out;
}

export function extractPredicted({ research = {}, suggestions = {}, verdictBand = "", usage = {}, durationMs = 0, id = "" } = {}) {
  const f1 = research.f1 || {};
  const f2 = research.f2 || {};
  const gst =
    parseGst(f2.costEstimate?.estimatedGstRatePct) ??
    parseGst(f2.costEstimate?.gstRatePct) ??
    parseGst(suggestions.f2?.gstRatePct) ??
    parseGst(f2.assessments?.gst?.raw?.gstRatePct);
  const benchRaw =
    f1.assessments?.benchmark?.raw?.relevance ||
    f1.benchmarkCheck?.status ||
    (f1.benchmarkVerified === true ? "relevant" : f1.benchmarkVerified === false ? "not-found" : "");
  const gapRaw =
    f1.assessments?.derivation?.raw?.relevance ||
    f1.claimChecks?.gapDerivation?.relevance ||
    f1.claimChecks?.gapDerivation?.verdict;
  const routeRaw = f1.routeCheck?.matches ?? f1.assessments?.route?.raw?.matches;
  const events = research.f3?.priceEvents?.events || research.f3?.events || [];
  return {
    id,
    gstRatePct: gst,
    benchmarkRelevant: relevanceToYesNo(benchRaw) || normalizeYesNo(benchRaw),
    gapCredible: relevanceToYesNo(gapRaw) || normalizeYesNo(gapRaw),
    priceEventsDatedAndSourced: eventsDatedAndSourced(events),
    techShift: techFromFindings(research, suggestions),
    routeMatches: normalizeYesNo(routeRaw === true ? "yes" : routeRaw === false ? "no" : routeRaw),
    verdictBand: normalizeVerdict(verdictBand),
    citations: walkCitations(research, suggestions),
    usage: {
      inputTokens: Number(usage.inputTokens) || 0,
      outputTokens: Number(usage.outputTokens) || 0,
      cacheRead: Number(usage.cacheRead) || 0,
      cacheWrite: Number(usage.cacheWrite) || 0,
      searches: Number(usage.searches) || 0,
    },
    durationMs: Number(durationMs) || 0,
  };
}

/**
 * Live adapter. Tests must not call this.
 * @param {{ live?: boolean }} opts
 */
export function createRealPipeline(opts = {}) {
  return {
    name: "real",
    async run(idea, { runIndex = 0 } = {}) {
      if (opts.live !== true) {
        const err = new Error("real pipeline requires { live: true }; refusing to spend Anthropic");
        err.code = "EVAL_NOT_LIVE";
        throw err;
      }
      assertSafeToRunLive(process.env);
      const started = Date.now();
      const { runPropositionResearch } = await import("../../lib/propositionAiFirstPass.js");
      const { computeAllAdvisoryChecks } = await import("../../lib/propositionScoring.js");
      const { computeGoNoGo } = await import("../../lib/goNoGo.js");
      const { openSubmissionCost, currentSubmissionCost, closeSubmissionCost } = await import("../../lib/submissionCost.js");
      const { initDb } = await import("../../lib/db.js");
      await initDb();
      openSubmissionCost(idea.id || idea.name || `eval-${runIndex}`);
      try {
        const research = await runPropositionResearch({
          ideaText: idea.ideaDescription || idea.name || "",
          proposition: idea,
          division: idea.division || "",
          forceFresh: true,
        });
        const bag = currentSubmissionCost() || {};
        const checks = await computeAllAdvisoryChecks({
          ...idea,
          researchFindings: research.researchFindings,
        });
        return extractPredicted({
          id: idea.id,
          research: research.researchFindings || {},
          suggestions: research.suggestions || {},
          verdictBand: computeGoNoGo(checks),
          usage: bag,
          durationMs: Date.now() - started,
        });
      } finally {
        closeSubmissionCost();
      }
    },
  };
}

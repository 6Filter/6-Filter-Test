/**
 * REFERENCE ONLY (tested against testProofAnalysis.mjs and testFinalScoring.mjs). Put in lib/proofAnalysis.js.
 * Pure and deterministic: no clock, no network, no AI. The AI reads the file and returns FACTS (a quote, a figure, where it was, who produced it);
 * everything below decides, in code, whether a fact counts, how much credit it earns, and what the final verdict is.
 *
 * The flow it supports:
 *   screening verdict (Filters 1-4, 18 checks)  ->  proof file uploaded  ->  facts graded  ->  Filter 5 scored (3 checks)  ->  final verdict over 21 checks.
 */
import { scoreAdvisoryChecks, goNoGoIsFloorFailure, hasGoCap, classifyGoNoGoFromScore } from "./goNoGo.js";
import { RELEVANCE_CREDIT } from "./relevanceGrade.js";
import { computeF5Revenue } from "./propositionScoring.js";
import { createHash } from "node:crypto";

export const FINAL_RULESET_VERSION = "v6.0";
export const FINAL_SLOTS = Object.freeze({ f1: 7, f2: 3, f3: 1, f4: 7, f5: 3 });
export const FINAL_TOTAL = Object.values(FINAL_SLOTS).reduce((a, b) => a + b, 0); // 21
export const F5_SLOT_KEYS = Object.freeze(["revenue", "householdModel", "outOfRange"]);
export const FACTOR_TOPICS = Object.freeze({ households: "f5.householdsReachedY3Mn", trial: "f5.trialRatePct", repeat: "f5.repeatConversionPct", frequency: "f5.purchaseFrequencyYr", packValue: "f5.avgPackValueInr" });
export const PROOF_MAX_AGE_YEARS = 3;
export const CONFLICT_TOLERANCE = 0.25;
const STRONG_METHODS = new Set(["syndicated", "retail audit", "panel", "company sales", "filings", "census", "regulator"]);
const LEVEL_ORDER = { none: 0, weak: 1, adequate: 2, strong: 3 };
const LEVELS = ["none", "weak", "adequate", "strong"];
const minLevel = (...ls) => LEVELS[Math.min(...ls.map((l) => LEVEL_ORDER[l] ?? 0))];
const creditFor = (level) => RELEVANCE_CREDIT[level] ?? 0;

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
export const quoteInText = (quote, fileText) => { const q = norm(quote); return q.length >= 12 && norm(fileText).includes(q); };
export const figureInQuote = (value, quote) => {
  if (value == null || value === "") return true;
  const n = Number(value); if (!Number.isFinite(n)) return true;
  const nums = (String(quote).replace(/,/g, "").match(/\d+(?:\.\d+)?/g) || []).map(Number);
  return nums.some((x) => Math.abs(x - n) < 1e-9);
};
const INJECTION = /ignore (all|any|the|previous|above)|disregard (all|the|previous)|you must (now )?(mark|rate|score|approve)|system prompt|as an ai|mark this as (strong|go)/i;
const INDIA = /india|pan-?india|all-?india|national/i;
const tokens = (s) => new Set(norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));

/** Grade ONE fact. ctx = { fileText, launchGeography, categoryTerms: string[], nowYear }. Never reads a clock. */
export function gradeFact(fact = {}, ctx = {}) {
  const reasons = []; const f = fact || {};
  const year = Number(f.period?.year ?? f.source?.year) || null;
  if (!quoteInText(f.quote, ctx.fileText)) reasons.push("quote-not-in-file");
  if (!figureInQuote(f.value, f.quote)) reasons.push("figure-not-in-quote");
  if (INJECTION.test(String(f.quote || "")) || INJECTION.test(String(f.statement || ""))) reasons.push("instruction-in-file");
  const geo = norm(f.geography);
  if (geo && !INDIA.test(geo) && !(ctx.launchGeography && geo.includes(norm(ctx.launchGeography)))) reasons.push("wrong-geography");
  if (year && ctx.nowYear && ctx.nowYear - year > PROOF_MAX_AGE_YEARS) reasons.push("stale");
  const factCat = tokens(f.category); const want = new Set((ctx.categoryTerms || []).flatMap((t) => [...tokens(t)]));
  if (factCat.size && want.size && ![...factCat].some((w) => want.has(w))) reasons.push("wrong-category");
  const rejected = reasons.length > 0;
  if (rejected) return { ...f, accepted: false, level: "none", credit: 0, reasons };
  const s = f.source || {}; const method = norm(s.method);
  const strongMethod = STRONG_METHODS.has(method) || (method === "survey" && Number(s.sampleSize) >= 1000);
  let level = s.publisher && year && strongMethod ? "strong" : s.publisher && year ? "adequate" : "weak";
  if (method === "survey" && !(Number(s.sampleSize) >= 300)) level = minLevel(level, "adequate");
  if (!geo) { level = minLevel(level, "adequate"); reasons.push("geography-not-stated"); }
  if (!factCat.size) { level = minLevel(level, "adequate"); reasons.push("category-not-stated"); }
  if (!year) { level = minLevel(level, "weak"); reasons.push("period-not-stated"); }
  return { ...f, accepted: true, level, credit: creditFor(level), reasons };
}
export const gradeFacts = (facts = [], ctx = {}) => (Array.isArray(facts) ? facts : []).map((f) => gradeFact(f, ctx));

/** Is the file usable? "usable": every Filter 5 factor has an accepted fact; "partly": something accepted; "not-usable": nothing. */
export function proofUsability(graded = []) {
  const accepted = graded.filter((g) => g.accepted); const have = new Set(accepted.map((g) => g.topic));
  const missing = Object.values(FACTOR_TOPICS).filter((t) => !have.has(t));
  const rejected = graded.filter((g) => !g.accepted);
  const status = !accepted.length ? "not-usable" : missing.length ? "partly" : "usable";
  const reasons = [...new Set(rejected.flatMap((g) => g.reasons))].sort();
  return { status, acceptedCount: accepted.length, rejectedCount: rejected.length, missingFactors: missing, reasons };
}

/** The five factors from the best accepted fact per topic. Unresolved conflicts withhold the factor. Order of facts never matters. */
export function extractFactors(graded = []) {
  const factors = {}; const levels = {}; const conflicts = [];
  for (const [name, topic] of Object.entries(FACTOR_TOPICS)) {
    const c = graded.filter((g) => g.accepted && g.topic === topic && Number.isFinite(Number(g.value)))
      .sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] || (Number(b.period?.year ?? b.source?.year) || 0) - (Number(a.period?.year ?? a.source?.year) || 0) || String(a.quote).localeCompare(String(b.quote)));
    if (!c.length) continue;
    const [top, second] = c; const differs = second && Math.abs(Number(top.value) - Number(second.value)) / Math.max(Math.abs(Number(top.value)), 1e-9) > CONFLICT_TOLERANCE;
    if (differs && top.level === second.level) { conflicts.push({ topic, values: [top.value, second.value].sort((x, y) => x - y), resolved: false }); continue; }
    if (differs) conflicts.push({ topic, values: [top.value, second.value].sort((x, y) => x - y), resolved: true, resolvedBy: "credibility" });
    factors[topic.replace("f5.", "")] = Number(top.value); levels[topic] = top.level;
  }
  return { factors, levels, conflicts };
}
const toF5 = (factors = {}) => ({ householdsReachedY3Mn: factors.householdsReachedY3Mn, trialRatePct: factors.trialRatePct, repeatConversionPct: factors.repeatConversionPct, purchaseFrequencyYr: factors.purchaseFrequencyYr, avgPackValueInr: factors.avgPackValueInr });
export const f5RevenueFromFactors = (factors = {}) => computeF5Revenue(toF5(factors));

/** Does the file's own stated revenue agree with its own factors (within 20%)? */
export function arithmeticConsistent(graded = [], factors = {}) {
  const stated = graded.find((g) => g.accepted && g.topic === "f5.statedRevenueCr"); const calc = f5RevenueFromFactors(factors);
  if (!stated || calc == null) return { checked: false, consistent: true };
  const s = Number(stated.value); return { checked: true, consistent: s > 0 && Math.abs(s - calc) / s <= 0.2, stated: s, calculated: Math.round(calc * 100) / 100 };
}

/** The three Filter 5 checks. research: "supports" | "partly" | "contradicts" | "unknown". norms: { trialRatePct:[lo,hi], ... }. argued: { "f5.trialRatePct": "text" }. */
export function scoreF5({ factors = {}, levels = {}, conflicts = [], inconsistent = false, target = null, norms = {}, argued = {}, research = "unknown" } = {}) {
  const have = (k) => Number.isFinite(Number(factors[k])); const all5 = ["householdsReachedY3Mn", "trialRatePct", "repeatConversionPct", "purchaseFrequencyYr", "avgPackValueInr"].every(have);
  const lvl = (k) => levels[`f5.${k}`] || "none"; const item = (slot, status, level, reasons, text) => ({ slot, status, level, credit: creditFor(level), reasons, text });
  let revenue;
  if (!all5) revenue = item("revenue", "pending", "none", ["factors-missing"], "Year-3 revenue cannot be sized: the file does not give every factor with a source");
  else if (target == null) revenue = item("revenue", "pending", "none", ["target-missing"], "No revenue target for this division");
  else { const r = f5RevenueFromFactors(factors); const lv = minLevel(...["householdsReachedY3Mn", "trialRatePct", "repeatConversionPct", "purchaseFrequencyYr", "avgPackValueInr"].map(lvl));
    revenue = r >= target ? item("revenue", "done", lv, lv === "weak" ? ["weak-evidence"] : [], `Year-3 revenue ₹${r.toFixed(1)} Cr meets the ₹${target} Cr target`) : item("revenue", "pending", "none", ["below-target", "mark-down"], `Year-3 revenue ₹${r.toFixed(1)} Cr is below the ₹${target} Cr target`); }
  const core = ["householdsReachedY3Mn", "trialRatePct", "repeatConversionPct"]; let hm;
  if (!core.every(have)) hm = item("householdModel", "pending", "none", ["factors-missing"], "The household model is not supported by the file");
  else { let lv = minLevel(...core.map(lvl)); const reasons = [];
    if (research === "contradicts") { lv = "none"; reasons.push("research-contradicts", "mark-down"); } else if (research !== "supports") { lv = minLevel(lv, "adequate"); reasons.push(research === "partly" ? "research-partly" : "research-not-checked"); }
    if (inconsistent) { lv = minLevel(lv, "weak"); reasons.push("file-numbers-do-not-add-up"); }
    hm = item("householdModel", lv === "none" ? "pending" : "done", lv, reasons, lv === "none" ? "Research contradicts the household model" : "Household model supported"); }
  let oor; const out = Object.keys(norms).filter((k) => have(k) && (Number(factors[k]) < norms[k][0] || Number(factors[k]) > norms[k][1]));
  if (!all5) oor = item("outOfRange", "pending", "none", ["factors-missing"], "Factors not yet available to compare with the category");
  else if (!out.length) oor = item("outOfRange", "done", "strong", [], "Every factor is within the category range");
  else if (out.every((k) => String(argued[`f5.${k}`] || "").trim().length >= 40)) oor = item("outOfRange", "done", "adequate", ["argued"], `Out-of-range factors argued in writing: ${out.join(", ")}`);
  else oor = item("outOfRange", "pending", "none", ["out-of-range-not-argued"], `Out of range and not argued: ${out.filter((k) => String(argued[`f5.${k}`] || "").trim().length < 40).join(", ")}`);
  const items = [revenue, hm, oor]; const unresolved = conflicts.some((c) => !c.resolved);
  // v4: missing evidence is a fail. A GO needs all three Filter 5 checks done, none resting on weak evidence, no unresolved conflict and numbers that add up.
  const capsGo = items.some((i) => i.status !== "done" || i.level === "weak") || unresolved || inconsistent;
  const credited = items.filter((i) => i.credit > 0).length;
  return { checkLabel: capsGo ? "Marked down" : credited === 3 ? "Cleared" : "Evidence missing", items, capsGo };
}

/** Points and percent over the 21 final checks (the 18 screening checks plus the 3 Filter 5 checks). */
export function finalScore(screeningChecks = {}, f5Check = { items: [] }) {
  const base = scoreAdvisoryChecks(screeningChecks); const f5points = (f5Check.items || []).reduce((s, i) => s + (Number(i.credit) || 0), 0);
  const points = Math.round((Number(base.done) + f5points) * 1000) / 1000; const total = FINAL_TOTAL;
  return { points, total, pct: Math.round((100 * points) / total), screeningPoints: Number(base.done), f5Points: Math.round(f5points * 1000) / 1000 };
}
/** GO above 80, WATCH 60-80, NO-GO below 60, with the same caps as screening: the Filter 4 hard stop, a mark-down, a below-target revenue, an unresolved contradiction. */
export function finalVerdict({ screeningChecks = {}, f5Check = { items: [] }, contradictions = [] } = {}) {
  if (goNoGoIsFloorFailure(screeningChecks)) return "NO-GO";
  const band = classifyGoNoGoFromScore(finalScore(screeningChecks, f5Check).pct);
  const capped = hasGoCap(screeningChecks) || f5Check.capsGo === true || contradictions.some((c) => c && c.resolved !== true);
  return band === "GO" && capped ? "WATCH" : band;
}

/** Who may upload proof: GO, or WATCH after a manager approved it. NO-GO and INCOMPLETE never. */
export function canUploadProof(doc = {}) {
  const c = String(doc?.goNoGo?.classification || doc?.classification || "").trim(); const approved = Boolean(doc?.managerReviewState?.isApproved || doc?.managerApproval?.approvedAt || doc?.managerReview?.approvedAt);
  if (c === "GO") return { allowed: true }; if (c === "WATCH") return approved ? { allowed: true } : { allowed: false, reason: "A WATCH idea needs a manager's approval before proof can be uploaded." };
  return { allowed: false, reason: c === "NO-GO" ? "A NO-GO idea cannot be rescued with a file." : "The screening verdict is not finished yet." };
}

/** The sealed final output: the same file and inputs always give the same fingerprint and the same object. */
export function sealFinal({ screeningChecks, f5Check, graded = [], contradictions = [], fileSha256 = "", nowYear = 0 } = {}) {
  const score = finalScore(screeningChecks, f5Check); const classification = finalVerdict({ screeningChecks, f5Check, contradictions });
  const sources = graded.filter((g) => g.accepted).map((g) => ({ topic: g.topic, quote: g.quote, location: g.location || "", publisher: g.source?.publisher || "", year: Number(g.period?.year ?? g.source?.year) || null, level: g.level })).sort((a, b) => String(a.topic + a.quote).localeCompare(String(b.topic + b.quote)));
  const fingerprint = createHash("sha256").update(JSON.stringify({ v: FINAL_RULESET_VERSION, fileSha256, sources, score, classification })).digest("hex");
  return { stage: "final", rulesetVersion: FINAL_RULESET_VERSION, classification, score, f5: f5Check, sources, contradictions, fingerprint };
}

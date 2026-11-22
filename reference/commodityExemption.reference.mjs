/**
 * REFERENCE ONLY (tested against testPureCommodityExemption.mjs). Put in lib/commodityExemption.js.
 * Your v4 document exempts pure commodities from Filter 1. Today a person can tick "Pure commodity" and receive full credit on all 7 Filter 1 checks (39% of the score) with nothing entered.
 * Here the exemption is a RESEARCH finding with a source; the person's tick never decides; and an exempt idea is scored over the checks that remain (11 at screening, 14 in the final), never given free credit.
 */
import { scoreAdvisoryChecks, classifyGoNoGoFromScore, goNoGoIsFloorFailure, hasGoCap } from "./goNoGo.js";
export const F1_SLOT_COUNT = 7;
export const SCREENING_TOTAL = 18; export const SCREENING_TOTAL_EXEMPT = SCREENING_TOTAL - F1_SLOT_COUNT; // 11
export const FINAL_TOTAL = 21; export const FINAL_TOTAL_EXEMPT = FINAL_TOTAL - F1_SLOT_COUNT; // 14
const MIN_QUOTE = 12;
/** finding = { pureCommodity: boolean, reason, source_url, quote, confidence: "high" | "medium" | "low" } from the research step. returnedSources = the addresses the search actually returned. */
export function decideExemption({ claimed = false, finding = null, returnedSources = [] } = {}) {
  const why = (code, message) => ({ exempt: false, code, message: claimed ? `Research did not support treating this as a pure commodity: ${message}` : message, evidence: null });
  if (!finding || typeof finding !== "object") return why("no-research", "the research has not looked at it yet.");
  if (finding.pureCommodity !== true) return why("research-says-no", String(finding.reason || "it is a differentiated product.").trim());
  if (String(finding.quote || "").trim().length < MIN_QUOTE) return why("no-quote", "the finding has no quote.");
  if (!finding.source_url) return why("no-source", "the finding has no source.");
  if (!(returnedSources || []).includes(finding.source_url)) return why("source-not-returned", "the source was not among the pages the search returned.");
  if (String(finding.confidence || "").toLowerCase() === "low") return why("low-confidence", "the research is not confident.");
  return { exempt: true, code: "supported", message: "Research found this is a pure commodity, so Filter 1 does not apply.", evidence: { source_url: finding.source_url, quote: String(finding.quote).trim(), reason: String(finding.reason || "") } };
}
/** The screening score: over 18 checks, or over the 11 that remain when Filter 1 is exempt. */
export function scoreScreening(checks = {}, { exempt = false } = {}) {
  const s = exempt ? scoreAdvisoryChecks(checks, ["f2", "f3", "f4"]) : scoreAdvisoryChecks(checks);
  return { points: Number(s.done), total: exempt ? SCREENING_TOTAL_EXEMPT : SCREENING_TOTAL, pct: Number(s.pct), exempt };
}
export function screeningVerdict(checks = {}, { exempt = false } = {}) {
  if (goNoGoIsFloorFailure(checks)) return "NO-GO";
  const { pct } = scoreScreening(checks, { exempt }); const band = classifyGoNoGoFromScore(pct);
  const forCaps = exempt ? { ...checks, f1: undefined } : checks;
  return band === "GO" && hasGoCap(forCaps) ? "WATCH" : band;
}
/** The final score (Part 144): the screening points plus the three Filter 5 checks, over 21, or over 14 when Filter 1 is exempt. */
export function finalScoreWithExemption(checks = {}, f5Check = { items: [] }, { exempt = false } = {}) {
  const base = scoreScreening(checks, { exempt }); const f5 = (f5Check.items || []).reduce((a, i) => a + (Number(i.credit) || 0), 0);
  const points = Math.round((base.points + f5) * 1000) / 1000; const total = exempt ? FINAL_TOTAL_EXEMPT : FINAL_TOTAL;
  return { points, total, pct: Math.round((100 * points) / total), exempt };
}

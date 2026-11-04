/**
 * Part 133 D23 — run labelled calibration set through gradeAssessment (no live LLM unless --live).
 * Refuses to report figures for a set marked provisional.
 *
 * Usage:
 *   node scripts/measureRelevanceGrading.mjs path/to/calibration.json
 *
 * calibration.json shape:
 * {
 *   "provisional": false,
 *   "ideas": [{ "id", "expected": { "benchmark": "strong", ... }, "assessments": { ... }, "ctx": { ... } }]
 * }
 */
import { readFileSync } from "node:fs";
import { gradeAssessment } from "../lib/relevanceGrade.js";

const LEVELS = ["none", "weak", "adequate", "strong"];
const RANK = Object.fromEntries(LEVELS.map((l, i) => [l, i]));

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/measureRelevanceGrading.mjs <calibration.json>");
  process.exit(1);
}

const set = JSON.parse(readFileSync(path, "utf8"));
if (set.provisional === true) {
  console.error("Calibration set is marked provisional — refusing to report a figure.");
  process.exit(2);
}

const kinds = ["benchmark", "claims", "route", "plan", "evidence"];
const stats = Object.fromEntries(
  kinds.map((k) => [k, { n: 0, exact: 0, within1: 0, confusion: Object.fromEntries(LEVELS.map((a) => [a, Object.fromEntries(LEVELS.map((b) => [b, 0]))])) }])
);
const disagreements = [];

for (const idea of set.ideas || []) {
  const expected = idea.expected || {};
  for (const kind of kinds) {
    if (expected[kind] == null) continue;
    const block = idea.assessments?.[kind];
    const raw = block?.raw ?? (block && (block.relevance != null || block.matches != null) ? block : null);
    const ctx = {
      entered: true,
      humanWritten: true,
      ...(idea.ctx?.[kind] || {}),
      ...(block?.returnedSources ? { returnedSources: block.returnedSources } : {}),
    };
    const got = gradeAssessment(kind, raw, ctx);
    const exp = String(expected[kind]).toLowerCase();
    const st = stats[kind];
    st.n += 1;
    st.confusion[exp] = st.confusion[exp] || Object.fromEntries(LEVELS.map((b) => [b, 0]));
    st.confusion[exp][got.level] = (st.confusion[exp][got.level] || 0) + 1;
    if (got.level === exp) st.exact += 1;
    if (Math.abs((RANK[got.level] ?? 0) - (RANK[exp] ?? 0)) <= 1) st.within1 += 1;
    else disagreements.push({ id: idea.id, kind, expected: exp, got: got.level, reasons: got.reasons });
  }
}

console.log("=== Relevance calibration ===");
for (const kind of kinds) {
  const st = stats[kind];
  if (!st.n) continue;
  const exact = ((100 * st.exact) / st.n).toFixed(1);
  const within1 = ((100 * st.within1) / st.n).toFixed(1);
  console.log(`${kind}: n=${st.n} exact=${exact}% within1=${within1}% (targets ≥65% / ≥85%)`);
  console.log("  confusion (rows=expected, cols=got):", JSON.stringify(st.confusion));
}
if (disagreements.length) {
  console.log("Disagreements:");
  for (const d of disagreements.slice(0, 40)) {
    console.log(`  ${d.id} ${d.kind}: expected ${d.expected} got ${d.got} (${(d.reasons || []).join(",")})`);
  }
}

export function measureCalibrationSet(set) {
  // Re-exportable for unit tests
  return { stats, disagreements };
}

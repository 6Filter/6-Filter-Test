/**
 * THE SCOPE-TO-IMPROVE PANEL (closest path to GO) TELLS THE TRUTH. Pure: the real check builder and the real path code, no database, no browser, no AI. Exits 1 if any check fails.
 * For 14 ideas (every kind of weakness: a benchmark, attribute, claim or route that the web search found wrong or thin, a margin below the minimum, a missing pack size, a low gap,
 * Filter 4 risks, several weak at once, a near-GO and a GO) every suggestion is APPLIED to a copy of the idea and the score is recomputed.
 *  PA every suggestion is worth something (a gain above 0)
 *  PB the gain it promises equals the gain it really delivers (within one percentage point of rounding)
 *  PC the score shown after "these checks clear" equals the score you really reach when they all do, and is never below today's
 *  PD when there is something to improve, the score after improving is HIGHER than today's, never the same or lower
 *  PE nothing is suggested for a check that is already at full credit
 *  PF a suggestion for a check the AI web-searched carries the web finding (its reason or its source), not just "weak" or "none"
 *  PG the panel never says GO when the verdict is not GO
 *  PH named checks, not "Screen again - N checks still open", whenever a named check is open
 *  PI a GO idea is not given a path that lowers it
 */
import * as gn from "../lib/goNoGo.js"; import { buildPathToGo } from "../lib/improvementPoints.js";
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js"); const { TECH_SHIFT_DIMENSIONS } = await import("../lib/techShiftRisk.js");
let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const SRC = "https://source.example/finding"; const A = (raw) => ({ raw, status: "ok", searchUsed: true, returnedSources: [SRC] }); const GOOD = { relevance: "strong", specific: true, supported: true, source_url: SRC, quote: "q" };
const dimsOf = (n) => Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k, i) => [k, { risk: i < n ? "Medium" : "Low", reason: "Some exposure (source: source.example)" }]));
const f4a = (bad) => Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k, i) => [k, A({ rating: i < bad ? "Medium" : "Low", supported: i >= bad, source_url: SRC, quote: "q" })]));
const F = (slot, level, extra = {}) => A({ relevance: level, specific: level !== "none", supported: level === "strong" || level === "adequate", source_url: SRC, quote: "q", reason: `FINDING-${slot}-7f3 ${slot} was ${level} on the web check`, ...extra });
const mk = ({ over = {}, bad = 0, f1 = {}, f2 = {} } = {}) => ({ division: "Personal Care", category: "Serum", name: "Hair serum", ideaDescription: "A leave-on serum that visibly reduces hair fall in eight weeks",
  f1: { declaredAttribute: "Visible hair fall reduction", benchmark: "Dove Scalp Serum 100 ml", declaredGap: 3, gapDerivation: "2% caffeine versus none", parityExceptions: "No fragrance", growthRoute: "frequency", growthArgument: "Scalp care is growing", ...f1 },
  f2: { cogsAtScale: 100, gstRatePct: 18, netMarginAtScale: 60, grammage: "100 ml", mrpInr: 295, ...f2 }, f4: { techShiftRisk: { overallRisk: bad ? "Medium" : "Low", dimensions: dimsOf(bad) } },
  researchFindings: { f3: { priceEvents: { annualIncreasePct: 5, events: [] } }, evidenceRead: { status: "read", facts: [{ topic: "attribute", verified: true, quote: "q" }, { topic: "benchmark", verified: true, quote: "q" }] }, f2: { assessments: { gst: A({ ratePct: 18, supported: true, source_url: SRC, quote: "q" }) } }, f4: { assessments: f4a(bad) },
    f1: { benchmarkVerified: true, assessments: { benchmark: A({ relevance: "strong", source_url: SRC }), derivation: A(GOOD), parity: A(GOOD), argument: A(GOOD), attributes: A({ relevance: "strong", specific: true }), route: A({ matches: "yes", confidence: "high" }), ...over } } } });
const SC = [
  ["benchmark: web search says it is not sold in India", mk({ over: { benchmark: F("benchmark", "none") } })], ["attribute: web check finds it thin", mk({ over: { attributes: F("attributes", "weak") } })],
  ["gap derivation: claim only partly supported", mk({ over: { derivation: F("derivation", "weak") } })], ["parity: a claim the web search contradicts", mk({ over: { parity: F("parity", "none") } })],
  ["growth route: web says it should be new market", mk({ over: { route: A({ matches: "no", confidence: "high", expected: "new-market", reason: "FINDING-route-7f3 the target buyers are new to the category" }) } })], ["growth argument: irrelevant", mk({ over: { argument: F("argument", "none") } })],
  ["three weak at once", mk({ over: { derivation: F("derivation", "weak"), argument: F("argument", "weak"), parity: F("parity", "adequate") } })], ["net margin below the minimum", mk({ f2: { netMarginAtScale: 40 } })],
  ["pack size missing", mk({ f2: { grammage: "" } })], ["declared gap of 1", mk({ f1: { declaredGap: 1 } })], ["Filter 4: two dimensions Medium", mk({ bad: 2 })],
  ["every Filter 1 claim weak", mk({ over: { benchmark: F("benchmark", "weak"), attributes: F("attributes", "weak"), derivation: F("derivation", "weak"), parity: F("parity", "weak"), argument: F("argument", "weak"), route: A({ matches: "unclear", confidence: "low", reason: "FINDING-route-7f3 unclear" }) } })],
  ["near GO: one adequate claim", mk({ over: { argument: F("argument", "adequate") } })], ["GO: everything strong", mk()],
];
const deep = (x) => JSON.parse(JSON.stringify(x)); const slotsOrder = TECH_SHIFT_DIMENSIONS;
function fixOne(checks, action) { const c = deep(checks); const parts = String(action.id).split(":"); const fk = parts[0]; const slot = parts[1]; if (!c[fk] || slot === "not-run" || slot === "open") return null; let hit = false;
  const items = c[fk].items || []; for (let i = 0; i < items.length; i++) { const it = items[i]; const match = it.slot ? it.slot === slot : fk === "f4" && slotsOrder.indexOf(slot) === i; if (match) { it.status = "done"; it.level = "strong"; it.credit = 1; hit = true; } }
  if (!hit) return null; if (items.every((it) => it.status === "done" || it.formAdmin)) c[fk].checkLabel = "Cleared"; return c; }
const pts = (c) => Number(gn.scoreAdvisoryChecks(c).points); const total = (c) => Number(gn.scoreAdvisoryChecks(c).total); const pct = (c) => (100 * pts(c)) / total(c);
const bad = { gain: [], promise: [], proj: [], greater: [], full: [], ground: [], go: [], generic: [], goLower: [] };
for (const [name, doc] of SC) {
  const checks = await computeAllAdvisoryChecks(doc); const now = pct(checks); const verdict = gn.computeGoNoGo(checks); const path = buildPathToGo({ advisoryChecks: checks, doc }); const actions = [...(path.blockers || []), ...(path.actions || [])].filter((a) => a.filter !== "INPUT");
  const headline = String(path.headline || "") + " " + String(path.message || "");
  if (/\bGO\b/.test(headline) && !/NO-GO/.test(headline.replace(/GO, above 80%/, "")) && verdict !== "GO") bad.go.push(`${name}: verdict ${verdict} but the panel says "${String(path.headline).slice(0, 40)}"`);
  if (verdict === "GO" && path.kind !== "go") bad.go.push(`${name}: verdict GO but the panel kind is ${path.kind}`);
  const specific = actions.filter((a) => !/^rescreen|:not-run|:open/.test(String(a.id))); if (specific.length && actions.some((a) => /^rescreen/.test(String(a.id)))) bad.generic.push(name);
  let all = deep(checks); let simulated = 0;
  for (const a of actions) { const one = fixOne(checks, a); if (!one) continue; simulated++; const real = pct(one) - now; const gain = Number(a.gainPct);
    if (!(gain > 0)) bad.gain.push(`${name}: "${String(a.text).slice(0, 40)}" worth ${gain}`); if (Math.abs(real - gain) > 1.0) bad.promise.push(`${name}: "${String(a.id).slice(0, 26)}" promises +${gain.toFixed(1)} but gives +${real.toFixed(1)}`); if (real <= 1e-9) bad.full.push(`${name}: "${String(a.id).slice(0, 30)}" is already at full credit`);
    const slot = String(a.id).split(":")[1]; if (/FINDING/.test(JSON.stringify(doc.researchFindings.f1.assessments[slot] || {})) && a.filter === "F1") { const blob = `${a.text} ${a.why || ""} ${a.instruction || ""}`; if (!(blob.includes(`FINDING-${slot}-7f3`) || blob.includes("source.example"))) bad.ground.push(`${name}: "${String(a.text).slice(0, 36)}"`); }
    all = fixOne(all, a) || all; }
  if (actions.length && simulated) { const after = pct(all); const shown = Number(path.allDonePct ?? path.toGo?.pct ?? now);
    if (after + 1e-9 < now) bad.goLower.push(`${name}: ${now.toFixed(0)} -> ${after.toFixed(0)}`); if (Math.abs(shown - after) > 1.6 && path.kind !== "go") bad.proj.push(`${name}: panel says ${shown} but really reaches ${after.toFixed(0)}`); if (shown + 1e-9 < now - 0.6) bad.proj.push(`${name}: panel shows ${shown}, below today's ${now.toFixed(0)}`); if (!(after > now + 1e-9) || !(shown > now - 0.6)) bad.greater.push(`${name}: ${now.toFixed(0)} -> ${after.toFixed(0)} (panel ${shown})`); }
  if (verdict === "GO" && actions.length) { const worst = Math.min(...actions.map((a) => { const o = fixOne(checks, a); return o ? pct(o) - now : 0; })); if (worst < -1e-9) bad.goLower.push(`${name}: a suggestion lowers a GO`); }
}
const show = (a) => a.length ? `${a.length}: ${a.slice(0, 3).join(" | ")}` : "";
check("PA", "every suggestion is worth something (a gain above 0)", bad.gain.length === 0, show(bad.gain));
check("PB", "the gain a suggestion promises equals the gain it really delivers when applied (within one percentage point)", bad.promise.length === 0, show(bad.promise));
check("PC", "the score the panel shows after 'these checks clear' equals the score really reached, and is never below today's", bad.proj.length === 0, show(bad.proj));
check("PD", "when there is something to improve, the score after improving is HIGHER than today's (never the same or lower)", bad.greater.length === 0, show(bad.greater));
check("PE", "nothing is suggested for a check that is already at full credit", bad.full.length === 0, show(bad.full));
check("PF", "a suggestion for a check the AI web-searched carries the web finding (its reason or its source), not just 'weak' or 'none'", bad.ground.length === 0, show(bad.ground));
check("PG", "the panel never says GO when the verdict is not GO (and says GO when it is)", bad.go.length === 0, show(bad.go));
check("PH", "named checks are listed, never the generic 'Screen again - N checks still open', while a named check is open", bad.generic.length === 0, bad.generic.slice(0, 3).join(" | "));
check("PI", "applying every suggestion never lowers a score, and a GO is never given a path that lowers it", bad.goLower.length === 0, show(bad.goLower));
console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS the scope-to-improve panel is valid"); process.exit(failed ? 1 : 0);

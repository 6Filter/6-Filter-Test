/**
 * Kills verdict-bearing mutants in lib/goNoGo.js: bands, F4 hard stop, GO cap,
 * INCOMPLETE, mark-downs, tone, rationale, preview. Does not edit locked scoring.
 */
import assert from "node:assert/strict";
import {
  applyLocalGate,
  buildGateRationale,
  classifyGoNoGoFromScore,
  computeGoNoGo,
  filterBlocksGo,
  filterCheckScore,
  filterIsUnscoredForAggregate,
  filtersIncomplete,
  financeSignatureCopy,
  goNoGoIsFloorFailure,
  goNoGoTone,
  hasGoCap,
  hasMarkedDown,
  hasProvisionalFloor,
  previewAdvisoryChecks,
  scoreAdvisoryChecks,
  summarizeChecksForPrompt,
} from "../lib/goNoGo.js";
import { GONOGO_SCORE_BANDS, SCORE_CHECK_SLOTS_TOTAL } from "../lib/lockedConstants.js";
import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";

const F1 = ["benchmark", "gap", "attributes", "derivation", "parity", "route", "argument"];
const F2 = ["margin", "packSize", "gst"];
const F3 = ["resilience"];
const F4 = [...TECH_SHIFT_DIMENSIONS];

function slotItems(slots, credit, extra = {}) {
  return slots.map((slot) => ({
    slot,
    status: credit > 0 ? "done" : "pending",
    credit,
    text: slot,
    ...extra,
  }));
}

function board(credit = 1, labels = {}, itemExtra = {}) {
  return {
    f1: { checkLabel: labels.f1 || "Cleared", items: slotItems(F1, credit, itemExtra) },
    f2: { checkLabel: labels.f2 || "Cleared", items: slotItems(F2, credit, itemExtra) },
    f3: { checkLabel: labels.f3 || "Cleared", items: slotItems(F3, credit, itemExtra) },
    f4: { checkLabel: labels.f4 || "Cleared", items: slotItems(F4, credit, itemExtra) },
  };
}

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
    return;
  }
  console.log(`PASS  ${name}${detail ? `  [${detail}]` : ""}`);
}

check("59% is NO-GO", classifyGoNoGoFromScore(59) === "NO-GO" && computeGoNoGo(board(0)) === "NO-GO");
check("60% is WATCH", classifyGoNoGoFromScore(60) === "WATCH");
check("80% is WATCH", classifyGoNoGoFromScore(80) === "WATCH");
check("81% is GO", classifyGoNoGoFromScore(81) === "GO");
{
  const go = board(1);
  check("100% cleared board is GO", computeGoNoGo(go) === "GO" && scoreAdvisoryChecks(go).pct === 100);
}
check("NaN percent is NO-GO", classifyGoNoGoFromScore(Number.NaN) === "NO-GO");
check("undefined percent is NO-GO", classifyGoNoGoFromScore(undefined) === "NO-GO");
check("negative percent is NO-GO", classifyGoNoGoFromScore(-1) === "NO-GO");
check("WATCH_MAX+epsilon is GO", classifyGoNoGoFromScore(GONOGO_SCORE_BANDS.WATCH_MAX + 0.01) === "GO");
check("just below NOGO_MAX is NO-GO", classifyGoNoGoFromScore(GONOGO_SCORE_BANDS.NOGO_MAX - 0.01) === "NO-GO");

check("filterBlocksGo null", filterBlocksGo(null) === true);
check("filterBlocksGo not object", filterBlocksGo("cleared") === true);
check("filterBlocksGo empty label", filterBlocksGo({ checkLabel: "", items: [{ text: "x" }] }) === true);
check("filterBlocksGo Not yet run", filterBlocksGo({ checkLabel: "Not yet run", items: [{ text: "x" }] }) === true);
check("filterBlocksGo empty items", filterBlocksGo({ checkLabel: "Cleared", items: [] }) === true);
check("filterBlocksGo missing items", filterBlocksGo({ checkLabel: "Cleared" }) === true);
check(
  "filterBlocksGo pending division",
  filterBlocksGo({ checkLabel: "Cleared", items: [{ text: "Pending: division not determined" }] }) === true
);
check(
  "filterBlocksGo research failed",
  filterBlocksGo({ checkLabel: "Cleared", items: [{ text: "Research failed — retry the step" }] }) === true
);
check(
  "filterBlocksGo cleared items",
  filterBlocksGo({ checkLabel: "Cleared", items: [{ text: "benchmark matched", status: "done" }] }) === false
);

{
  const unfinished = board(1, { f3: "Not yet run" });
  unfinished.f3.items = [];
  check("filtersIncomplete true when F3 empty", filtersIncomplete(unfinished) === true);
  check("INCOMPLETE when any of F1–F4 has no scored checklist", computeGoNoGo(unfinished) === "INCOMPLETE");
}
{
  const unfinishedF1 = board(1);
  unfinishedF1.f1 = { checkLabel: "Not yet run", items: [] };
  check("INCOMPLETE when F1 not run", computeGoNoGo(unfinishedF1) === "INCOMPLETE");
}
{
  const cleared = board(1);
  check("filtersIncomplete false when all scored", filtersIncomplete(cleared) === false);
}

check("hasProvisionalFloor always false", hasProvisionalFloor({}) === false && hasProvisionalFloor(board(1)) === false);

check("hasMarkedDown by label", hasMarkedDown(board(1, { f2: "Marked down" })) === true);
{
  const m = board(1);
  m.f3.markedDown = true;
  check("hasMarkedDown by flag", hasMarkedDown(m) === true);
}
check("hasMarkedDown false when cleared", hasMarkedDown(board(1)) === false);

check("hasGoCap via mark-down", hasGoCap(board(1, { f1: "Marked down" })) === true);
{
  const c = board(1);
  c.f2.capsGo = true;
  check("hasGoCap via capsGo", hasGoCap(c) === true);
}
{
  const w = board(1);
  w.f3.weakPass = true;
  check("hasGoCap via weakPass", hasGoCap(w) === true);
}
{
  const weak = board(1);
  weak.f1.items[0] = { slot: "benchmark", status: "done", credit: 0, level: "weak", text: "benchmark" };
  check("hasGoCap via weak done item with zero credit", hasGoCap(weak) === true);
}
{
  const weakCredit = board(1);
  weakCredit.f1.items[0] = { slot: "benchmark", status: "pending", credit: 0.4, level: "weak", text: "benchmark" };
  check("hasGoCap via weak fractional credit", hasGoCap(weakCredit) === true);
}
{
  const weakZero = board(1);
  weakZero.f1.items[0] = { slot: "benchmark", status: "pending", credit: 0, level: "weak", text: "benchmark" };
  check("weak pending zero credit does not cap", hasGoCap(weakZero) === false);
}
{
  const strong = board(1);
  strong.f1.items[0] = { slot: "benchmark", status: "done", credit: 1, level: "strong", text: "benchmark" };
  check("strong done item does not cap", hasGoCap(strong) === false);
}
{
  const noneNoReasons = board(1);
  noneNoReasons.f1.items[0] = { slot: "benchmark", status: "pending", credit: 0, level: "none", text: "benchmark" };
  check("none without mark-down reasons does not cap", hasGoCap(noneNoReasons) === false);
}
{
  const noneCredit = board(1);
  noneCredit.f1.items[0] = {
    slot: "benchmark",
    status: "pending",
    credit: 0.2,
    level: "none",
    reasons: ["MARKED_DOWN"],
    text: "benchmark",
  };
  check("none with leftover credit does not cap via mark-down reasons", hasGoCap(noneCredit) === false);
}
{
  const admin = board(1);
  admin.f1.items[0] = { slot: "benchmark", status: "done", credit: 1, level: "weak", formAdmin: true, text: "benchmark" };
  check("formAdmin weak item does not cap", hasGoCap(admin) === false);
}
{
  const none = board(1);
  none.f1.items[0] = {
    slot: "benchmark",
    status: "pending",
    credit: 0,
    level: "none",
    reasons: ["MARKED_DOWN"],
    text: "benchmark",
  };
  check("hasGoCap via MARKED_DOWN reason", hasGoCap(none) === true);
}
for (const reason of ["BELOW_FLOOR", "BELOW_MINIMUM", "CONTRADICTED", "NOT_RELEVANT", "ROUTE_MISMATCH"]) {
  const n = board(1);
  n.f4.items[0] = { slot: F4[0], status: "pending", credit: 0, level: "none", reasons: [reason], text: F4[0] };
  check(`hasGoCap via ${reason}`, hasGoCap(n) === true);
}
{
  const other = board(1);
  other.f1.items[0] = { slot: "benchmark", status: "pending", credit: 0, level: "none", reasons: ["OTHER"], text: "benchmark" };
  check("unlisted none-reason does not cap", hasGoCap(other) === false);
}

{
  const hard = board(1, { f4: "Below floor" });
  check("F4 Below floor is NO-GO at 100%", computeGoNoGo(hard) === "NO-GO" && goNoGoIsFloorFailure(hard) === true);
}
{
  const f2floor = board(1, { f2: "Below floor" });
  check("F2 Below floor is not a hard stop", goNoGoIsFloorFailure(f2floor) === false && computeGoNoGo(f2floor) === "GO");
}
{
  const cap = board(1, { f2: "Marked down" });
  check("mark-down caps GO at WATCH", computeGoNoGo(cap) === "WATCH");
}
{
  const weak = board(1);
  weak.f1.weakPass = true;
  check("weak evidence caps GO at WATCH", computeGoNoGo(weak) === "WATCH");
}
{
  const adequate = board(1);
  check("adequate evidence does not cap GO", hasGoCap(adequate) === false && computeGoNoGo(adequate) === "GO");
}
{
  const watchBand = board(0);
  watchBand.f1.items = slotItems(F1, 1);
  watchBand.f2.items = slotItems(F2, 1);
  // 7+3 = 10 of 18 → 56% NO-GO; lift F3 too → 11/18 = 61% WATCH
  watchBand.f3.items = slotItems(F3, 1);
  const pct = scoreAdvisoryChecks(watchBand).pct;
  check("mid band stays WATCH even with mark-down", pct >= 60 && pct <= 80 && computeGoNoGo({ ...watchBand, f1: { ...watchBand.f1, checkLabel: "Marked down" } }) === "WATCH", `${pct}%`);
}

check("goNoGoTone GO", goNoGoTone("GO") === "pass");
check("goNoGoTone WATCH", goNoGoTone("WATCH") === "watch");
check("goNoGoTone INCOMPLETE", goNoGoTone("INCOMPLETE") === "incomplete");
check("goNoGoTone NO-GO", goNoGoTone("NO-GO") === "fail");
check("goNoGoTone unknown", goNoGoTone("OTHER") === "fail");

check("financeSignatureCopy signed", /Finance has confirmed/.test(financeSignatureCopy(true)));
check("financeSignatureCopy unsigned", /hasn't been confirmed/.test(financeSignatureCopy(false)));

{
  const s = filterCheckScore({ items: [{ status: "done", text: "a" }, { status: "pending", text: "b" }] });
  check("filterCheckScore halves", s.done === 1 && s.total === 2 && s.pct === 50, JSON.stringify(s));
}
check("filterCheckScore empty", filterCheckScore({ items: [] }).pct === 0 && filterCheckScore({}).total === 0);

check("filterIsUnscoredForAggregate Not yet run", filterIsUnscoredForAggregate({ checkLabel: "Not yet run", items: [] }) === true);
check("filterIsUnscoredForAggregate empty Evidence missing", filterIsUnscoredForAggregate({ checkLabel: "Evidence missing", items: [] }) === true);
check("filterIsUnscoredForAggregate Cleared empty", filterIsUnscoredForAggregate({ checkLabel: "Cleared", items: [] }) === false);
check("filterIsUnscoredForAggregate Exempt empty", filterIsUnscoredForAggregate({ checkLabel: "Exempt", items: [] }) === false);
check("filterIsUnscoredForAggregate scored items", filterIsUnscoredForAggregate({ checkLabel: "Cleared", items: [{ status: "done", text: "x" }] }) === false);

{
  const scored = scoreAdvisoryChecks(board(1));
  check("scoreAdvisoryChecks 18/18", scored.total === SCORE_CHECK_SLOTS_TOTAL && scored.pct === 100 && scored.done === 18);
}
{
  const zero = scoreAdvisoryChecks(board(0));
  check("scoreAdvisoryChecks all pending is 0%", zero.pct === 0);
}
check("scoreAdvisoryChecks default empty", scoreAdvisoryChecks().pct === 0);

{
  const go = board(1);
  const r = buildGateRationale({ classification: "GO", score: { pct: 100 }, checks: go, ideaName: "Serum Alpha", category: "Serum" });
  check("rationale GO names idea and percent", /Serum Alpha reads GO at 100%/.test(r));
}
{
  const r = buildGateRationale({ classification: "INCOMPLETE", score: { pct: 40, done: 7, total: 18 } });
  check("rationale INCOMPLETE screen again", /Research did not finish \(7 of 18 relevance points \(40%\)\)/.test(r) && /Screen again/.test(r));
}
{
  const r = buildGateRationale({ classification: "INCOMPLETE", score: {} });
  check("rationale INCOMPLETE without points", /checks of/.test(r) && /Screen again/.test(r));
}
{
  const checks = board(1, { f4: "Below floor" });
  checks.f4.items = [{ status: "pending", text: "Overall High tech-shift risk" }];
  const r = buildGateRationale({ classification: "NO-GO", score: { pct: 88 }, checks, ideaName: "X" });
  check("rationale floor lead", /X is NO-GO at 88% because Overall High/.test(r));
}
{
  const checks = board(1);
  checks.f1.items.push({ status: "pending", text: "Growth argument is thin" });
  const r = buildGateRationale({ classification: "WATCH", score: { pct: 72 }, checks, ideaName: "Y" });
  check("rationale WATCH outstanding", /Y is WATCH at 72%/.test(r) && /Growth argument is thin/.test(r));
}
{
  const r = buildGateRationale({ classification: "WATCH", score: { pct: 70 }, checks: board(1), ideaName: "Z" });
  check("rationale WATCH band", /Z is WATCH at 70%/.test(r) && /60–80 band/.test(r));
}
{
  const r = buildGateRationale({ classification: "WATCH", score: { pct: 40 }, checks: board(0), ideaName: "Low" });
  check("rationale WATCH fallback", /Low is WATCH at 40%\./.test(r));
}
{
  const checks = {
    f1: { checkLabel: "Cleared", items: [] },
    f2: { checkLabel: "Cleared", items: [{ status: "pending", text: "Net margin below the story" }] },
    f3: { checkLabel: "Cleared", items: [] },
    f4: { checkLabel: "Cleared", items: [] },
  };
  const r = buildGateRationale({ classification: "NO-GO", score: { pct: 20 }, checks, ideaName: "N" });
  check("rationale NO-GO with gap", /N is NO-GO at 20%/.test(r) && /Net margin below the story/.test(r), r);
}
{
  const r = buildGateRationale({ classification: "NO-GO", score: { pct: 10 }, checks: board(1), ideaName: "N" });
  check("rationale NO-GO until complete", /until Filter 1–4 evidence on the form is complete/.test(r));
}
{
  const r = buildGateRationale({ classification: "GO", score: {}, category: "Serum" });
  check("rationale subject from category", /This Serum idea reads GO/.test(r));
}
{
  const r = buildGateRationale({ classification: "GO", score: {} });
  check("rationale default subject", /This idea reads GO/.test(r));
}

{
  const prompt = summarizeChecksForPrompt(board(1, { f4: "Below floor" }));
  check("summarizeChecksForPrompt names filters", /F1: /.test(prompt) && /F4: Below floor/.test(prompt));
}
check("summarizeChecksForPrompt empty", /F1: /.test(summarizeChecksForPrompt({})));

{
  const preview = previewAdvisoryChecks({
    name: "Serum Kill",
    category: "Serum",
    ideaDescription: "a leave-on serum that visibly reduces hair fall in eight weeks",
    division: "Personal Care",
    f1: {
      declaredAttribute: "Visible hair fall reduction in 8 weeks",
      declaredAttribute2: "Light non-greasy feel",
      benchmark: "Dove Scalp Serum 100 ml",
      declaredGap: 3,
      gapDerivation: "2% caffeine versus none",
      parityExceptions: "No fragrance",
      growthRoute: "frequency",
      growthArgument: "Scalp care is growing faster than hair oil in metros",
    },
    f2: { cogsAtScale: 100, gstRatePct: 18, netMarginAtScale: 60, grammage: "100 ml", mrpInr: 295 },
    f3: {},
    f4: { techShiftRisk: { overallRisk: "Low", dimensions: {} } },
    f5: {},
    f6: {},
  });
  check("previewAdvisoryChecks returns F1–F6", Boolean(preview.f1 && preview.f2 && preview.f3 && preview.f4 && preview.f5 && preview.f6));
  const gate = applyLocalGate({
    name: "Serum Kill",
    category: "Serum",
    division: "Personal Care",
    f1: { declaredAttribute: "Visible hair fall reduction", benchmark: "Dove", declaredGap: 3, gapDerivation: "peptide", growthRoute: "frequency", growthArgument: "metros growing" },
    f2: { cogsAtScale: 100, gstRatePct: 18, netMarginAtScale: 60, grammage: "100 ml" },
  });
  check("applyLocalGate has classification and rationale", typeof gate.classification === "string" && typeof gate.rationale === "string" && gate.ideaName);
  const incompleteGate = applyLocalGate({ name: "Blank", category: "Serum" });
  check(
    "applyLocalGate INCOMPLETE omits ideaScale",
    incompleteGate.classification === "INCOMPLETE"
      ? !("ideaScale" in incompleteGate)
      : true,
    incompleteGate.classification
  );
  const f1Texts = (preview.f1.items || []).map((it) => String(it.text || ""));
  check(
    "preview F1 does not invent a percent",
    f1Texts.every((t) => !/\b\d{2,3}%/.test(t)) || f1Texts.some((t) => /assessed when you Submit/i.test(t))
  );
}

{
  const a = board(0.5);
  const b = board(1);
  check("more credit never lowers the score", scoreAdvisoryChecks(b).pct >= scoreAdvisoryChecks(a).pct);
}
{
  const advisory = board(1);
  const keys = ["f4", "f1", "f3", "f2"];
  const shuffled = { f4: advisory.f4, f1: advisory.f1, f3: advisory.f3, f2: advisory.f2 };
  check("key order does not change score or verdict", scoreAdvisoryChecks(shuffled).pct === scoreAdvisoryChecks(advisory).pct && computeGoNoGo(shuffled) === computeGoNoGo(advisory));
}

if (failed) {
  console.error(`\n${failed} CHECK(S) FAILED testGoNoGoMutationKill`);
  process.exit(1);
}
console.log("PASS testGoNoGoMutationKill");

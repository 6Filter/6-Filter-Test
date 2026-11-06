import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkF1, checkF3, checkF4 } from "../lib/filterChecks.js";
import { supportedF4Findings } from "./f4TestHelpers.mjs";
import {
  applyLocalGate,
  classifyGoNoGoFromScore,
  computeGoNoGo,
  goNoGoIsFloorFailure,
  previewAdvisoryChecks,
  scoreAdvisoryChecks,
} from "../lib/goNoGo.js";

function items(done, pending, extra = {}) {
  return [
    ...Array.from({ length: done }, () => ({ status: "done", text: extra.doneText || "ok" })),
    ...Array.from({ length: pending }, () => ({ status: "pending", text: extra.pendingText || "gap" })),
  ];
}

assert.equal(classifyGoNoGoFromScore(59), "NO-GO");
assert.equal(classifyGoNoGoFromScore(60), "WATCH");
assert.equal(classifyGoNoGoFromScore(80), "WATCH");
assert.equal(classifyGoNoGoFromScore(81), "GO");
assert.equal(classifyGoNoGoFromScore(95), "GO");

// Part 134 revised — F2 margin below minimum is a mark-down (WATCH cap), not a floor NO-GO.
const highPctF2MarkDown = {
  f1: { checkLabel: "Cleared", items: items(7, 0) },
  f2: {
    checkLabel: "Marked down",
    markedDown: true,
    items: [
      {
        status: "pending",
        text: "Net margin 5% is below the 50% minimum for Personal Care",
        code: "F2_MARGIN_BELOW_MINIMUM",
        credit: 0,
      },
      { status: "done", text: "Pack size 50 g entered with a unit", slot: "packSize", credit: 1 },
      { status: "done", text: "GST rate 18% entered", slot: "gst", credit: 1 },
    ],
  },
  f3: { checkLabel: "Cleared", items: items(1, 0) },
  f4: { checkLabel: "Cleared", items: items(7, 0) },
};
assert.equal(scoreAdvisoryChecks(highPctF2MarkDown).pct >= 80, true);
assert.equal(goNoGoIsFloorFailure(highPctF2MarkDown), false);
assert.equal(computeGoNoGo(highPctF2MarkDown), "WATCH");

function slotChecks(f1Done, f2Done, f3Done, f4Done) {
  return {
    f1: { checkLabel: "Cleared", items: items(f1Done, Math.max(0, 7 - f1Done)) },
    f2: { checkLabel: "Cleared", items: items(f2Done, Math.max(0, 3 - f2Done)) },
    f3: {
      checkLabel: f3Done ? "Cleared" : "Evidence missing",
      items: items(f3Done, Math.max(0, 1 - f3Done)),
    },
    f4: { checkLabel: "Cleared", items: items(f4Done, Math.max(0, 7 - f4Done)) },
  };
}
// Part 138 — 18 slots (7+3+1+7)
assert.equal(computeGoNoGo(slotChecks(7, 3, 1, 1)), "WATCH"); // 12/18 ≈ 67%
assert.equal(computeGoNoGo(slotChecks(7, 3, 1, 3)), "WATCH"); // 14/18 ≈ 78%
assert.equal(computeGoNoGo(slotChecks(7, 3, 1, 5)), "GO"); // 16/18 ≈ 89%

const namedOnly = checkF1(
  {
    declaredAttribute: "cooling feel that lasts",
    benchmark: "Indulekha Bringha",
    declaredGap: 5,
    gapDerivation: "beat on cooling",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "share take from current oil users",
  },
  {}
);
assert.equal(
  namedOnly.items.find((i) => i.slot === "benchmark").status,
  "pending",
  "named benchmark needs web check before it counts"
);
assert.match(namedOnly.items.find((i) => i.slot === "benchmark").text, /awaiting web check|awaiting relevance|assessed when you Submit/i);
assert.equal(
  namedOnly.items.find((i) => i.slot === "route").status,
  "pending",
  "growth route needs AI check before it counts"
);
assert.match(namedOnly.items.find((i) => i.slot === "route").text, /awaiting AI check|awaiting|assessed when you Submit/i);

const verified = checkF1(
  {
    declaredAttribute: "cooling feel that lasts",
    benchmark: "Indulekha",
    declaredGap: 2.2,
    gapDerivation: "beat on cooling",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "share take from current oil users",
    evidenceSourceDate: "https://example.com/study",
  },
  {
    assessments: {
      benchmark: {
        raw: { relevance: "strong", source_url: "https://example.com/indulekha" },
        returnedSources: ["https://example.com/indulekha"],
      },
      attributes: { raw: { relevance: "strong", specific: true }, returnedSources: [] },
      route: { raw: { matches: "yes", confidence: "high", expected: "penetration" }, returnedSources: [] },
      derivation: {
        raw: {
          relevance: "strong",
          specific: true,
          supported: true,
          source_url: "https://example.com/indulekha",
          quote: "cooling",
        },
        returnedSources: ["https://example.com/indulekha"],
      },
      argument: {
        raw: {
          relevance: "strong",
          specific: true,
          supported: true,
          source_url: "https://example.com/indulekha",
          quote: "share",
        },
        returnedSources: ["https://example.com/indulekha"],
      },
    },
    benchmarkCheck: { status: "relevant", source_url: "https://example.com/indulekha" },
    routeCheck: { expected: "penetration", confidence: "high" },
  },
  {
    evidenceRead: {
      status: "ok",
      relevant: true,
      facts: [{ topic: "attribute", verified: true, quote: "cooling" }],
    },
  }
);
assert.equal(verified.items.find((i) => i.slot === "benchmark").status, "done");
assert.equal(verified.items.find((i) => i.slot === "route").status, "done");

const unverified = checkF1(
  { declaredAttribute: "cooling", benchmark: "Zzxq-not-a-real-brand-999", declaredGap: 2.2 },
  { benchmarkCheck: { status: "not-found", reason: "no listing" } }
);
assert.equal(unverified.items.find((i) => i.slot === "benchmark").status, "pending");

const routeMismatch = checkF1(
  {
    declaredAttribute: "cooling",
    benchmark: "Indulekha",
    declaredGap: 2.2,
    gapDerivation: "beat on cooling",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "share take",
  },
  {
    benchmarkCheck: { status: "relevant", source_url: "https://example.com/indulekha" },
    routeCheck: { expected: "new-market", confidence: "high", reason: "audience is new" },
  }
);
assert.equal(routeMismatch.items.find((i) => i.slot === "route").status, "pending");
assert.match(routeMismatch.items.find((i) => i.slot === "route").text, /mismatch|expects/i);
const range = { minMrpInr: 80, maxMrpInr: 120, minMarginPct: 12, maxMarginPct: 28 };
// Part 135 — Filter 3 is cliff research; without priceEvents preview/research it is Not yet run or Marked down.
assert.equal(checkF3({}, {}).checkLabel, "Not yet run");
assert.equal(
  checkF3(
    { cogsAtScale: 70, netMarginAtScale: 55, gstRatePct: 18 },
    {},
    { priceEvents: { annualIncreasePct: 0, events: [] } }
  ).checkLabel,
  "Cleared"
);
assert.notEqual(
  checkF3(
    { cogsAtScale: 40, netMarginAtScale: 20, gstRatePct: 18 },
    { marginElasticity: range },
    { priceEvents: { annualIncreasePct: 0, events: [] } }
  ).checkLabel,
  "Below floor"
);

const f4Placeholder = checkF4({
  techShiftRisk: {
    dimensions: {
      functionalCoreStability: { risk: "5", reason: "" },
    },
  },
});
assert.equal(f4Placeholder.items[0].status, "pending");
assert.match(f4Placeholder.items[0].text, /no research rating recorded/);
assert.equal(f4Placeholder.checkLabel, "Evidence missing");

const f4LowDims = {
      functionalCoreStability: { risk: "Low", reason: "Function survives a form change" },
      consumptionContextStability: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      manufacturingDisruptionRisk: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      userHabitShiftPotential: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      adjacentSubstitutionThreat: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      purchaseFrequencyShift: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
      regulatoryDisruptionRisk: { risk: "Low", reason: "Low risk — no destabilizing signal found" },
};
const f4Low = checkF4({ techShiftRisk: { dimensions: f4LowDims, overallRisk: "Low" } }, supportedF4Findings(f4LowDims));
assert.equal(f4Low.checkLabel, "Cleared");
assert.ok(f4Low.items.every((it) => it.status === "done"));

const typedFive = {
  name: "5",
  category: "5",
  ideaDescription: "5",
  division: "Personal Care",
  f1: {
    declaredAttribute: "5",
    declaredAttribute2: "5",
    declaredAttribute3: "5",
    benchmark: "5",
    declaredGap: 5,
    growthRoute: "penetration",
    growthArgument: "5",
  },
  f2: {
    cogsAtScale: 5,
    netMarginAtScale: 5,
    gstRatePct: 5,
    mrpInr: 5,
    grammage: "5",
    qcomTrajectory: "5",
  },
  f3: {
    marginElasticity: {
      minMarginPct: 5,
      maxMarginPct: 5,
      minMrpInr: 5,
      maxMrpInr: 5,
    },
  },
  f4: {},
};
const preview = previewAdvisoryChecks(typedFive);
const previewScore = scoreAdvisoryChecks(preview);
assert.ok(previewScore.pct < 81, `typing 5 everywhere must not preview as a GO-band score, got ${previewScore.pct}`);
assert.notEqual(computeGoNoGo(preview), "GO");
const afterSubmit = {
  ...preview,
  f2: {
    checkLabel: "Marked down",
    markedDown: true,
    items: [
      {
        status: "pending",
        text: "Net margin 5% is below the 50% minimum for Personal Care",
        code: "F2_MARGIN_BELOW_MINIMUM",
        credit: 0,
      },
    ],
  },
};
// Part 134 revised — F2 mark-down is never a hard-stop NO-GO (WATCH cap when the band would be GO).
assert.notEqual(computeGoNoGo(afterSubmit), "NO-GO");
assert.equal(goNoGoIsFloorFailure(afterSubmit), false);

const local = applyLocalGate({
  ...typedFive,
  f3: {
    marginElasticity: {
      minMrpInr: 80,
      maxMrpInr: 90,
      minMarginPct: 20,
      maxMarginPct: 30,
    },
  },
});
// Part 135 — browser preview never invents a Filter 3 cliff verdict / Below floor.
assert.notEqual(local.checks.f3.checkLabel, "Below floor");
assert.notEqual(local.classification, "GO");

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const heroStart = formSrc.indexOf("<section className={`gonogo-hero");
const heroEnd = formSrc.indexOf("</section>", heroStart);
const hero = formSrc.slice(heroStart, heroEnd);
assert.match(hero, /gonogo-classification/);
assert.match(hero, /gonogo-score/);
assert.match(hero, /\{score\.pct\}%/);
assert.doesNotMatch(hero, /byFilter/);
assert.doesNotMatch(hero, /filterScore\.pct/);
assert.doesNotMatch(hero, /f1\.pct|f2\.pct|f3\.pct|f4\.pct/);
assert.match(formSrc, /className="filter-grid"/);
assert.ok(formSrc.indexOf("className=\"filter-grid\"") > heroEnd);

const goSrc = readFileSync(new URL("../lib/goNoGo.js", import.meta.url), "utf8");
assert.match(goSrc, /if \(goNoGoIsFloorFailure\(advisoryChecks\)\) return "NO-GO"/);
assert.match(goSrc, /from "\.\/lockedConstants\.js"/);
assert.match(goSrc, /classifyGoNoGoFromBands/);
assert.doesNotMatch(goSrc, /if \(score > 80\) return "GO"/);
assert.doesNotMatch(goSrc, /if \(score >= 60\) return "WATCH"/);

console.log("PASS Part 60 floor gate before percentage, one hero score");

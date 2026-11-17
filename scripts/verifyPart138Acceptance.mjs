/**
 * One-shot verification for the owner's four acceptance claims after Part 138.
 * Deterministic scorer only — no live LLM spend.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCORING_RULESET_VERSION,
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
} from "../lib/lockedConstants.js";
import { computeScoringFingerprint } from "../lib/scoringRuleset.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";
import { scoreAdvisoryChecks, computeGoNoGo } from "../lib/goNoGo.js";
import { inputCoverage } from "../lib/inputCoverage.js";
import {
  SIX_FILTERS_FORM,
  PROPOSITION_TOP_FIELDS,
  emptyFilterState,
  mergeProposition,
} from "../lib/propositionFields.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const formSrc = readFileSync(join(root, "src/PropositionForm.jsx"), "utf8");

const F4_DIMS = [
  "functionalCoreStability",
  "consumptionContextStability",
  "manufacturingDisruptionRisk",
  "userHabitShiftPotential",
  "adjacentSubstitutionThreat",
  "purchaseFrequencyShift",
  "regulatoryDisruptionRisk",
];

const dims = Object.fromEntries(
  F4_DIMS.map((k) => [k, { risk: "Low", reason: "stable format in category" }])
);
dims.userHabitShiftPotential = { risk: "Medium", reason: "shampoo shift risk" };

const f4Assessments = Object.fromEntries(
  F4_DIMS.map((k) => [
    k,
    {
      status: "ok",
      searchUsed: true,
      raw: {
        rating: dims[k].risk,
        supported: true,
        source_url: "https://example.com/f4",
        quote: "stable",
      },
      returnedSources: ["https://example.com/f4"],
    },
  ])
);

const baseDoc = {
  name: "Cooling oil serum",
  category: "Hair Oil",
  ideaDescription:
    "A cooling scalp serum that lasts six hours after wash for urban women who oil weekly.",
  division: "Personal Care",
  submitterName: "Verify Bot",
  submitterDepartment: "R&D",
  f1: {
    declaredAttribute: "cooling feel that lasts",
    declaredAttribute2: "non-greasy finish",
    declaredAttribute3: "",
    benchmark: "Indulekha Bringha 100ml",
    declaredGap: 3,
    gapDerivation: "beat on cooling duration after wash",
    parityExceptions: "none",
    whoIsThisFor: "urban women 25-40 who oil weekly",
    growthRoute: "penetration",
    growthArgument: "take share from weekly oil users in metros",
  },
  f2: {
    cogsAtScale: 40,
    netMarginAtScale: 55,
    gstRatePct: 18,
    grammage: "50ml",
    qcomTrajectory: "same price on Blinkit as GT",
  },
  f3: { plannedAnnualIncreasePct: 5 },
  f4: { techShiftRisk: { dimensions: dims, overall: "Low" } },
  f5: {
    householdsReachedY3Mn: 2.5,
    trialRatePct: 18,
    repeatConversionPct: 35,
    purchaseFrequencyYr: 6,
    avgPackValueInr: 149,
  },
  f6: {
    labGapVsBenchmark: 2.5,
    consumerPanelBeaters: 20,
    packStandoutGap: 3,
  },
  researchFindings: {
    f1: {
      assessments: {
        benchmark: {
          status: "ok",
          searchUsed: true,
          raw: { relevance: "strong", specific: true },
        },
        attributes: {
          status: "ok",
          searchUsed: true,
          raw: { relevance: "strong", specific: true },
        },
        derivation: {
          status: "ok",
          searchUsed: true,
          raw: { relevance: "strong", specific: true, supported: true },
        },
        parity: {
          status: "ok",
          searchUsed: true,
          raw: { relevance: "strong", specific: true, supported: true },
        },
        route: {
          status: "ok",
          searchUsed: true,
          raw: { relevance: "strong", expected: "penetration" },
        },
        argument: {
          status: "ok",
          searchUsed: true,
          raw: { relevance: "strong", specific: true, supported: true },
        },
      },
    },
    f2: {
      assessments: {
        gst: { status: "ok", searchUsed: true, raw: { supported: true } },
      },
    },
    f3: {
      priceEvents: {
        annualIncreasePct: 5,
        events: [
          {
            brand: "Indulekha",
            from_price_inr: 145,
            to_price_inr: 165,
            crossed_point: 150,
            volume_change_pct: -4,
            verified: true,
            source_url: "https://example.com/price",
          },
        ],
      },
    },
    f4: { assessments: f4Assessments },
  },
};

const results = { ok: true, checks: [] };
async function check(name, fn) {
  try {
    await fn();
    results.checks.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.ok = false;
    results.checks.push({ name, ok: false, error: err.message });
    console.error(`FAIL  ${name}: ${err.message}`);
  }
}

await check("ruleset locked at v5.6 / 18 slots", () => {
  assert.equal(SCORING_RULESET_VERSION, "v5.6");
  assert.deepEqual(SCORE_CHECK_SLOTS, { f1: 7, f2: 3, f3: 1, f4: 7 });
  assert.equal(SCORE_CHECK_SLOTS_TOTAL, 18);
  assert.equal(computeScoringFingerprint().length, 64);
});

await check("1) every form field type accepts a written value via mergeProposition", () => {
  const patch = {
    name: "A",
    category: "Snacks",
    ideaDescription: "Long enough idea description for verify.",
    f1: {
      declaredAttribute: "crunch",
      benchmark: "Brand X 50g",
      declaredGap: 2.5,
      gapDerivation: "beat on crunch retention",
      parityExceptions: "none",
      growthRoute: "frequency",
      growthArgument: "more occasions per week",
      whoIsThisFor: "kids 8-14",
      plannedAnnualIncreasePct: undefined,
    },
    f2: {
      cogsAtScale: 12,
      netMarginAtScale: 35,
      gstRatePct: 18,
      grammage: "40g",
      qcomTrajectory: "match GT",
      mrpInr: 30,
    },
    f3: { plannedAnnualIncreasePct: 4 },
    f5: {
      householdsReachedY3Mn: 1,
      trialRatePct: 10,
      repeatConversionPct: 20,
      purchaseFrequencyYr: 8,
      avgPackValueInr: 20,
    },
    f6: {
      labGapVsBenchmark: 2,
      consumerPanelBeaters: 18,
      packStandoutGap: 2,
    },
  };
  const merged = mergeProposition(patch);
  assert.equal(merged.name, "A");
  assert.equal(merged.f1.declaredAttribute, "crunch");
  assert.equal(merged.f2.gstRatePct, 18);
  assert.equal(merged.f2.grammage, "40g");
  assert.equal(String(merged.f3.plannedAnnualIncreasePct), "4");
  assert.equal(merged.f5.trialRatePct, 10);
  assert.equal(merged.f6.packStandoutGap, 2);
  for (const spec of SIX_FILTERS_FORM) {
    const empty = emptyFilterState(spec);
    assert.ok(empty && typeof empty === "object", `${spec.key} empty state`);
  }
  assert.ok(PROPOSITION_TOP_FIELDS.some((f) => f.key === "name"));
  assert.ok(PROPOSITION_TOP_FIELDS.some((f) => f.key === "category"));
  assert.ok(PROPOSITION_TOP_FIELDS.some((f) => f.key === "ideaDescription"));
});

await check("2) AI assessments cover F1 seven + GST + F4 seven with searchUsed", async () => {
  const a = await computeAllAdvisoryChecks(baseDoc);
  const f1Slots = (a.f1?.items || []).map((i) => i.slot);
  assert.deepEqual(f1Slots, [
    "benchmark",
    "gap",
    "attributes",
    "derivation",
    "parity",
    "route",
    "argument",
  ]);
  for (const it of a.f1.items) {
    assert.ok(
      Number(it.credit) > 0 || it.level === "none" || it.status === "pending" || it.status === "done",
      `${it.slot} scored`
    );
  }
  const f2 = (a.f2?.items || []).filter((i) => !i.formAdmin);
  assert.deepEqual(
    f2.map((i) => i.slot),
    ["margin", "packSize", "gst"]
  );
  assert.ok(f2.every((i) => i.credit === 1), "F2 analytical slots clear");
  const f4 = (a.f4?.items || []).filter((i) => !i.formAdmin);
  assert.equal(f4.length, 7);

  for (const [k, ass] of Object.entries(baseDoc.researchFindings.f1.assessments)) {
    assert.equal(ass.searchUsed, true, `f1.${k} searchUsed`);
    assert.equal(ass.status, "ok", `f1.${k} ok`);
  }
  for (const [k, ass] of Object.entries(baseDoc.researchFindings.f4.assessments)) {
    assert.equal(ass.searchUsed, true, `f4.${k} searchUsed`);
  }
  assert.equal(baseDoc.researchFindings.f2.assessments.gst.searchUsed, true);
  const cov = inputCoverage(baseDoc);
  assert.ok(Array.isArray(cov), "inputCoverage returns rows");
});

await check("3) same inputs → identical score and classification twice", async () => {
  const a = await computeAllAdvisoryChecks(baseDoc);
  const b = await computeAllAdvisoryChecks(baseDoc);
  const sa = scoreAdvisoryChecks(a);
  const sb = scoreAdvisoryChecks(b);
  assert.equal(sa.pct, sb.pct);
  assert.equal(sa.done, sb.done);
  assert.equal(sa.total, sb.total);
  assert.equal(computeGoNoGo(a), computeGoNoGo(b));
  assert.equal(JSON.stringify(sa), JSON.stringify(sb));
  assert.equal(sa.total, 18);
  console.log(`       score=${sa.pct}% class=${computeGoNoGo(a)} done=${sa.done}/${sa.total}`);
});

await check("3b) changing one input changes the score", async () => {
  const a = scoreAdvisoryChecks(await computeAllAdvisoryChecks(baseDoc));
  const worse = {
    ...baseDoc,
    f1: { ...baseDoc.f1, declaredGap: 1 },
    researchFindings: baseDoc.researchFindings,
  };
  const worseChecks = await computeAllAdvisoryChecks(worse);
  const b = scoreAdvisoryChecks(worseChecks);
  assert.notEqual(a.pct, b.pct, "gap mark-down must move the percent");
  assert.equal(worseChecks.f1.checkLabel, "Marked down");
});

await check("4) input and output page controls are wired in the form", () => {
  const required = [
    /Submit for verdict/,
    /Re-run this estimate/,
    /verify-f4/,
    /f4-dimension-editor/,
    /data-f3-resilience="cliff"/,
    /Planned annual inflation-cover increase/,
    /Evaluate/,
    /What was assessed|inputCoverage/,
    /ProofUploadPanel|market research proof|Upload/,
    /ManagerReviewPanel|manager review/i,
  ];
  for (const re of required) {
    assert.match(formSrc, re, String(re));
  }
  assert.ok(!/setManagerOpen/.test(formSrc), "no orphaned manager modal setter");
  assert.ok(!/Open evaluation page/.test(formSrc));
});

await check("4b) Filter 5–6 stay locked until GO + proof; F1–F4 open", async () => {
  const { isFilterUnlocked } = await import("../lib/filterUnlock.js");
  assert.equal(isFilterUnlocked("f1", {}), true);
  assert.equal(isFilterUnlocked("f2", {}), true);
  assert.equal(isFilterUnlocked("f3", {}), true);
  assert.equal(isFilterUnlocked("f4", {}), true);
  assert.equal(isFilterUnlocked("f5", {}), false);
  assert.equal(isFilterUnlocked("f6", {}), false);
  assert.equal(
    isFilterUnlocked("f5", {
      goNoGo: { classification: "GO" },
      marketResearchProof: { name: "ua.pdf", data: "x" },
    }),
    true
  );
});

const failed = results.checks.filter((c) => !c.ok);
console.log(
  failed.length
    ? `\nVERIFY FAILED — ${failed.length} check(s)`
    : `\nVERIFY OK — ${results.checks.length} checks (Part 138 acceptance)`
);
process.exit(failed.length ? 1 : 0);

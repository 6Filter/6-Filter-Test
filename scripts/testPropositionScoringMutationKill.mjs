/**
 * Kills mutants in lib/propositionScoring.js: F5 revenue arithmetic and
 * computeAllAdvisoryChecks orchestration. Does not edit locked scoring.
 */
import {
  computeAllAdvisoryChecks,
  computeF5Revenue,
  computeGoNoGo,
  goNoGoIsFloorFailure,
  goNoGoTone,
  logScoringFresh,
  scoreAdvisoryChecks,
} from "../lib/propositionScoring.js";

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
    return;
  }
  console.log(`PASS  ${name}${detail ? `  [${detail}]` : ""}`);
}

check("computeF5Revenue missing any input is null", computeF5Revenue({}) === null);
check("computeF5Revenue empty strings are null", computeF5Revenue({
  householdsReachedY3Mn: "",
  trialRatePct: 10,
  repeatConversionPct: 50,
  purchaseFrequencyYr: 4,
  avgPackValueInr: 200,
}) === null);
check("computeF5Revenue non-numeric is null", computeF5Revenue({
  householdsReachedY3Mn: "x",
  trialRatePct: 10,
  repeatConversionPct: 50,
  purchaseFrequencyYr: 4,
  avgPackValueInr: 200,
}) === null);

{
  // 10 Mn hh × 10% trial × 50% repeat × 4 /yr × ₹200 / 1e7 = 40 Cr
  const cr = computeF5Revenue({
    householdsReachedY3Mn: 10,
    trialRatePct: 10,
    repeatConversionPct: 50,
    purchaseFrequencyYr: 4,
    avgPackValueInr: 200,
  });
  check("computeF5Revenue 10mn×10%×50%×4×200 = 40 Cr", cr === 40, String(cr));
}
{
  const cr = computeF5Revenue({
    householdsReachedY3Mn: "2",
    trialRatePct: "20",
    repeatConversionPct: "25",
    purchaseFrequencyYr: "2",
    avgPackValueInr: "100",
  });
  // 2e6 * 0.2 * 0.25 * 2 * 100 / 1e7 = 2
  check("computeF5Revenue numeric strings", cr === 2, String(cr));
}
check("computeF5Revenue zeros still compute", computeF5Revenue({
  householdsReachedY3Mn: 0,
  trialRatePct: 10,
  repeatConversionPct: 50,
  purchaseFrequencyYr: 4,
  avgPackValueInr: 200,
}) === 0);

check("re-exported goNoGoTone", goNoGoTone("GO") === "pass" && goNoGoTone("WATCH") === "watch");
check("re-exported goNoGoIsFloorFailure", goNoGoIsFloorFailure({ f4: { checkLabel: "Below floor" } }) === true);
check("re-exported computeGoNoGo INCOMPLETE", computeGoNoGo({ f1: { checkLabel: "Not yet run", items: [] } }) === "INCOMPLETE");
check("re-exported scoreAdvisoryChecks empty", scoreAdvisoryChecks({}).total === 18);

logScoringFresh({ f2: { cogsAtScale: 100, netMarginAtScale: 60 } }, { f2: { checkLabel: "Cleared" } });
logScoringFresh(undefined, undefined);

const baseDoc = {
  name: "Serum Kill",
  category: "Serum",
  ideaDescription: "a leave-on serum that visibly reduces hair fall in eight weeks",
  f1: {
    declaredAttribute: "Visible hair fall reduction in 8 weeks",
    declaredAttribute2: "Light feel",
    benchmark: "Dove Scalp Serum 100 ml",
    declaredGap: 3,
    gapDerivation: "2% caffeine versus none in the named benchmark",
    parityExceptions: "No fragrance",
    growthRoute: "frequency",
    growthArgument: "Scalp care is growing faster than hair oil in metros",
  },
  f2: { cogsAtScale: 100, gstRatePct: 18, netMarginAtScale: 60, grammage: "100 ml", mrpInr: 295 },
  f3: {},
  f4: { techShiftRisk: { overallRisk: "Low", dimensions: {} } },
  f5: {
    householdsReachedY3Mn: 10,
    trialRatePct: 10,
    repeatConversionPct: 50,
    purchaseFrequencyYr: 4,
    avgPackValueInr: 200,
  },
  f6: {},
  researchFindings: {},
};

{
  const checks = await computeAllAdvisoryChecks(baseDoc);
  check("computeAllAdvisoryChecks without division returns six filters", Boolean(checks.f1 && checks.f2 && checks.f3 && checks.f4 && checks.f5 && checks.f6));
  check("F5 without division still runs", typeof checks.f5.checkLabel === "string");
}

{
  const failedResearch = await computeAllAdvisoryChecks({
    ...baseDoc,
    f2: { ...baseDoc.f2, cogsAtScale: "", researchFailed: true },
    researchFindings: { f2: { researchFailed: true, failureReason: "cost timed out" }, f5: { researchFailed: true } },
  });
  const blob = String(failedResearch.f2.checkLabel + JSON.stringify(failedResearch.f2.items || []));
  check("F2 research-failed without COGS is a failed check", /fail|not yet|research/i.test(blob));
}
{
  const withCogs = await computeAllAdvisoryChecks({
    ...baseDoc,
    f2: { ...baseDoc.f2, cogsAtScale: 100, researchFailed: true },
    researchFindings: { f2: { researchFailed: true } },
  });
  const blob = JSON.stringify(withCogs.f2.items || []);
  check(
    "F2 research-failed WITH COGS still scores the entered cost",
    !/cost estimate was not completed/i.test(blob) && (withCogs.f2.items || []).length > 0
  );
}
{
  const zeroCogs = await computeAllAdvisoryChecks({
    ...baseDoc,
    f2: { ...baseDoc.f2, cogsAtScale: 0, netMarginAtScale: 60 },
  });
  check("F2 cogs 0 is real input", (zeroCogs.f2.items || []).length > 0 && zeroCogs.f2.checkLabel !== "Not yet run");
}
{
  const findingsOnly = await computeAllAdvisoryChecks({
    ...baseDoc,
    f2: { ...baseDoc.f2, researchFailed: false },
    researchFindings: { f2: { researchFailed: true }, f5: {} },
  });
  check("F2 findings.researchFailed with COGS still has items", Array.isArray(findingsOnly.f2.items));
}
{
  const noCat = await computeAllAdvisoryChecks({
    name: "No cat",
    f5: { householdsReachedY3Mn: 1, trialRatePct: 10, repeatConversionPct: 10, purchaseFrequencyYr: 1, avgPackValueInr: 10 },
  });
  check("F5 without category or division still returns a check", typeof noCat.f5.checkLabel === "string");
}
{
  const unsigned = await computeAllAdvisoryChecks({
    ...baseDoc,
    division: "Personal Care",
    f5: { ...baseDoc.f5, cmiHeadSigned: false },
  });
  check("F5 unsigned CMI is pending", /CMI signature pending/.test(JSON.stringify(unsigned.f5.items || [])));
}

{
  const withDivision = await computeAllAdvisoryChecks({
    ...baseDoc,
    division: "Personal Care",
    f5: { ...baseDoc.f5, cmiHeadSigned: true },
    f1: { ...baseDoc.f1, forumVerdict: "pass" },
    f2: { ...baseDoc.f2, forumVerdict: "pass" },
    f3: { forumVerdict: "pass" },
    f4: { ...baseDoc.f4, forumVerdict: "pass" },
    f5: { ...baseDoc.f5, forumVerdict: "pass", cmiHeadSigned: true },
  });
  check("computeAllAdvisoryChecks with Personal Care returns F2 items", Array.isArray(withDivision.f2.items));
  check("F5 with division uses revenue arithmetic", /Year-3 revenue|Sizing/.test(JSON.stringify(withDivision.f5.items || [])));
}

{
  const empty = await computeAllAdvisoryChecks(undefined);
  check("computeAllAdvisoryChecks undefined proposition", Boolean(empty.f1 && empty.f6));
}

{
  const findingsFalse = await computeAllAdvisoryChecks({
    ...baseDoc,
    division: "Personal Care",
    researchFindings: { f5: { sizingFactorsFound: false, sizingEvidence: "no households source" } },
  });
  const blob = JSON.stringify(findingsFalse.f5.items || []);
  check("F5 unsubstantiated household model is pending", /could not substantiate/.test(blob));
}

if (failed) {
  console.error(`\n${failed} CHECK(S) FAILED testPropositionScoringMutationKill`);
  process.exit(1);
}
console.log("PASS testPropositionScoringMutationKill");

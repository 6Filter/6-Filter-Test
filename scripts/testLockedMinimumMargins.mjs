/**
 * Locked division minimum net margins — owner table is the only scoring source.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-locked-margins-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const {
  DIVISION_MIN_NET_MARGIN_PCT,
  NET_MARGIN_ASSIGNMENT,
  INTERNATIONAL_BUSINESS_MARGIN,
  UNMATCHED_DIVISION_F2,
  minNetMarginForDivision,
  LOCKED_DIVISION_NAMES,
} = await import("../lib/lockedConstants.js");
const { getDivisionMarginFloor, computeDivisionFloorDrift, saveDivisionThreshold, addDivisionThreshold } =
  await import("../lib/divisionConfig.js");
const {
  assignDivisionMinimumMargin,
  effectiveMarginDivision,
  lockedFloorForProposition,
  formatLockedDivisionLabel,
  formatMinimumMarginHint,
  marginBelowFloorWarning,
} = await import("../lib/divisionMargin.js");
const { computeAllAdvisoryChecks, computeGoNoGo } = await import("../lib/propositionScoring.js");
const { scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { initDb, listDivisionThresholdRows, updateDivisionThresholdRow } = await import("../lib/db.js");

await initDb();

// 1) Frozen table has exactly the 11 owner rows
assert.equal(LOCKED_DIVISION_NAMES.length, 11);
assert.equal(minNetMarginForDivision("Professional Care"), 60);
assert.equal(minNetMarginForDivision("Personal Care"), 50);
assert.equal(minNetMarginForDivision("Foods"), 35);
assert.equal(minNetMarginForDivision("Snacks"), 30);
assert.equal(minNetMarginForDivision("Bakery"), 30);
assert.equal(minNetMarginForDivision("Ambient Dairy"), 25);
assert.equal(minNetMarginForDivision("Beverages"), 25);
assert.equal(minNetMarginForDivision("Dairy Craft — Non-UHT"), 25);
assert.equal(minNetMarginForDivision("Cold Chain Business"), 12);
assert.equal(minNetMarginForDivision("Dairy Craft — UHT Milk"), 12);
assert.equal(minNetMarginForDivision("International Business"), null);
assert.equal(minNetMarginForDivision("Pets"), null);
assert.equal(NET_MARGIN_ASSIGNMENT, "proposer-input");
assert.equal(INTERNATIONAL_BUSINESS_MARGIN, "respective-division");
assert.equal(UNMATCHED_DIVISION_F2, "pending");
Object.freeze(DIVISION_MIN_NET_MARGIN_PCT);
assert.throws(() => {
  DIVISION_MIN_NET_MARGIN_PCT.Foods = 5;
});

// 2) getDivisionMarginFloor ignores DB edits (Foods DB → 5 still scores 35)
{
  const rows = await listDivisionThresholdRows();
  const foods = rows.find((r) => r.division_name === "Foods");
  assert.ok(foods, "Foods seed row");
  await updateDivisionThresholdRow(foods.id, { min_net_margin_pct: 5 });
  assert.equal(await getDivisionMarginFloor("Foods"), 35, "DB edit must not change scoring floor");
  const drift = await computeDivisionFloorDrift();
  assert.equal(drift.ok, false);
  assert.ok(drift.drift.some((d) => d.division === "Foods" && d.stored === 5 && d.locked === 35));
}

// 3) Cost prompt has no locked floor constant; AI may estimate ideal net margin for autofill
{
  const costSrc = readFileSync(new URL("../lib/filters/runCostEstimate.js", import.meta.url), "utf8");
  assert.doesNotMatch(costSrc, /DIVISION_NET_MARGIN_FLOOR_PCT/);
  assert.doesNotMatch(costSrc, /vs the division floor/);
  assert.match(costSrc, /estimatedNetMarginPct/);
}

// 4) Proposer-input: never auto-assign; hint shows floor; below floor labels
{
  const empty = assignDivisionMinimumMargin({}, { division: "Foods" });
  assert.equal(empty.assigned, false);
  assert.equal(empty.f2.netMarginAtScale, undefined);
  assert.match(formatMinimumMarginHint({ division: "Foods" }), /Minimum net margin for Foods: 35% \(fixed\)/);
  assert.match(marginBelowFloorWarning(20, { division: "Foods" }), /Below the minimum/);

  const kept = assignDivisionMinimumMargin({ netMarginAtScale: 48, netMarginSource: "user" }, { division: "Foods" });
  assert.equal(kept.assigned, false);
  assert.equal(kept.f2.netMarginAtScale, 48);

  const below = await computeAllAdvisoryChecks({
    division: "Foods",
    category: "Pickle",
    f2: {
      mrpInr: 40,
      grammage: "100g",
      netMarginAtScale: 20,
      qcomTrajectory: "flat terms",
      financeSigned: true,
      cogsAtScale: 10,
    },
    researchFindings: {},
  });
  assert.equal(below.f2.checkLabel, "Below floor");
  assert.ok(below.f2.items.some((i) => /below the 35% Foods floor/i.test(i.text)));

  const clears = await computeAllAdvisoryChecks({
    division: "Foods",
    category: "Pickle",
    f2: {
      mrpInr: 40,
      grammage: "100g",
      netMarginAtScale: 40,
      qcomTrajectory: "flat terms",
      financeSigned: true,
      cogsAtScale: 10,
    },
    researchFindings: {},
  });
  assert.ok(clears.f2.items.some((i) => /clears the 35% floor/i.test(i.text)));
}

// 5) International Business → respective division Foods · 35%
{
  const prop = {
    division: "International Business",
    researchFindings: {
      divisionDetection: {
        division: "International Business",
        respectiveDivision: "Foods",
        source: "rule",
        reason: "export snacks",
      },
    },
  };
  assert.equal(effectiveMarginDivision(prop), "Foods");
  assert.equal(lockedFloorForProposition(prop), 35);
  assert.match(formatLockedDivisionLabel(prop), /International Business · respective division Foods · 35%/);

  const ibUnset = { division: "International Business", researchFindings: { divisionDetection: {} } };
  assert.equal(effectiveMarginDivision(ibUnset), null);
  assert.equal(lockedFloorForProposition(ibUnset), null);
}

// 6) Unmatched division → Pending + WATCH cap
{
  const pending = await computeAllAdvisoryChecks({
    division: "",
    category: "Widget",
    f2: {
      mrpInr: 40,
      grammage: "100g",
      netMarginAtScale: 50,
      qcomTrajectory: "flat",
      financeSigned: true,
      cogsAtScale: 10,
    },
    f1: {
      declaredAttribute: "cooling",
      benchmark: "X",
      declaredGap: 3,
      growthRoute: "penetration",
      growthArgument: "growth",
    },
    f3: { marginElasticity: { minMrpInr: 10, maxMrpInr: 80 } },
    f4: {
      techShiftRisk: {
        overallRisk: "Low",
        dimensions: {
          functionalCoreStability: { risk: "Low", reason: "a" },
          consumptionContextStability: { risk: "Low", reason: "b" },
          manufacturingDisruptionRisk: { risk: "Low", reason: "c" },
          userHabitShiftPotential: { risk: "Low", reason: "d" },
          adjacentSubstitutionThreat: { risk: "Low", reason: "e" },
          purchaseFrequencyShift: { risk: "Low", reason: "f" },
          regulatoryDisruptionRisk: { risk: "Low", reason: "g" },
        },
      },
    },
    researchFindings: { f1: { benchmarkVerified: true, categorySizeFound: true } },
  });
  assert.ok(pending.f2.items.some((i) => i.text === "Pending: division not determined"));
  const score = scoreAdvisoryChecks(pending);
  // Unfinished F2 must cap GO → WATCH when otherwise high
  assert.equal(computeGoNoGo(pending), "WATCH");
  assert.ok(score.pct >= 0);
}

// 7) API rejects min_net_margin_pct edits
{
  await assert.rejects(
    () => saveDivisionThreshold("nope", { min_net_margin_pct: 1 }),
    (e) => e.status === 400 && /Minimum net margin is locked/.test(e.message)
  );
  await assert.rejects(
    () => addDivisionThreshold({ division_name: "Foods", min_net_margin_pct: 9 }),
    (e) => e.status === 400 && /Minimum net margin is locked/.test(e.message)
  );
}

// 8) Em dash name exact; decision constants named
{
  assert.ok(Object.prototype.hasOwnProperty.call(DIVISION_MIN_NET_MARGIN_PCT, "Dairy Craft — Non-UHT"));
  assert.equal(minNetMarginForDivision("Dairy Craft - Non-UHT"), null, "hyphen is not the locked name");
  const lc = readFileSync(new URL("../lib/lockedConstants.js", import.meta.url), "utf8");
  assert.match(lc, /export const NET_MARGIN_ASSIGNMENT/);
  assert.match(lc, /export const INTERNATIONAL_BUSINESS_MARGIN/);
  assert.match(lc, /export const UNMATCHED_DIVISION_F2/);
}

// 9) Form shows hint / no reset-to-minimum autofill
{
  const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
  assert.match(formSrc, /formatMinimumMarginHint/);
  assert.match(formSrc, /Enter the net margin to compute MRP/);
  assert.doesNotMatch(formSrc, /Edited by \{editedName\}/);
  assert.doesNotMatch(formSrc, /Reset to the division minimum/);
}

console.log("PASS testLockedMinimumMargins — floor hints, AI may estimate margin, IB/pending/Below floor");

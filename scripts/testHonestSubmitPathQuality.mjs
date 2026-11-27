/**
 * Closest path quality — Filter 4 "entered" lines must be honest.
 * P2: never the words "Screen again" on entered Filter 4 path copy.
 * P4: one collective line while views wait for Submit; none after they are screened.
 */
import assert from "node:assert/strict";
import { collapseF4EnteredPathActions, displayCopy } from "../lib/displayCopy.js";
import { buildPathToGo } from "../lib/improvementPoints.js";
import { checkF4 } from "../lib/filterChecks.js";
import {
  easeScreeningChecks,
  scoringDocForEnteredCredit,
  syncF4ViewsForScore,
} from "../lib/enteredFieldCredit.js";
import { previewAdvisoryChecks } from "../lib/goNoGo.js";
import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";

const finding =
  "No-added-sugar milkshake formats are stable in ambient dairy with enough words here to pass the claim length.";

const dims = Object.fromEntries(
  TECH_SHIFT_DIMENSIONS.map((k) => [k, { risk: "Medium", reason: finding }])
);
const assessments = Object.fromEntries(
  TECH_SHIFT_DIMENSIONS.map((k) => [
    k,
    {
      status: "ok",
      searchUsed: true,
      raw: { rating: "Medium", supported: true, quote: finding, reason: finding },
    },
  ])
);

const base = {
  name: "Cavin's No Added Sugar milkshake",
  screeningDifficulty: 1,
  division: "Beverages",
  category: "Milkshake",
  f1: {
    declaredAttribute: "no added sugar",
    benchmark: "Britannia Winkin' Cow Milkshake",
    declaredGap: 2,
    gapDerivation: "No added sugar claim in tetra pack milkshakes",
    parityExceptions: "Source of calcium",
    growthRoute: "new market",
    growthArgument: "No added sugar claim is not present in tetra competition brands with room to grow.",
  },
  f2: { cogsAtScale: 40, netMarginAtScale: 45, gstRatePct: 12, grammage: "170 ml" },
  f3: {
    volumeLossJustification:
      "Shelf price is held flat for five years including inflation so volume loss stays inside 10%.",
  },
  f4: {
    techShiftRisk: { dimensions: dims, overallRisk: "Medium" },
    userInputs: Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, { pov: finding }])),
  },
  researchFindings: { f4: { assessments } },
};

const synced = syncF4ViewsForScore(base);
const scored = scoringDocForEnteredCredit(synced);
const liveChecks = easeScreeningChecks(
  { ...previewAdvisoryChecks(scored), f4: checkF4(scored.f4, scored.researchFindings.f4) },
  synced
).checks;

// Sealed-open snapshot (score not yet refreshed) — path still lists open F4 rows.
const sealedOpenF4 = {
  checkLabel: "Evidence missing",
  items: TECH_SHIFT_DIMENSIONS.map((k) => ({
    status: "pending",
    credit: 0,
    text: `${k}: Medium risk — open`,
  })),
};
const pathBefore = buildPathToGo({
  advisoryChecks: { ...liveChecks, f4: sealedOpenF4 },
  sealedScore: { pct: 61, total: 100, done: 10, classification: "WATCH" },
  scoreStatus: "current",
  listAllOpen: true,
  doc: synced,
});
const f4Mapped = pathBefore.actions
  .filter((a) => String(a.filter || "").toUpperCase() === "F4")
  .map((a) => ({
    ...a,
    instruction: displayCopy(a.instruction || a.text, synced),
    text: displayCopy(a.instruction || a.text, synced),
  }));
const f4Shown = collapseF4EnteredPathActions(f4Mapped).map((a) => a.instruction || a.text);

// P2 — never "Screen again"
for (const line of f4Shown) {
  assert.doesNotMatch(line, /Screen again/i, `P2: ${line}`);
}
assert.match(
  displayCopy("Clear the open Filter 4 dimension \"Functional core stability\" with a mitigation response", synced),
  /Your Filter 4 ratings are entered\. They are checked when you Submit\./
);
assert.doesNotMatch(
  displayCopy("Clear the open Filter 4 dimension \"Functional core stability\" with a mitigation response", synced),
  /Screen again/i
);

// P4 — one collective entered line, not six
const enteredLines = f4Shown.filter((l) => /Filter 4 ratings are entered/i.test(l));
assert.equal(enteredLines.length, 1, `P4: expected one entered line, got ${f4Shown.length}: ${JSON.stringify(f4Shown)}`);

// After screening (sealed credits the views) — entered lines disappear
const sealedDoneF4 = {
  checkLabel: "Cleared",
  items: TECH_SHIFT_DIMENSIONS.map((k) => ({
    status: "done",
    credit: 1,
    text: `${k}: cleared.`,
  })),
};
const pathAfter = buildPathToGo({
  advisoryChecks: { ...liveChecks, f4: sealedDoneF4 },
  sealedScore: { pct: 97, total: 100, done: 16, classification: "GO" },
  scoreStatus: "current",
  listAllOpen: true,
  doc: synced,
});
const f4AfterMapped = pathAfter.actions
  .filter((a) => String(a.filter || "").toUpperCase() === "F4")
  .map((a) => ({
    ...a,
    instruction: displayCopy(a.instruction || a.text, synced),
    text: displayCopy(a.instruction || a.text, synced),
  }));
const f4After = collapseF4EnteredPathActions(f4AfterMapped).map((a) => a.instruction || a.text);
assert.equal(
  f4After.filter((l) => /Filter 4 ratings are entered|Screen again/i.test(l)).length,
  0,
  `P4 after screen: ${JSON.stringify(f4After)}`
);

console.log("PASS testClosestPathQuality P2 P4");

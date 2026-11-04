/**
 * Part 129 lock coverage — do not edit to weaken.
 * Asserts fingerprint files, golden required ids, INCOMPLETE mode, and named slots.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCORING_RULESET_VERSION,
  INCOMPLETE_VERDICT_MODE,
  SCORE_CHECK_SLOTS_TOTAL,
  GONOGO_SCORE_BANDS,
  DIVISION_MIN_NET_MARGIN_PCT,
} from "../lib/lockedConstants.js";
import {
  SCORING_FINGERPRINT_FILES,
  computeScoringFingerprint,
  hashScoringFile,
} from "../lib/scoringRuleset.js";
import { expectedSlotKeys } from "../lib/scoreSlots.js";
import { computeGoNoGo, scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { checkF1, checkF3, checkF4 } from "../lib/filterChecks.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(readFileSync(join(root, "scripts/golden/scoring-golden.json"), "utf8"));
const fpJson = JSON.parse(readFileSync(join(root, "scripts/scoringFingerprint.json"), "utf8"));

assert.equal(SCORING_RULESET_VERSION, "v5.0");
assert.equal(INCOMPLETE_VERDICT_MODE, "incomplete");
assert.equal(golden.rulesetVersion, "v5.0");
assert.equal(fpJson.rulesetVersion, "v5.0");

const requiredFiles = [
  "lib/mrpFormula.js",
  "lib/divisionMargin.js",
  "lib/improvementPoints.js",
  "lib/propositionGateApi.js",
];
for (const f of requiredFiles) {
  assert.ok(SCORING_FINGERPRINT_FILES.includes(f), `fingerprint list must include ${f}`);
  assert.ok(fpJson.files[f], `fingerprint JSON must hash ${f}`);
  assert.equal(fpJson.files[f], hashScoringFile(f));
}
assert.equal(fpJson.fingerprint, computeScoringFingerprint());

const slots = expectedSlotKeys();
assert.equal(slots.f1.length, 6);
assert.equal(slots.f2.length, 3);
assert.equal(slots.f3.length, 1);
assert.equal(slots.f4.length, 7);
assert.equal(
  slots.f1.length + slots.f2.length + slots.f3.length + slots.f4.length,
  SCORE_CHECK_SLOTS_TOTAL
);

const byId = Object.fromEntries((golden.ideas || []).map((i) => [i.id, i]));
const requiredIds = [
  "band-59",
  "band-60",
  "band-80",
  "band-81",
  "f4-two-high",
  "f4-one-high",
  "cap-not-run",
  "cap-research-failed",
  "cap-no-division",
  "commodity-exempt",
  "international-business",
  "mrp-computed",
  "f3-tolerance-edge",
  "first-mover",
];
for (const id of requiredIds) {
  assert.ok(byId[id], `golden must include ${id}`);
}

assert.equal(byId["band-59"].expected.classification, "NO-GO");
assert.equal(byId["band-59"].expected.pct, 59); // 10/17
assert.equal(byId["band-60"].expected.classification, "WATCH");
assert.equal(byId["band-60"].expected.pct, 65); // 11/17 — closest achievable ≥60
assert.equal(byId["band-80"].expected.classification, "WATCH");
assert.equal(byId["band-80"].expected.pct, 76); // 13/17 — closest achievable ≤80
assert.equal(byId["band-81"].expected.classification, "GO");
assert.ok(byId["band-81"].expected.pct > GONOGO_SCORE_BANDS.WATCH_MAX); // 14/17 = 82

assert.equal(byId["cap-not-run"].expected.classification, "INCOMPLETE");
assert.equal(byId["cap-research-failed"].expected.classification, "INCOMPLETE");
assert.equal(byId["cap-no-division"].expected.classification, "INCOMPLETE");

const watchCount = (golden.ideas || []).filter((i) => i.expected.classification === "WATCH").length;
assert.ok(watchCount >= 8, `need ≥8 WATCH entries, got ${watchCount}`);

const withDoc = (golden.ideas || []).filter((i) => i.doc && typeof i.doc === "object");
assert.ok(withDoc.length >= 40, `need ≥40 doc-backed entries, got ${withDoc.length}`);

// Every division minimum at / below / above present (check-level or doc-level)
for (const [div, floor] of Object.entries(DIVISION_MIN_NET_MARGIN_PCT)) {
  if (floor == null) continue;
  const slug = div.replace(/[^a-z0-9]+/gi, "_");
  for (const tag of ["below", "at", "above"]) {
    assert.ok(
      byId[`margin-${slug}-${tag}`] || byId[`doc-margin-${slug}-${tag}`],
      `missing margin edge for ${div} ${tag}`
    );
  }
}

// Live incomplete research never NO-GO when floors pass
{
  const incomplete = {
    f1: checkF1({
      declaredAttribute: "Taste",
      benchmark: "X",
      declaredGap: 3,
      growthRoute: "penetration",
      growthArgument: "y",
    }),
    f2: { checkLabel: "Not yet run", items: [] },
    f3: checkF3({}, {}),
    f4: checkF4({}),
  };
  assert.equal(computeGoNoGo(incomplete), "INCOMPLETE");
  assert.equal(goNoGoIsFloorFailureSafe(incomplete), false);
}

function goNoGoIsFloorFailureSafe(checks) {
  return ["f1", "f2", "f3", "f4"].some((k) => checks[k]?.checkLabel === "Below floor");
}

// Named slots: reordering items must not change done count
{
  const ordered = {
    f1: {
      checkLabel: "Evidence missing",
      items: [
        { status: "done", text: "Attribute 1 declared" },
        { status: "pending", text: "Benchmark not verified" },
        { status: "done", text: "Declared gap 3 clears the 2.0 floor" },
        { status: "done", text: "Growth route recorded" },
      ],
    },
    f2: { checkLabel: "Not yet run", items: [] },
    f3: { checkLabel: "Not yet run", items: [] },
    f4: { checkLabel: "Not yet run", items: [] },
  };
  const reordered = {
    ...ordered,
    f1: {
      ...ordered.f1,
      items: [ordered.f1.items[2], ordered.f1.items[0], ordered.f1.items[3], ordered.f1.items[1]],
    },
  };
  assert.equal(scoreAdvisoryChecks(ordered).done, scoreAdvisoryChecks(reordered).done);
}

console.log("PASS testScoringLockCoverage");

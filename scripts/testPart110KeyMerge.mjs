import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SIX_FILTERS_FORM } from "../lib/propositionFields.js";
import { isServerOwnedFilterKey, mergeFilterObject } from "../lib/filterWriteGuard.js";
import { liftStoredMitigations } from "../lib/filterOwnershipLift.js";

const doc = readFileSync(new URL("../docs/FIELD_OWNERSHIP_KEYS.md", import.meta.url), "utf8");
const server = [];
const human = [];
for (const spec of SIX_FILTERS_FORM) {
  for (const field of spec.fields) {
    assert.match(doc, new RegExp(`\`${field.key}\``));
    if (isServerOwnedFilterKey(field.key)) server.push(field.key);
    else human.push(field.key);
  }
}
assert.deepEqual(server, ["techShiftRisk", "computedRevenue"]);
assert.ok(human.includes("cogsAtScale"));
assert.ok(human.includes("plannedAnnualIncreasePct"));
assert.ok(human.includes("f4MitigationResponses"));
assert.match(doc, /forumVerdict/);
assert.match(doc, /marginElasticity/);

const kept = mergeFilterObject(
  { benchmark: "Brand", declaredAttribute: "strength" },
  { declaredAttribute: "strength" }
);
assert.equal(kept.value.benchmark, "Brand");
assert.deepEqual(kept.blockedKeys, ["benchmark"]);

for (const blank of ["", null, undefined]) {
  const cleared = mergeFilterObject({ benchmark: "Brand", declaredGap: 3 }, { benchmark: blank, declaredGap: 3 });
  assert.equal(cleared.value.benchmark, undefined, `blank ${String(blank)} did not clear`);
  assert.equal(Number(cleared.value.declaredGap), 3);
}

const stale = mergeFilterObject(
  { cogsAtScale: 40 },
  { cogsAtScale: "" },
  { stale: true }
);
assert.equal(Number(stale.value.cogsAtScale), 40);
assert.deepEqual(stale.blockedKeys, ["cogsAtScale"]);

const serverKey = mergeFilterObject(
  { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low", reason: "stable" } } } },
  { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "High", reason: "shift" } } } }
);
assert.equal(serverKey.value.techShiftRisk.dimensions.functionalCoreStability.risk, "Low");
assert.equal(serverKey.value.techShiftRisk.dimensions.functionalCoreStability.reason, "stable");

const handFirst = mergeFilterObject(
  {},
  { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low", reason: "oil holds" } } } }
);
assert.equal(handFirst.value.techShiftRisk.dimensions.functionalCoreStability.risk, "Low");
assert.equal(handFirst.value.techShiftRisk.dimensions.functionalCoreStability.reason, "oil holds");

const reasonKept = mergeFilterObject(
  { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low", reason: "stable" } } } },
  { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low", reason: "daily oiling still holds" } } } }
);
assert.equal(reasonKept.value.techShiftRisk.dimensions.functionalCoreStability.risk, "Low");
assert.equal(reasonKept.value.techShiftRisk.dimensions.functionalCoreStability.reason, "daily oiling still holds");

const blankShell = mergeFilterObject(
  { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Medium", reason: "shift" } } } },
  { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "", reason: "" } } } }
);
assert.equal(blankShell.value.techShiftRisk.dimensions.functionalCoreStability.risk, "Medium");

const explicit = mergeFilterObject(
  { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low" } } } },
  {},
  { clearKeys: ["techShiftRisk"] }
);
assert.equal(explicit.value.techShiftRisk, undefined);

const lifted = liftStoredMitigations({
  techShiftRisk: { dimensions: { functionalCoreStability: { risk: "High", userResponse: "Signed contract Q1" } } },
});
assert.equal(lifted.f4MitigationResponses.functionalCoreStability, "Signed contract Q1");
assert.equal(lifted.techShiftRisk.dimensions.functionalCoreStability.userResponse, "Signed contract Q1");

console.log("PASS Part 110 key merge");

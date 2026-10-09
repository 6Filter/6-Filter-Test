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
assert.deepEqual(server, ["marginElasticity", "techShiftRisk", "computedRevenue"]);
assert.ok(human.includes("cogsAtScale"));
assert.ok(human.includes("f3RangeOverride"));
assert.ok(human.includes("f4MitigationResponses"));
assert.match(doc, /forumVerdict/);

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
  { marginElasticity: { minMrpInr: 40, maxMrpInr: 90 } },
  { marginElasticity: { minMrpInr: 1, maxMrpInr: 2 } }
);
assert.equal(serverKey.value.marginElasticity.minMrpInr, 40);

const explicit = mergeFilterObject(
  { marginElasticity: { minMrpInr: 40 } },
  {},
  { clearKeys: ["marginElasticity"] }
);
assert.equal(explicit.value.marginElasticity, undefined);

const lifted = liftStoredMitigations({
  techShiftRisk: { dimensions: { functionalCoreStability: { risk: "High", userResponse: "Signed contract Q1" } } },
});
assert.equal(lifted.f4MitigationResponses.functionalCoreStability, "Signed contract Q1");
assert.equal(lifted.techShiftRisk.dimensions.functionalCoreStability.userResponse, "Signed contract Q1");

console.log("PASS Part 110 key merge");

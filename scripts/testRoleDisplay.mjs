/**
 * Part 145 D105/D106/D109 — two labels (Required / Optional) over twelve typed Required boxes.
 * Name and team are not boxes; cost, margin and MRP are filled by the system; parity is one tick.
 */
import assert from "node:assert/strict";
import {
  DISPLAY_REQUIRED_PATHS,
  displayRole,
  requiredEmpty,
  submitBarMessageTwoLabels,
} from "../lib/fieldRoleDisplay.js";
import { emptyPropositionDoc } from "../lib/propositionFields.js";
import { effectiveRole, formFieldPaths } from "../lib/fieldRoles.js";

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}

const empty = emptyPropositionDoc("x");

const TWELVE = [
  "name", "category", "ideaDescription",
  "f1.declaredAttribute", "f1.benchmark", "f1.declaredGap", "f1.gapDerivation", "f1.parityExceptions",
  "f1.growthRoute", "f1.growthArgument",
  "f2.grammage", "f2.gstRatePct",
];

await check("displayRole returns only Required or Optional for every form path", () => {
  for (const path of formFieldPaths()) {
    const label = displayRole(path, empty);
    assert.ok(label === "Required" || label === "Optional", `${path} → ${label}`);
  }
});

await check("D105 exactly twelve Required boxes; name and team are not among them", () => {
  assert.deepEqual([...DISPLAY_REQUIRED_PATHS].sort(), [...TWELVE].sort());
  assert.equal(DISPLAY_REQUIRED_PATHS.length, 12);
  for (const path of DISPLAY_REQUIRED_PATHS) assert.equal(displayRole(path, empty), "Required", path);
  assert.ok(!DISPLAY_REQUIRED_PATHS.includes("submitterName"));
  assert.ok(!DISPLAY_REQUIRED_PATHS.includes("submitterDepartment"));
});

await check("D106 cost, margin and MRP are not Required (the system fills them)", () => {
  for (const path of ["f2.cogsAtScale", "f2.netMarginAtScale", "f2.mrpInr"]) {
    assert.equal(displayRole(path, empty), "Optional", path);
    assert.ok(!requiredEmpty(empty).some((i) => i.path === path), `${path} never blocks Submit`);
  }
  assert.equal(displayRole("f1.declaredAttribute2", empty), "Optional");
  assert.equal(displayRole("f4.techShiftRisk", empty), "Optional");
});

await check("Benchmark becomes Optional when growth route is New market", () => {
  const nm = { ...empty, f1: { ...empty.f1, growthRoute: "new-market" } };
  assert.equal(displayRole("f1.benchmark", nm), "Optional");
  assert.equal(displayRole("f1.declaredAttribute", nm), "Required");
  assert.ok(!requiredEmpty(nm).some((i) => i.path === "f1.benchmark"));
});

await check("requiredEmpty lists only display-Required empties; scoring roles stay intact", () => {
  const left = requiredEmpty(empty).map((i) => i.path);
  assert.equal(left.length, 12);
  assert.ok(left.includes("name"));
  assert.ok(left.includes("f1.declaredAttribute"));
  assert.ok(left.includes("f1.parityExceptions"));
  assert.ok(!left.includes("f2.cogsAtScale"));
  assert.ok(!left.includes("f1.declaredAttribute2"));
  assert.equal(effectiveRole("f1.declaredAttribute", empty), "scored");
  assert.equal(effectiveRole("f1.declaredAttribute2", empty), "optional");
});

await check("D109 parity: the one tick stores 'none' and counts as answered; unanswered still blocks", () => {
  assert.ok(requiredEmpty(empty).some((i) => i.path === "f1.parityExceptions"));
  const ticked = { ...empty, f1: { ...empty.f1, parityExceptions: "none" } };
  assert.ok(!requiredEmpty(ticked).some((i) => i.path === "f1.parityExceptions"));
  const written = { ...empty, f1: { ...empty.f1, parityExceptions: "Fragrance may be weaker" } };
  assert.ok(!requiredEmpty(written).some((i) => i.path === "f1.parityExceptions"));
});

await check("submitBarMessageTwoLabels blocks until every Required box is filled", () => {
  assert.match(submitBarMessageTwoLabels(empty), /^12 required boxes left before you can submit\.?$/i);
  const gated = { ...empty, name: "Oil", category: "Hair oils", ideaDescription: "Cooling oil" };
  const mid = submitBarMessageTwoLabels(gated);
  assert.match(mid, /^9 required boxes left before you can submit\.?$/i);
  const full = structuredClone(gated);
  Object.assign(full.f1, {
    declaredAttribute: "Cools",
    benchmark: "Parachute Advansed 100 ml",
    declaredGap: 2,
    gapDerivation: "Lasts longer",
    parityExceptions: "none",
    growthRoute: "penetration",
    growthArgument: "Category is growing",
  });
  Object.assign(full.f2, { grammage: "100 ml", gstRatePct: 18 });
  assert.equal(submitBarMessageTwoLabels(full), "Ready to submit.");
});

console.log(`PASS testRoleDisplay — ${checks} checks`);
process.exit(0);

/**
 * Part 143 A — two labels on the real scorer roles (5 checks).
 * displayRole maps fieldRoles into Required / Optional only.
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

await check("displayRole returns only Required or Optional for every form path", () => {
  for (const path of formFieldPaths()) {
    const label = displayRole(path, empty);
    assert.ok(label === "Required" || label === "Optional", `${path} → ${label}`);
  }
});

await check("D85 Required list matches displayRole on an empty idea (benchmark required)", () => {
  for (const path of DISPLAY_REQUIRED_PATHS) {
    assert.equal(displayRole(path, empty), "Required", path);
  }
  assert.equal(displayRole("f1.declaredAttribute2", empty), "Optional");
  assert.equal(displayRole("f1.targetConsumer", empty), "Optional");
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
  assert.ok(left.includes("name"));
  assert.ok(left.includes("f1.declaredAttribute"));
  assert.ok(left.includes("f2.cogsAtScale"));
  assert.ok(!left.includes("f1.declaredAttribute2"));
  // Finer roles in fieldRoles.js are unchanged for the scorer.
  assert.equal(effectiveRole("f1.declaredAttribute", empty), "scored");
  assert.equal(effectiveRole("f1.declaredAttribute2", empty), "optional");
});

await check("submitBarMessageTwoLabels: gate → ready-with-cost → ready", () => {
  assert.match(submitBarMessageTwoLabels(empty), /required boxes left before you can submit:/i);
  const gated = {
    ...empty,
    submitterName: "A",
    submitterDepartment: "Marketing",
    name: "Oil",
    category: "Hair oils",
    ideaDescription: "Cooling oil",
  };
  const mid = submitBarMessageTwoLabels(gated);
  assert.match(mid, /^Ready to submit\./);
  assert.match(mid, /required boxes? (is|are) still empty/);
  const full = structuredClone(gated);
  for (const path of DISPLAY_REQUIRED_PATHS) {
    if (path.startsWith("f1.")) {
      const k = path.slice(3);
      if (k === "growthRoute") full.f1[k] = "penetration";
      else if (k === "declaredGap") full.f1[k] = 2;
      else full.f1[k] = full.f1[k] || "x";
    } else if (path.startsWith("f2.")) {
      const k = path.slice(3);
      full.f2[k] = k === "grammage" ? "100 ml" : 10;
    }
  }
  assert.equal(submitBarMessageTwoLabels(full), "Ready to submit.");
});

console.log(`PASS testRoleDisplay — ${checks} checks`);
process.exit(0);

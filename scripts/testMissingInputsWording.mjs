/**
 * Hotfix — "Values you have not entered yet" vs unfinished research (8 checks).
 * Attached owner test: do not weaken assertions to match a broken build.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listMissingFormInputs, listUnfinishedResearch } from "../lib/filterUnlock.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const unlockSrc = readFileSync(new URL("../lib/filterUnlock.js", import.meta.url), "utf8");

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`  ok ${checks} — ${name}`);
}

const typedFilled = {
  name: "Oil",
  category: "Hair oils",
  ideaDescription: "cooling oil",
  f1: {
    declaredAttribute: "cooling",
    benchmark: "Indulekha Bringha 100ml",
    declaredGap: 2,
    growthRoute: "penetration",
    growthArgument: "category growing",
  },
  f2: { cogsAtScale: 40, netMarginAtScale: 22, gstRatePct: 18, grammage: "100 ml" },
  f3: { plannedAnnualIncreasePct: 5 },
};

check("listMissingFormInputs never returns Filter 4, Filter 5, Filter 6 or the COGS estimate", () => {
  const missing = listMissingFormInputs({});
  assert.ok(missing.length > 0);
  for (const m of missing) {
    assert.notEqual(m.filter, "f4");
    assert.notEqual(m.filter, "f5");
    assert.notEqual(m.filter, "f6");
    assert.notEqual(m.field, "techShiftRisk");
    assert.notEqual(m.field, "costEstimate");
    assert.notEqual(m.field, "householdsReachedY3Mn");
  }
  assert.doesNotMatch(
    unlockSrc.slice(unlockSrc.indexOf("REQUIRED_FORM_FIELDS"), unlockSrc.indexOf("listMissingFormInputs")),
    /techShiftRisk|costEstimate|householdsReached/
  );
});

check("a fully typed Filters 1–3 idea has an empty missing-inputs list", () => {
  assert.deepEqual(listMissingFormInputs(typedFilled), []);
});

check("listUnfinishedResearch lists Filter 4 when the seven dimensions are missing", () => {
  const unfinished = listUnfinishedResearch(typedFilled);
  assert.ok(unfinished.some((u) => u.field === "techShiftRisk"));
  const f4 = unfinished.find((u) => u.field === "techShiftRisk");
  assert.match(f4.label, /Filter 4/);
  assert.match(f4.reason, /Research did not finish/i);
  assert.equal(f4.scoreShare.checks, 7);
  assert.equal(f4.scoreShare.of, 18);
  assert.equal(f4.scoreShare.pct, 39);
});

check("listUnfinishedResearch lists the COGS estimate when research failed or never returned it", () => {
  const failed = listUnfinishedResearch({
    ...typedFilled,
    researchRunAt: "2026-11-17T00:00:00Z",
    researchFindings: { f2: { costEstimate: { status: "failed", error: "timeout" } } },
    f4: { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low" } } } },
  });
  assert.ok(failed.some((u) => u.field === "costEstimate"));
  const missingCe = listUnfinishedResearch({
    ...typedFilled,
    researchRunAt: "2026-11-17T00:00:00Z",
    researchFindings: { f2: {} },
    f4: { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low" } } } },
  });
  assert.ok(missingCe.some((u) => u.field === "costEstimate"));
});

check("Filter 5 is not listed as unfinished research before a proof file", () => {
  const unfinished = listUnfinishedResearch({
    ...typedFilled,
    f5: {},
    researchFindings: { f5: { researchFailed: true } },
  });
  assert.ok(!unfinished.some((u) => u.filter === "f5"));
  assert.ok(!unfinished.some((u) => /households|Filter 5/i.test(u.label || "")));
});

check("the output page has research-unfinished with Screen again and the Filter 4 share line", () => {
  assert.match(formSrc, /data-testid="research-unfinished"/);
  assert.match(formSrc, /Research that did not finish/);
  assert.match(formSrc, /Filter 4 is 7 of the 18 checks \(39% of the score\)/);
  assert.match(formSrc, /data-testid="research-unfinished-screen-again"/);
  assert.match(formSrc, /Screen again/);
  assert.match(formSrc, /research-unfinished-screen-again/);
  assert.match(formSrc, /listUnfinishedResearch/);
});

check("Values you have not entered yet stays for typed boxes only", () => {
  assert.match(formSrc, /Values you have not entered yet/);
  assert.match(formSrc, /listMissingFormInputs/);
  const headingAt = formSrc.indexOf("Values you have not entered yet");
  const block = formSrc.slice(Math.max(0, headingAt - 350), headingAt + 280);
  assert.match(block, /listMissingFormInputs|missingFormInputs/);
  assert.doesNotMatch(block, /listUnfinishedResearch/);
  assert.doesNotMatch(block, /research-unfinished/);
});

check("a typed idea with finished Filter 4 research and a cost estimate has no unfinished research", () => {
  const done = listUnfinishedResearch({
    ...typedFilled,
    researchRunAt: "2026-11-17T00:00:00Z",
    f4: {
      techShiftRisk: {
        dimensions: {
          functionalCoreStability: { risk: "Low" },
          consumptionContextStability: { risk: "Low" },
          manufacturingDisruptionRisk: { risk: "Low" },
          userHabitShiftPotential: { risk: "Low" },
          adjacentSubstitutionThreat: { risk: "Low" },
          purchaseFrequencyShift: { risk: "Low" },
          regulatoryDisruptionRisk: { risk: "Low" },
        },
      },
    },
    researchFindings: { f2: { costEstimate: { status: "ok", cogsAtScale: 40 } } },
  });
  // dimensions object present ⇒ not unfilled (isTechShiftRiskUnfilled only checks dimensions != null)
  assert.equal(done.filter((u) => u.field === "costEstimate").length, 0);
  assert.equal(done.filter((u) => u.field === "techShiftRisk").length, 0);
});

console.log(`PASS testMissingInputsWording (${checks} checks)`);

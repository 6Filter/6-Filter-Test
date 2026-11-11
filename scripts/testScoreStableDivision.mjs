/**
 * Same hair-oil numbers score the same whether division is still blank or Personal Care.
 * A read must not need the division to have been written. An unrelated idea stays pending.
 */
import assert from "node:assert/strict";
import { divisionForScore } from "../lib/divisionForScore.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";
import { previewAdvisoryChecks, scoreAdvisoryChecks, computeGoNoGo } from "../lib/goNoGo.js";
import { scoreInputKey } from "../lib/analysisStability.js";

const hair = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil for summer, 10g trial pack.",
  f2: {
    cogsAtScale: "70",
    netMarginAtScale: "22",
    gstRatePct: "18",
    grammage: "10g",
    qcomTrajectory: "flat",
  },
};

assert.equal(divisionForScore(hair), "Personal Care");
assert.equal(divisionForScore({ ...hair, division: "Foods" }), "Foods");
assert.equal(divisionForScore({ category: "Widget" }), "");

const blank = await computeAllAdvisoryChecks({ ...hair, division: "" });
const personal = await computeAllAdvisoryChecks({ ...hair, division: "Personal Care" });
const blankAgain = await computeAllAdvisoryChecks({ ...hair, division: "" });

function marginText(checks) {
  return (checks.f2?.items || []).map((item) => item.text).join(" | ");
}

assert.equal(marginText(blank), marginText(personal));
assert.match(marginText(blank), /below the 50% minimum for Personal Care/);
assert.equal(blank.f2.checkLabel, personal.f2.checkLabel);
assert.equal(scoreAdvisoryChecks(blank).pct, scoreAdvisoryChecks(personal).pct);
assert.equal(computeGoNoGo(blank), computeGoNoGo(personal));
assert.equal(JSON.stringify(blank), JSON.stringify(blankAgain));
assert.equal(scoreInputKey({ ...hair, division: "" }), scoreInputKey({ ...hair, division: "Personal Care" }));
assert.notEqual(scoreInputKey({ ...hair, division: "Foods" }), scoreInputKey({ ...hair, division: "" }));

const previewBlank = previewAdvisoryChecks({ ...hair, division: "" });
const previewPc = previewAdvisoryChecks({ ...hair, division: "Personal Care" });
assert.equal(marginText(previewBlank), marginText(previewPc));
assert.match(marginText(previewBlank), /below the 50% minimum for Personal Care/);

const pending = await computeAllAdvisoryChecks({
  division: "",
  category: "Widget",
  f2: { netMarginAtScale: 50, grammage: "100g", cogsAtScale: 10, gstRatePct: 18 },
});
assert.ok(pending.f2.items.some((item) => item.text === "Pending: division not determined"));

console.log("PASS score stays the same when division is blank or Personal Care");

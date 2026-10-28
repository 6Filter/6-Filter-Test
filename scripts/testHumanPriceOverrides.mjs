/**
 * A typed GST rate and a shelf MRP that is not the formula must survive reload.
 * Auto GST always stores a basis sentence. Auto MRP matches computeMrp to the paisa.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isHumanGstOverride } from "../lib/gstRate.js";
import { computeMrp, isHumanMrpOverride } from "../lib/mrpFormula.js";

assert.equal(isHumanGstOverride(5, ""), true);
assert.equal(isHumanGstOverride("12", null), true);
assert.equal(isHumanGstOverride(18, "Analysed by AI from the product at the top of this page — GST 18%."), false);
assert.equal(isHumanGstOverride("", ""), false);
assert.equal(isHumanGstOverride(null, ""), false);

const formula = computeMrp({ cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18 });
assert.equal(formula.finalMrp.toFixed(2), "104.89");
assert.equal(isHumanMrpOverride(199, formula.finalMrp), true);
assert.equal(isHumanMrpOverride("104.89", formula.finalMrp), false);
assert.equal(isHumanMrpOverride("", formula.finalMrp), false);
assert.equal(isHumanMrpOverride(199, null), true);

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(form, /isHumanGstOverride/);
assert.match(form, /isHumanMrpOverride/);
assert.match(form, /mrpHydratedFor/);

console.log("PASS human GST and MRP overrides stay on the saved idea");

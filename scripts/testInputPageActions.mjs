/**
 * Input page: Submit for verdict only; F4 dimensions editable without Re-run.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { blankTechShiftRisk, isTechShiftRiskUnfilled } from "../lib/techShiftRisk.js";
import { isFilterUnlocked } from "../lib/filterUnlock.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const form = readFileSync(join(root, "src/PropositionForm.jsx"), "utf8");

assert.ok(!/Open evaluation page/.test(form), "Open evaluation page removed from input page");
assert.ok(
  !/Send to Manager/.test(form),
  "Send to Manager removed from input page"
);
assert.ok(!/setManagerOpen/.test(form), "orphaned setManagerOpen must not remain after Send to Manager removal");
assert.match(form, /Submit for verdict/);
assert.match(form, /f4-dimension-editor/);
assert.match(form, /Select risk/);
assert.match(
  form,
  /Rate all seven points/,
  "F4 tells the person to rate dimensions by hand"
);
assert.match(form, /data-f3-resilience="cliff"/);
assert.match(form, /Planned annual inflation-cover increase/);
assert.match(form, /priceCrossings/);

assert.equal(isFilterUnlocked("f4", {}), true);
assert.equal(isFilterUnlocked("f3", {}), true);
assert.equal(isFilterUnlocked("f1", {}), true);
assert.equal(isFilterUnlocked("f2", {}), true);
assert.equal(isFilterUnlocked("f5", {}), false, "F5 locked until GO + proof");
assert.equal(isFilterUnlocked("f6", {}), false, "F6 locked until GO + proof");
assert.match(form, /FilterTeaserCard/);
assert.match(form, /Opens once the idea reads GO and proof is uploaded/);
// blankTechShiftRisk is display-only; dimensions object exists so treat as shape for UI.
assert.equal(isTechShiftRiskUnfilled(null), true);
assert.equal(isTechShiftRiskUnfilled({}), true);
assert.equal(
  isTechShiftRiskUnfilled({
    dimensions: { functionalCoreStability: { risk: "Low", reason: "ok" } },
  }),
  false
);
assert.ok(blankTechShiftRisk().dimensions);

console.log("PASS testInputPageActions");

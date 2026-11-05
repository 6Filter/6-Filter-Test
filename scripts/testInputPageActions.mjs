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
assert.match(form, /Submit for verdict/);
assert.match(form, /f4-dimension-editor/);
assert.match(form, /Select risk/);
assert.match(
  form,
  /Rate all seven points/,
  "F4 tells the person to rate dimensions by hand"
);

assert.equal(isFilterUnlocked("f4", {}), true);
assert.equal(isFilterUnlocked("f3", {}), true);
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

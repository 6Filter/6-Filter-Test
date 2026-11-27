import assert from "node:assert/strict";
import { verdictWithLevelBasis } from "../lib/verdictLevelLabel.js";
import { withScreeningDifficulty } from "../lib/difficultyLevel.js";

assert.match(
  verdictWithLevelBasis("GO", withScreeningDifficulty({ name: "x" }, 1)),
  /GO at Level 1.*typed answers accepted, not web-verified/
);
assert.match(
  verdictWithLevelBasis("WATCH", withScreeningDifficulty({ name: "x" }, 2)),
  /WATCH at Level 2/
);
assert.match(
  verdictWithLevelBasis("NO-GO", withScreeningDifficulty({ name: "x" }, 3)),
  /NO-GO at Level 3.*web-checked/
);
assert.match(verdictWithLevelBasis("GO", { name: "legacy" }), /Before levels/);
assert.equal(verdictWithLevelBasis("", withScreeningDifficulty({}, 1)), "");
console.log("PASS testVerdictLevelLabel");

import assert from "node:assert/strict";
import { ideaSizeForResult } from "../lib/ideaScale.js";
import { rowTeam } from "../lib/logStatus.js";

const sized = ideaSizeForResult({
  f5: {
    householdsReachedY3Mn: 2,
    trialRatePct: 20,
    repeatConversionPct: 40,
    purchaseFrequencyYr: 6,
    avgPackValueInr: 80,
    confirmedByHuman: true,
  },
  f1: { forumVerdict: "pass" },
  f2: { forumVerdict: "pass" },
  f3: { forumVerdict: "pass" },
  f4: { forumVerdict: "pass" },
  ideaWeight: "1000g",
});
assert.ok(sized.tier === "10g" || sized.tier === "100g" || sized.tier === "1000g");
assert.match(sized.derivation, /₹|Cr|idea scale/i);
assert.equal(Object.hasOwn(sized, "ideaWeight"), false);

const fallback = ideaSizeForResult({ ideaWeight: "1000g" });
assert.equal(fallback.tier, "10g");

assert.equal(
  rowTeam({ division: "Foods", submitterDepartment: "R&D" }),
  "R&D"
);
assert.notEqual(rowTeam({ division: "Foods", submitterDepartment: "NPD" }), "Foods");

console.log("PASS Part 71 idea scale comes from Filter 5, and the Log team is the submitter");

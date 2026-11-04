/**
 * Part 132 — every path item is an instruction with a gain (screenshot lock).
 */
import assert from "node:assert/strict";
import { checkF1 } from "../../lib/filterChecks.js";
import { buildPathToGo, gainPctForSlots } from "../../lib/improvementPoints.js";
import { scoreAdvisoryChecks } from "../../lib/goNoGo.js";

const f2Partial = {
  checkLabel: "Cleared",
  items: [
    { status: "done", text: "MRP ₹299 · 50 ml", code: undefined },
    { status: "done", text: "Net margin 55% clears the division floor" },
    { status: "done", text: "Quick-commerce terms assumption recorded" },
  ],
};
const empty = { checkLabel: "Not yet run", items: [] };

const f1 = checkF1(
  {
    declaredAttribute: "hair growth",
    benchmark: "dOVE SCALP SERUM",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "households growing in hair serums",
  },
  {}
);

const checks = { f1, f2: f2Partial, f3: empty, f4: empty };
const score = scoreAdvisoryChecks(checks);
assert.equal(score.done, 5, "screenshot: 5 of 15");
assert.equal(score.pct, 33);

const path = buildPathToGo({
  advisoryChecks: checks,
  sealedScore: { pct: 33, done: 5, total: 15 },
  scoreStatus: "current",
  listAllOpen: true,
  doc: {
    name: "Hair growth serum",
    f1: { benchmark: "dOVE SCALP SERUM", benchmarkResearchName: "Dove Scalp Serum" },
  },
});

assert.equal(path.kind, "path");
assert.ok(path.actions.length >= 3, "must list F1 open + F3 + F4, not a single restated name");
assert.ok(!path.actions.some((a) => /^Benchmark named:/i.test(a.text || a.instruction || "")));
assert.ok(!path.actions.some((a) => /dOVE SCALP SERUM/i.test(a.text || "") && /named:/i.test(a.text || "")));

let gainSum = 0;
for (const a of path.actions) {
  assert.ok(String(a.instruction || a.text || "").length >= 15, `instruction too short: ${a.text}`);
  assert.match(String(a.instruction || a.text || ""), /^[A-Za-z]/, `must start with a verb: ${a.text}`);
  assert.ok(Number(a.gainPct) > 0, `gain required: ${a.text}`);
  gainSum += Number(a.gainPct);
}
assert.ok(gainSum >= 60, `open gains should cover remaining slots, got ${gainSum}`);
assert.notEqual(path.currentPct, path.toGo.pct);
assert.doesNotMatch(path.headline || "", /(\d+)% → \1%/);

const bench = path.actions.find((a) => /benchmark|Filter 1 research/i.test(a.instruction || a.text || ""));
assert.ok(bench, "benchmark open check must appear as an instruction");
assert.match(bench.instruction || bench.text, /Run Filter 1 research|verify|Submit/i);

assert.ok(path.actions.some((a) => /Filter 3|safe MRP/i.test(a.instruction || a.text || "")));
assert.ok(path.actions.some((a) => /Filter 4/i.test(a.instruction || a.text || "") && a.gainPct === gainPctForSlots(7)));

console.log("PASS owner testPathCopy");

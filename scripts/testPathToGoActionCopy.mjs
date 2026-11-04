/**
 * Path-to-GO actions must say what to do and how many points they add —
 * never restate a correctly named benchmark as the defect, never X% → X%.
 */
import assert from "node:assert/strict";
import { checkF1 } from "../lib/filterChecks.js";
import {
  actionFixCopy,
  buildPathToGo,
  computeImprovementPointValues,
} from "../lib/improvementPoints.js";

assert.match(
  actionFixCopy(
    "f1",
    "benchmark",
    "Named benchmark awaiting web verification — Submit so India listings can be checked"
  ),
  /Submit so web search can verify/i
);
assert.match(
  actionFixCopy(
    "f1",
    "benchmark",
    'Benchmark "dOVE SCALP SERUM" is named correctly, but not verified — no listing'
  ),
  /did not verify|not verified/i
);
assert.match(
  actionFixCopy(
    "f1",
    "growth",
    "Category size awaiting web research — Submit so the growth route can be substantiated"
  ),
  /Submit so web search can substantiate/i
);

const f1 = checkF1(
  {
    declaredAttribute: "hair growth",
    benchmark: "dOVE SCALP SERUM",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "households growing",
  },
  {}
);
assert.equal(f1.items.filter((i) => i.status === "done").length, 2, "attr + gap only until research verifies");

const empty = { checkLabel: "Not yet run", items: [] };
const f2Pending = {
  checkLabel: "Evidence missing",
  items: [
    { status: "pending", text: "MRP not entered" },
    { status: "pending", text: "Net margin not entered" },
    { status: "pending", text: "Quick-commerce terms not recorded" },
  ],
};
const checks = { f1, f2: f2Pending, f3: empty, f4: empty };
const path = buildPathToGo({
  advisoryChecks: checks,
  sealedScore: { pct: 13, done: 2, total: 15 },
  scoreStatus: "current",
});

assert.equal(path.kind, "path");
assert.notEqual(path.currentPct, path.toGo.pct, "never X% → X%");
assert.ok(path.toGo.pct > path.currentPct);
assert.ok(path.actions.length >= 2, "incomplete ideas list every open action needed");
for (const a of path.actions) {
  assert.ok(Number(a.gainPct) > 0, `gain required: ${a.text}`);
  assert.doesNotMatch(a.text, /^Benchmark named:/i);
}
assert.ok(
  !path.actions.some((a) => /dOVE SCALP SERUM/i.test(a.text) && /named:/i.test(a.text)),
  "must not restate the typed name as the defect"
);
assert.ok(path.actions.some((a) => a.gainPct === 47 && /Filter 4/i.test(a.text)));

const ranked = computeImprovementPointValues(checks);
assert.ok(ranked.every((r) => Number(r.gainPct || r.pointValue) > 0));
assert.ok(!ranked.some((r) => /^Benchmark named:/i.test(r.text)));

const silent = buildPathToGo({
  advisoryChecks: {
    f1: { checkLabel: "Cleared", items: [] },
    f2: { checkLabel: "Cleared", items: [] },
    f3: { checkLabel: "Cleared", items: [] },
    f4: { checkLabel: "Cleared", items: [] },
  },
  sealedScore: { pct: 20, done: 3, total: 15 },
  scoreStatus: "current",
});
assert.notEqual(silent.kind, "go");
assert.ok(silent.actions.length >= 1);
assert.notEqual(silent.currentPct, silent.toGo.pct);
assert.ok(silent.toGo.pct > silent.currentPct);

console.log("PASS testPathToGoActionCopy — actionable gains, never same→same");

import assert from "node:assert/strict";
import { checkF3, checkF4 } from "../lib/filterChecks.js";
import { computeGoNoGo } from "../lib/goNoGo.js";
import { computeAllAdvisoryChecks } from "../lib/propositionScoring.js";

function cleared(n) {
  return {
    checkLabel: "Cleared",
    items: Array.from({ length: n }, () => ({ status: "done", text: "ok" })),
  };
}

const f4 = checkF4({}, { researchFailed: true });
assert.match(f4.items[0].text, /Research failed — retry/);
assert.equal(f4.checkLabel, "Evidence missing");

const failedResearch = computeGoNoGo({
  f1: cleared(5),
  f2: cleared(3),
  f3: cleared(1),
  f4,
});
assert.equal(failedResearch, "WATCH");

const notRun = computeGoNoGo({
  f1: cleared(5),
  f2: cleared(3),
  f3: cleared(1),
  f4: { checkLabel: "Not yet run", items: [] },
});
assert.equal(notRun, "WATCH");

const missing = computeGoNoGo({
  f1: cleared(5),
  f2: cleared(3),
  f3: cleared(1),
});
assert.equal(missing, "WATCH");

const f3 = checkF3({}, {}, { researchFailed: true });
assert.match(f3.items[0].text, /Research failed — retry/);
assert.equal(
  computeGoNoGo({ f1: cleared(5), f2: cleared(3), f3, f4: cleared(7) }),
  "WATCH"
);

const scored = await computeAllAdvisoryChecks({
  division: "Personal Care",
  category: "Hair oil",
  researchFindings: { f5: { researchFailed: true } },
});
assert.match(scored.f5.items[0].text, /Research failed — retry/);

console.log("PASS a filter that did not run cannot produce GO");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isNamedBenchmark, isVagueBenchmark } from "../lib/benchmarkName.js";
import { f1HasEnough } from "../lib/filterUnlock.js";

assert.equal(isNamedBenchmark(""), false);
assert.equal(isNamedBenchmark("   "), false);
assert.equal(isNamedBenchmark("0"), false);
assert.equal(isNamedBenchmark("ttt"), false);
assert.equal(isNamedBenchmark("no benchmark"), false);
assert.equal(isNamedBenchmark("No Benchmark"), false);
assert.equal(isNamedBenchmark("n/a"), false);
assert.equal(isNamedBenchmark("none"), false);
assert.equal(isVagueBenchmark("ttt"), true);

assert.equal(isNamedBenchmark("navratna"), true);
assert.equal(isNamedBenchmark("Parachute Advansed"), true);
assert.equal(isNamedBenchmark("ITC"), true);

assert.equal(
  f1HasEnough({
    declaredAttribute: "cooling",
    benchmark: "ttt",
    declaredGap: 5,
    growthRoute: "penetration",
    growthArgument: "argument",
  }),
  false,
  "vague benchmark must not count as Filter 1 complete"
);
assert.equal(
  f1HasEnough({
    declaredAttribute: "cooling",
    benchmark: "navratna",
    declaredGap: 5,
    growthRoute: "penetration",
    growthArgument: "argument",
  }),
  true
);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /isNamedBenchmark/);
assert.match(formSrc, /declaredGap/);
assert.match(formSrc, /inactiveHint/);

console.log("PASS Part 55 vague benchmark grays out declared gap");

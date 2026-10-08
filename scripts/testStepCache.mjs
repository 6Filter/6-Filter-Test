import assert from "node:assert/strict";
import { memoryStepStore, runResearchStep, stepsToRerun } from "../lib/researchStepCache.js";

const base = {
  idea: "herbal shampoo",
  name: "Meera",
  category: "shampoo",
  benchmark: "Clinic Plus",
  attributes: ["anti-dandruff"],
  division: "Personal Care",
  grammage: "100ml",
  cogs: 40,
  netMargin: 18,
  mrp: 99,
};

const afterBenchmark = { ...base, benchmark: "Head & Shoulders" };
const rerun = stepsToRerun(base, afterBenchmark);
assert.deepEqual(rerun.sort(), ["f1"]);

const same = stepsToRerun(base, { ...base });
assert.deepEqual(same, []);

const otherIdea = { ...base, idea: "talc" };
const shared = stepsToRerun(
  { idea: "herbal shampoo", category: "shampoo", division: "Personal Care" },
  { idea: "herbal shampoo", category: "shampoo", division: "Personal Care" }
);
assert.deepEqual(shared, []);
assert.ok(stepsToRerun(base, otherIdea).includes("f4"));
assert.ok(stepsToRerun(base, otherIdea).includes("f5"));
assert.ok(!stepsToRerun(base, otherIdea).includes("margin"));

const store = memoryStepStore();
let calls = 0;
await runResearchStep("f4", { idea: "herbal shampoo", category: "shampoo", image: "" }, async () => {
  calls += 1;
  return { rating: "low" };
}, { store });
await runResearchStep("f4", { idea: "herbal shampoo", category: "shampoo", image: "" }, async () => {
  calls += 1;
  return { rating: "low" };
}, { store });
assert.equal(calls, 1);

calls = 0;
await runResearchStep("f4", { idea: "herbal shampoo", category: "shampoo", image: "" }, async () => {
  calls += 1;
  return { rating: "changed" };
}, { store, forceFresh: true });
assert.equal(calls, 1);

console.log("testStepCache ok");

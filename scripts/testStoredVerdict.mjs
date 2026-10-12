import assert from "node:assert/strict";
import { emptyPropositionDoc, mergeProposition } from "../lib/propositionFields.js";
import { storedVerdictWithoutInputs } from "../lib/storedVerdict.js";

const stored = {
  id: "empty",
  goNoGo: { classification: "WATCH", score: { total: 4, pct: 40 } },
  f1: { forumVerdict: "", verdictNote: "" },
  f2: { forumVerdict: "", verdictNote: "" },
  f3: { forumVerdict: "", verdictNote: "" },
  f4: { forumVerdict: "", verdictNote: "" },
};
assert.equal(storedVerdictWithoutInputs(stored), true);
assert.equal(storedVerdictWithoutInputs(mergeProposition(stored)), true);
assert.equal(storedVerdictWithoutInputs(emptyPropositionDoc("blank")), false);
assert.equal(
  storedVerdictWithoutInputs(mergeProposition({ ...stored, f2: { cogsAtScale: 40 } })),
  false
);
console.log("PASS stored verdict notes when the filters are empty");
process.exit(0);

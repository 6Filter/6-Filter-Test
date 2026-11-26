/**
 * Screen again must return the newly sealed score on the wire even when research
 * steps still look incomplete — otherwise the client keeps a stale 61% WATCH.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { annotateEvaluationOnProposition } from "../lib/evaluationResponse.js";

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /if \(forceReseal\)/);
assert.match(apiSrc, /Screen again may seal a band while research steps still look incomplete/);
assert.match(apiSrc, /sealedGo\?\.output\?\.sealedAt/);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /withScreeningDifficulty\(doc, screeningDifficulty\)/);
assert.match(formSrc, /freshOutput/);
assert.match(formSrc, /levelChanged/);

const sealed = {
  classification: "GO",
  score: { pct: 97, done: 17, total: 18 },
  rationale: "force-reseal",
  output: {
    sealedAt: "2026-11-26T12:00:00.000Z",
    classification: "GO",
    score: { pct: 97, done: 17, total: 18 },
    rationale: "force-reseal",
    filters: { f1: { label: "Cleared", items: [] }, f2: { label: "Cleared", items: [] }, f3: { label: "Cleared", items: [] }, f4: { label: "Cleared", items: [] } },
  },
};

// Incomplete research steps, but a sealed band exists (Screen again path).
const doc = {
  name: "Polka Pop Plus",
  researchRunAt: "2026-11-26T00:00:00.000Z",
  researchFindings: {
    f1: { researchFailed: true },
    stepsExpected: ["F1", "F4"],
    stepsDone: [],
    stepsFailed: ["F1"],
  },
  goNoGo: sealed,
};
const annotated = annotateEvaluationOnProposition(doc);
assert.equal(
  annotated.evaluationState,
  "evaluated",
  "sealed output must read as evaluated even if research steps failed"
);
assert.equal(annotated.goNoGo?.output?.score?.pct, 97);
assert.equal(annotated.output?.score?.pct, 97);

console.log("PASS testForceResealKeepsSealedOutput", { pct: 97 });

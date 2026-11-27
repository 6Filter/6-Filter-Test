/**
 * Honest Submit hotfix — Level rescoring acceptance for the button feedback.
 * LV8: every press reacts within one second (visible status / error on both pages).
 * LV11: finished press shows changed vs unchanged with a plain reason (never silent).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { screenFeedbackMessage } from "../lib/screenFeedback.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const feedbackSrc = readFileSync(new URL("../lib/screenFeedback.js", import.meta.url), "utf8");

// --- LV8 ---
assert.match(
  formSrc,
  /GoNoGoResultPage[\s\S]*?error=\{/,
  "LV8: output page must pass error into GoNoGoResultPage"
);
assert.match(
  formSrc,
  /function GoNoGoResultPage\(\{[\s\S]*?\berror\b/,
  "LV8: GoNoGoResultPage must accept an error prop"
);
assert.match(
  formSrc,
  /data-testid=["']submit-feedback["']/,
  "LV8: a submit-feedback node must exist next to the action"
);
assert.match(
  formSrc,
  /Screening… this takes about 2 to 3 minutes/,
  "LV8: running copy must appear within the press path"
);
assert.match(
  feedbackSrc,
  /Not started:/,
  "LV8: blocked presses must say Not started"
);
assert.match(
  formSrc,
  /screenFeedbackMessage\(\{\s*outcome:\s*["']blocked["']/,
  "LV8: form must call screenFeedbackMessage for blocked presses"
);
// No silent early return on busy without a message when fromPending or form.
assert.match(
  formSrc,
  /if \(saving \|\| f3Filling \|\| f4Reassessing \|\| marginElasticityLoading\) \{[\s\S]{0,280}setSubmitFeedback/,
  "LV8: busy re-press must set a visible message (not a silent return)"
);

// --- LV11 ---
const changed = screenFeedbackMessage({
  outcome: "changed",
  screenedAt: "2026-11-27T02:30:00.000Z",
  level: 1,
  fromPct: 61,
  toPct: 97,
  fromVerdict: "WATCH",
  toVerdict: "GO",
});
assert.match(changed, /Screened at/i);
assert.match(changed, /Level 1/);
assert.match(changed, /61%.*97%/);
assert.match(changed, /WATCH.*GO/);

const unchanged = screenFeedbackMessage({
  outcome: "unchanged",
  screenedAt: "2026-11-27T02:30:00.000Z",
  level: 1,
  reasonCode: "same_inputs_and_level",
  fromPct: 61,
  toPct: 61,
  fromVerdict: "WATCH",
  toVerdict: "WATCH",
});
assert.match(unchanged, /Nothing changed because/i);
assert.match(unchanged, /inputs and the level are the same/i);
assert.doesNotMatch(unchanged, /Screen again/i);

console.log("PASS testLevelRescoring LV8 LV11");

/**
 * Part 150b — wording fixed at the display layer (the scoring-locked copy files stay untouched).
 *  - no instruction ever says "replace X with X" (X typed as a placeholder, or already the suggestion);
 *  - advice never sends the person to a box that is not on the form (Target consumer is hidden).
 * Browser-safe, pure.
 */
import { circularFreeCopy } from "./answerGuard.js";

const AUDIENCE = "the audience described in your idea";

/** Replace advice that names the hidden "Target consumer" box with the idea description. */
export function audienceCopy(text) {
  if (typeof text !== "string" || !text) return text;
  return text
    .replace(/\bin (?:the )?Target consumer\b/gi, () => "in your idea description")
    .replace(/\bthe target consumer\b/gi, () => AUDIENCE)
    .replace(/\bTarget consumer\b/g, () => "The audience described in your idea");
}

/** The text as shown on the page, for the given idea. */
export function displayCopy(text, doc) {
  if (typeof text !== "string" || !text) return text;
  const f1 = doc?.f1 || {};
  return audienceCopy(circularFreeCopy(text, f1.benchmark, f1.benchmarkResearchName));
}

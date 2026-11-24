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

const WHAT_TO_ENTER = {
  "gap derivation":
    "Write a full sentence on what you will beat the benchmark on, in words a shopper would notice. Example: stays cold for two hours longer than the named drink. The word none does not count in this box.",
  "parity exceptions":
    "Name the attributes where you are only equal to the benchmark, or type none if you are not giving anything up. This line did not have a specific answer the screen could score.",
  "growth argument":
    "Write one paragraph on why this will grow, with a number that can be checked, such as households, trial, or a cited category fact.",
};

const FIELD_FOR_LABEL = {
  "gap derivation": "gapDerivation",
  "parity exceptions": "parityExceptions",
  "growth argument": "growthArgument",
};

function clipQuote(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  return `${text.slice(0, 179)}…`;
}

/** A blank box, or a phrase that only says there is nothing to score. */
function isEmptyClaim(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return true;
  return /^(none|nil|null|n a|na|nothing|nope|not applicable|no gap|no derivation|no exception|no exceptions|no argument|tbd|tba)$/.test(
    text
  );
}

function explainEnteredClaim(label, level, doc) {
  const f1 = doc?.f1 || {};
  const entered = String(f1[FIELD_FOR_LABEL[label]] || "").trim();
  if (isEmptyClaim(entered)) return "";
  const quote = clipQuote(entered);
  const bench = String(f1.benchmarkResearchName || f1.benchmark || "").trim();
  const versus = bench ? ` of ${bench}` : "";
  if (label === "gap derivation") {
    if (level === "none") {
      return `You entered: “${quote}”. The screen did not count this as a shopper-visible beat${versus}. Name the one difference a shopper would notice, such as no added sugar versus that product.`;
    }
    if (level === "weak") {
      return `You entered: “${quote}”. That was too vague to count as a strong claim. Name one checkable difference a shopper would notice.`;
    }
    return `You entered: “${quote}”. Add one checkable fact so this can score as strong.`;
  }
  if (label === "parity exceptions") {
    if (level === "none") {
      return `You entered: “${quote}”. Name the attributes where you are only equal to the benchmark, or type none if you are not giving anything up.`;
    }
    return `You entered: “${quote}”. ${level === "weak" ? "That was too vague to count as a strong claim." : "Add one checkable fact so this can score as strong."}`;
  }
  if (level === "none") {
    return `You entered: “${quote}”. Add a number that can be checked, such as households, trial, or a cited category fact.`;
  }
  return `You entered: “${quote}”. ${level === "weak" ? "That was too vague to count as a strong claim." : "Add one checkable fact so this can score as strong."}`;
}

function explainBareLevel(text, doc) {
  const line = String(text || "").trim();
  const claim = line.match(/^(Gap derivation|Parity exceptions|Growth argument)\s+(none|weak|adequate)$/i);
  if (claim) {
    const label = claim[1].toLowerCase();
    const level = claim[2].toLowerCase();
    const entered = explainEnteredClaim(label, level, doc);
    if (entered) return entered;
    const help = WHAT_TO_ENTER[label];
    if (level === "none") return help;
    if (level === "weak") return `${help} What you entered was too vague to count as a strong claim.`;
    return `${help} Add one checkable fact so this can score as strong.`;
  }
  const route = line.match(/^Growth route "([^"]+)" — (none|weak)$/i);
  if (route) {
    return `You chose ${route[1]}. Say who the buyer is and why that route fits: penetration means more of today's buyers, frequency means they buy more often, new market means a new set of buyers.`;
  }
  if (/^Growth route mismatch/i.test(line)) {
    return `${line}. Set the route to the one that matches the buyer: penetration means more of today's buyers, frequency means they buy more often, new market means a new set of buyers.`;
  }
  return line;
}

/** The text as shown on the page, for the given idea. */
export function displayCopy(text, doc) {
  if (typeof text !== "string" || !text) return text;
  const f1 = doc?.f1 || {};
  return explainBareLevel(audienceCopy(circularFreeCopy(text, f1.benchmark, f1.benchmarkResearchName)), doc);
}

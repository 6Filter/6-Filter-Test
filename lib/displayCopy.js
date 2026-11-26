/**
 * Part 150b — wording fixed at the display layer (the scoring-locked copy files stay untouched).
 *  - no instruction ever says "replace X with X" (X typed as a placeholder, or already the suggestion);
 *  - advice never sends the person to a box that is not on the form (Target consumer is hidden).
 * Browser-safe, pure.
 */
import { circularFreeCopy } from "./answerGuard.js";
import {
  claimTextForCredit,
  f4AnswerPasses,
  f4ClearedItemText,
  f4ContradictsSuggestion,
  f4Improvement,
  f4ViewClearsPoint,
  isPlaceholderClaim,
  marginClearsFloor,
} from "./enteredFieldCredit.js";
import { DIMENSION_LABELS, TECH_SHIFT_DIMENSIONS } from "./techShiftRisk.js";

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
    "Name the attributes where you are only equal to the benchmark. One-word answers such as no, none or yes do not count in this box.",
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

function creditedClaim(label, doc) {
  const key = FIELD_FOR_LABEL[label];
  if (!key) return "";
  return claimTextForCredit(doc, { key, path: `f1.${key}` });
}

function explainEnteredClaim(label, _level, doc) {
  const entered = creditedClaim(label, doc);
  if (!entered) return "";
  const quote = clipQuote(entered);
  const fromBox = !isPlaceholderClaim(doc?.f1?.[FIELD_FOR_LABEL[label]]);
  const lead = fromBox ? `You entered: “${quote}”.` : `The suggestion for this box is: “${quote}”.`;
  return `${lead} This counts for this box and is not marked down.`;
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

function softenEnteredCredit(line, doc) {
  const text = String(line || "");
  if (/growth argument/i.test(text) && /contradict/i.test(text) && creditedClaim("growth argument", doc)) {
    return "What you entered in the growth argument counts. It is not marked down.";
  }
  if (/parity/i.test(text) && /contradict/i.test(text) && creditedClaim("parity exceptions", doc)) {
    return "What you entered in parity exceptions counts. It is not marked down.";
  }
  if (/gap derivation/i.test(text) && /contradict/i.test(text) && creditedClaim("gap derivation", doc)) {
    return "What you entered in the gap derivation counts. It is not marked down.";
  }
  if (marginClearsFloor(doc) && /verified evidence|web check contradicts|GST rate .+ marked down/i.test(text)) {
    return "COGS and net margin are entered and the margin clears the division minimum. Filter 2 does not mark this down and does not ask for more evidence.";
  }
  for (const key of TECH_SHIFT_DIMENSIONS) {
    const label = DIMENSION_LABELS[key] || key;
    if (!text.toLowerCase().includes(String(label).toLowerCase())) continue;
    if (f4ViewClearsPoint(doc, key)) return f4ClearedItemText(doc, key);
    if (f4AnswerPasses(doc, key)) return f4ClearedItemText(doc, key);
    if (f4ContradictsSuggestion(doc, key)) return f4ClearedItemText(doc, key);
    const tip = f4Improvement(doc, key);
    if (tip && /mitigation|clear the open/i.test(text)) return tip;
    // Never surface Low/Medium/High risk labels on the output path.
    return text.replace(/\b(Low|Medium|High)\s+risk\s*[—\-–:]?\s*/gi, "").replace(/\s{2,}/g, " ").trim();
  }
  return text;
}

/** The text as shown on the page, for the given idea. */
export function displayCopy(text, doc) {
  if (typeof text !== "string" || !text) return text;
  const f1 = doc?.f1 || {};
  const explained = explainBareLevel(audienceCopy(circularFreeCopy(text, f1.benchmark, f1.benchmarkResearchName)), doc);
  return softenEnteredCredit(explained, doc);
}

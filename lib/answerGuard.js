/**
 * Part 150 — placeholder answers, circular suggestions, and one honest line for the Submit bar.
 *
 * Browser-safe: no I/O, no LLM, no scoring. Three helpers:
 *  - answerProblem(field, text): the message when a short phrase only says "there is nothing", else null.
 *  - sanitizeSuggestion({ field, suggested, current }): the suggestion to show, or null when it is a placeholder
 *    or is the text already in the box.
 *  - submitBarSummary({ requiredEmpty, invalid, unconfirmed }): the one line under the form.
 *
 * Only a SHORT phrase (at most MAX_PLACEHOLDER_WORDS words) that is ENTIRELY a "nothing here" statement is refused.
 * A real sentence that merely contains "no" or "not available" is never refused.
 */

import { reviewInputs } from "./inputReview.js";

export const MAX_PLACEHOLDER_WORDS = 8;
/** How much of a refused phrase the message quotes back. */
const SHOWN_CHARS_MAX = 64;
const SHOWN_ELLIPSIS = 4;

/** The boxes whose text must be a real answer. */
export const GUARDED_FIELDS = Object.freeze([
  "benchmark",
  "declaredAttribute",
  "gapDerivation",
  "growthArgument",
  "parityExceptions",
]);

const FIELD_LABEL = Object.freeze({
  benchmark: "Benchmark",
  declaredAttribute: "Declared attribute",
  gapDerivation: "Gap derivation",
  growthArgument: "Growth argument",
  parityExceptions: "Parity exceptions",
});

/** "f1.gapDerivation" and "gapDerivation" both name the same box. */
function fieldKeyOf(field) {
  const s = String(field ?? "").trim();
  const i = s.lastIndexOf(".");
  return i < 0 ? s : s.slice(i + 1);
}

/** Lower-case, straight quotes, no punctuation, single spaces. "N/A" becomes "n a". */
export function normalizeAnswer(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201a\u201b\u2032`]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/'/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TAIL = "(?: (?:available|found|identified|known|exists?|yet|currently|right now|now|today|at present|at the moment|as of now|for now|so far|to share|at this time|in the market))*";
const THING = "(?:benchmark|competitor|competition|competitors|alternative|comparable|reference|rival|brand|product|equivalent)";
const QUAL = "(?:(?:direct|known|clear|obvious|real|suitable|relevant|close|closest|current|existing|specific|good|similar|major|main|single|strong|natural|identifiable|valid) )*";

const NOT_STATE = "(?:applicable|available|known|found|identified|decided|determined|defined|given|provided|specified|named|present|exist|exists|existing|clear)";
const UN_STATE = "(?:unavailable|unknown|undefined|unidentified|unnamed|unspecified|undecided|nonexistent|non existent)";
const WHEN = "(?:(?:currently|presently|right now|at present|as of now|for now|yet|so far) )*";

/** Whole-phrase patterns, tested on normalizeAnswer(text). */
const PLACEHOLDER_PATTERNS = Object.freeze([
  // "none", "nil", "n/a", "unknown", "tbd", "nothing", "test" ...
  new RegExp(`^(?:none|nil|nill|null|undefined|nothing|nope|n a|na|tbd|tba|tbc|unknown|unavailable|unspecified|blank|empty|test|testing|dummy|placeholder|sample|xxx+|pending|wip|later|nothing here|none here|none yet|nothing yet|not sure|dont know|do not know|no idea|no clue|idk)${TAIL}$`),
  // "no benchmark available currently", "no direct competitor found", "there is no benchmark", "we have no competitor"
  new RegExp(`^(?:(?:there is|there are|there isnt|there arent|we have|we dont have|i have|i dont have|currently there is|currently there are) )?(?:no|not any|nothing|zero|without) ${QUAL}${THING}s?${TAIL}$`),
  new RegExp(`^(?:there is|there are|we have|currently) (?:no|not any|nothing) ${QUAL}${THING}s?${TAIL}$`),
  // "not applicable", "not available", "not known yet", "not decided"
  new RegExp(`^not (?:applicable|available|known|sure|decided|determined|identified|found|provided|given|specified|defined|clear|relevant|required|needed|yet known|yet available|yet decided|yet identified|yet defined|yet determined)${TAIL}$`),
  new RegExp(`^(?:not yet|nothing yet|as yet) (?:known|decided|available|identified|defined|determined|done|found)${TAIL}$`),
  // "currently not available", "currently unavailable", "benchmark not available", "competitor does not exist"
  new RegExp(`^${WHEN}(?:not ${NOT_STATE}|${UN_STATE})${TAIL}$`),
  new RegExp(`^(?:the |a |any )?${QUAL}${THING}s?(?: is| are| was| were)? ${WHEN}(?:(?:not|isnt|arent|wasnt|werent) ${NOT_STATE}|${UN_STATE}|(?:does not|do not|doesnt|dont) exist)${TAIL}$`),
  // "no data", "no information", "no answer", "no gap", "no differentiation"
  new RegExp(`^no (?:data|information|info|answer|input|idea|value|values|detail|details|comment|comments|entry|gap|differentiation|difference|argument|derivation|attribute|benefit|benefits|growth|reason|response|text|content|exceptions?|exception|evidence|source|sources)${TAIL}$`),
  // "to be decided", "will add later", "coming soon"
  /^(?:to be (?:decided|determined|confirmed|filled|added|announced|defined|done|updated|finalised|finalized|shared)|will (?:add|fill|update|share|decide|confirm|provide) (?:it |this )?(?:later|soon)|coming soon|work in progress|under discussion|under review|not available currently|not applicable currently)$/,
  // "nothing found", "none found", "cannot find any", "couldnt find one"
  new RegExp(`^(?:nothing|none|no one|nobody|no match|no matches|no results?)${TAIL}$`),
  new RegExp(`^(?:cannot|cant|could not|couldnt|unable to|did not|didnt|have not|havent|was not able to|wasnt able to) (?:find|name|identify|think of|locate|get|come up with)(?: (?:any|one|a|an|the))? ?${QUAL}${THING}?s?${TAIL}$`),
]);

/** What parity may say instead of an exception: it is a real answer there ("we lose nowhere"). */
const PARITY_NONE_PATTERN = /^(?:none|nil|nill|nothing|n a|na|no exceptions?|no exception at all|no exceptions at all)(?: at (?:all|present)| currently| for now| so far| known)?$/;

/** True when `text` is a short phrase that only says there is nothing to say. */
export function isPlaceholderAnswer(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  const norm = normalizeAnswer(raw);
  // Only punctuation or dashes ("-", "...", "—") is nothing as well.
  if (!norm) return true;
  const words = norm.split(" ").filter(Boolean);
  if (words.length > MAX_PLACEHOLDER_WORDS) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(norm));
}

function parityNone(text) {
  return PARITY_NONE_PATTERN.test(normalizeAnswer(text));
}

/**
 * The message to show when `text` is not a real answer for `field`, or null when it is fine (or the box is empty —
 * emptiness is the Required check's job).
 */
export function answerProblem(field, text) {
  const key = fieldKeyOf(field);
  if (!GUARDED_FIELDS.includes(key)) return null;
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  if (key === "parityExceptions" && parityNone(raw)) return null;
  if (!isPlaceholderAnswer(raw)) return null;
  const label = FIELD_LABEL[key] || key;
  const shown = raw.length > SHOWN_CHARS_MAX ? `${raw.slice(0, SHOWN_CHARS_MAX - SHOWN_ELLIPSIS)}…` : raw;
  if (key === "parityExceptions") {
    return `${label}: “${shown}” is not an answer. Name the attributes we may lose on, or write none.`;
  }
  return `${label}: “${shown}” is not an answer. Write a sentence. “None” is accepted only for parity.`;
}

function sameText(a, b) {
  return normalizeAnswer(a) === normalizeAnswer(b) && normalizeAnswer(a) !== "";
}

/**
 * The suggestion to offer for `field`, or null. Never a placeholder, never what the box already holds.
 * Numbers and other non-text values are only compared with the current value.
 */
export function sanitizeSuggestion({ field, suggested, current } = {}) {
  if (suggested == null) return null;
  if (typeof suggested !== "string") {
    if (typeof suggested === "number" && Number.isFinite(suggested)) {
      return current != null && String(current).trim() !== "" && Number(current) === suggested ? null : suggested;
    }
    return suggested;
  }
  const text = suggested.trim();
  if (!text) return null;
  const key = fieldKeyOf(field);
  if (GUARDED_FIELDS.includes(key) && key !== "parityExceptions" && isPlaceholderAnswer(text)) return null;
  if (key === "parityExceptions" && !parityNone(text) && isPlaceholderAnswer(text)) return null;
  if (current != null && sameText(text, current)) return null;
  return text;
}

// ───────────────────────────── the Submit bar ─────────────────────────────

const NAME_LIST_MAX = 3;

function nameOf(item) {
  if (item == null) return "";
  if (typeof item === "string") return item.trim();
  return String(item.label || item.field || item.path || "").trim();
}

function names(items) {
  const list = (Array.isArray(items) ? items : []).map(nameOf).filter(Boolean);
  const shown = list.slice(0, NAME_LIST_MAX).join(", ");
  const more = list.length - NAME_LIST_MAX;
  return more > 0 ? `${shown} and ${more} more` : shown;
}

function count(items) {
  return (Array.isArray(items) ? items : []).length;
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/**
 * One line from the same three lists the "Why can't I submit?" panel uses:
 *  - requiredEmpty: required boxes still empty
 *  - invalid: answers that are refused (placeholders, gibberish, out-of-range numbers)
 *  - unconfirmed: AI-written texts nobody has edited or confirmed
 * "Ready to submit." only when all three are empty. With only empty required boxes the line is exactly
 * "N required boxes left before you can submit.".
 */
export function submitBarSummary({ requiredEmpty = [], invalid = [], unconfirmed = [] } = {}) {
  const r = count(requiredEmpty);
  const i = count(invalid);
  const u = count(unconfirmed);
  if (!r && !i && !u) return "Ready to submit.";
  const parts = [];
  if (r) parts.push(`${r} required ${plural(r, "box", "boxes")} left before you can submit.`);
  if (i) parts.push(`${i} ${plural(i, "answer", "answers")} to fix before you can submit: ${names(invalid)}.`);
  if (u) parts.push(`${u} AI-written ${plural(u, "text", "texts")} to confirm or edit: ${names(unconfirmed)}.`);
  return parts.join(" ");
}

// ───────────────────── the review with the placeholder guard ─────────────────────

/**
 * reviewInputs() plus the placeholder check. The scoring-locked review stays untouched; this wrapper is what the
 * form, the Submit gate and the research gate call. A refused placeholder replaces the generic message for that box.
 */
export function reviewInputsGuarded(doc) {
  const review = reviewInputs(doc);
  const f1 = doc?.f1 || {};
  const fields = Array.isArray(review?.fields) ? [...review.fields] : [];
  for (const key of GUARDED_FIELDS) {
    const message = answerProblem(key, f1[key]);
    if (!message) continue;
    const issue = { field: key, status: "invalid", code: `${key.toUpperCase()}_PLACEHOLDER`, message, suggestion: null };
    const at = fields.findIndex((f) => f?.field === key);
    if (at >= 0) fields[at] = { ...fields[at], ...issue };
    else fields.push(issue);
  }
  return { ...review, fields, blocking: fields.some((f) => f?.status === "invalid" && f?.blocking !== false) || Boolean(review?.blocking) };
}

// ───────────────────── improvement wording that never goes in circles ─────────────────────

export const PLAIN_BENCHMARK_INSTRUCTION = "Name the closest competitor you know in the same category and pack size";

/** True when an instruction asks the person to replace the benchmark with what they already typed (or a placeholder). */
export function instructionIsCircular(instruction, typedBenchmark) {
  const text = String(instruction ?? "");
  const typed = String(typedBenchmark ?? "").trim();
  if (!text) return false;
  const norm = normalizeAnswer(text);
  if (typed) {
    const typedNorm = normalizeAnswer(typed);
    if (isPlaceholderAnswer(typed) && typedNorm && norm.includes(typedNorm)) return true;
    if (typedNorm && norm.includes(typedNorm) && /for example|e g /.test(norm)) return true;
    const m = text.match(/replace\s+["“'‘]?(.+?)["”'’]?\s+with\s+["“'‘]?(.+?)["”'’]?(?:\s+(?:in|for|or)\b|\s*[.:;,—–-]|$)/i);
    if (m && normalizeAnswer(m[1]) && normalizeAnswer(m[1]) === normalizeAnswer(m[2])) return true;
  }
  return false;
}

/** The instruction as shown: the plain one when the original would say "replace X with X". */
export function circularFreeCopy(instruction, ...typedBenchmarks) {
  if (typeof instruction !== "string" || !instruction) return instruction;
  const typed = typedBenchmarks.filter((t) => String(t ?? "").trim());
  if (!typed.length) return instruction;
  const circular = (s) => typed.some((t) => instructionIsCircular(s, t));
  // A paragraph: replace only the circular sentence(s), keep the rest.
  const sentences = instruction.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 1) {
    if (!sentences.some(circular)) return instruction;
    const kept = sentences.map((x) => (circular(x) ? `${PLAIN_BENCHMARK_INSTRUCTION}.` : x));
    return [...new Set(kept)].join(" ");
  }
  return circular(instruction) ? PLAIN_BENCHMARK_INSTRUCTION : instruction;
}

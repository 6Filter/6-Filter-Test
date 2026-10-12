/**
 * Mechanical check on a generated filter paragraph. Failure keeps the paragraph
 * out of the saved result. The reason is a label, never the paragraph text.
 */
import { analysisCheckItems } from "./filterChecks.js";
import { CK_BRANDS } from "./ckBrands.js";

const STOP_WORDS = new Set(
  [
    "a", "an", "the", "this", "that", "these", "those", "and", "or", "of", "to", "for", "in", "on", "at", "by", "with",
    "from", "into", "over", "after", "before", "than", "then", "its", "it", "is", "are", "was", "be", "as", "if",
    "not", "no", "yes", "but", "so", "we", "you", "they", "their", "our",
    "filter", "filters", "india", "indian", "mrp", "net", "low", "medium", "high", "category", "quick", "year",
    "evidence", "public", "nielsen", "kantar", "cleared", "below", "above", "watch", "pack", "lab", "consumer",
    "growth", "declared", "benchmark", "attribute", "margin", "range", "safe", "current", "response", "functional",
    "consumption", "manufacturing", "user", "habit", "adjacent", "purchase", "regulatory", "technology", "structural",
    "volume", "price", "priced", "floor", "within", "missing", "verified", "named", "commerce", "terms", "assumption",
    "recorded", "argument", "route", "size", "risk", "shift", "core", "stability", "context", "disruption", "potential",
    "threat", "frequency", "min", "max", "gst", "cogs", "band", "ceiling", "premium", "discount", "average", "today",
    "still", "needs", "need", "what", "when", "where", "which", "while", "because", "until", "already", "only",
    "nothing", "outstanding", "needed", "incomplete", "analytical", "failure", "paperwork", "secondary",
    "implies", "risks", "survives", "change", "found", "exposure", "material", "form", "function",
    "confirmed", "yet", "record", "loss", "past", "number", "non", "negotiable", "has", "have", "had",
    "not", "been", "run", "unlocks", "after", "manager", "approved", "market", "research", "proof",
  ].map((word) => word.toLowerCase())
);

function itemTexts(checks = {}) {
  const out = [];
  for (const key of ["f1", "f2", "f3", "f4"]) {
    for (const item of analysisCheckItems(checks[key]?.items)) {
      const text = String(item?.text || "").trim();
      if (text) out.push(text);
    }
  }
  return out;
}

export function benchmarkFromChecks(checks = {}) {
  for (const text of itemTexts(checks)) {
    const named = text.match(/Benchmark named \(([^)]+)\)/i) || text.match(/Benchmark named:\s*([^—–.\n]+)/i);
    if (named) return named[1].trim();
    const verified = text.match(/Benchmark verified:\s*([^—–-]+)/i);
    if (verified) return verified[1].trim();
  }
  return "";
}

function numbersOf(pattern, text) {
  return [...String(text || "").matchAll(pattern)].map((match) => Number(String(match[1]).replace(/,/g, "")));
}

const RUPEE = /₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g;
const PERCENT = /(?<![\d.])([0-9]+(?:\.[0-9]+)?)\s*%/g;

function near(value, allowed) {
  if (!Number.isFinite(value)) return false;
  return allowed.some((candidate) => {
    if (!Number.isFinite(candidate)) return false;
    if (value === candidate) return true;
    if (Math.round(value) === Math.round(candidate)) return true;
    return Math.abs(value - candidate) <= 0.5;
  });
}

export function numbersInChecks(checks) {
  return allowedNumbers(checks);
}

function allowedNumbers(checks) {
  const blob = itemTexts(checks).join("\n");
  return [...numbersOf(RUPEE, blob), ...numbersOf(PERCENT, blob)];
}

function brandAllowList({ benchmark = "", competitors = [] } = {}) {
  const names = [benchmark, ...competitors];
  for (const brand of CK_BRANDS) {
    names.push(brand.name, ...(brand.aliases || []), ...(brand.lines || []));
  }
  return names
    .map((name) => String(name || "").trim().toLowerCase())
    .filter((name) => name.length >= 3);
}

function foreignBrands(text, allow, corpus) {
  const found = [];
  const haystack = String(corpus || "").toLowerCase();
  const tokens = String(text || "").match(/[A-Za-z][A-Za-z'’.-]{2,}/g) || [];
  for (const token of tokens) {
    const lower = token.replace(/^[.'’-]+|[.'’-]+$/g, "").toLowerCase();
    const parts = lower.split(/[-'’.]/).filter(Boolean);
    if (parts.every((part) => STOP_WORDS.has(part))) continue;
    if (token[0] !== token[0].toUpperCase()) continue;
    if (haystack.includes(lower)) continue;
    if (allow.some((name) => name === lower || name.includes(lower) || lower.includes(name))) continue;
    found.push(token);
  }
  return found;
}

function contradicts(label, text) {
  const body = String(text || "");
  const status = String(label || "");
  if (status === "Cleared" && /below the floor|not verified|evidence missing/i.test(body)) return true;
  if (status === "Below floor" && /clears the floor|within the safe/i.test(body)) return true;
  if (status === "Evidence missing" && /\bcleared\b/i.test(body)) return true;
  return false;
}

export function deterministicFilterParagraph(check = {}) {
  const bits = analysisCheckItems(check.items)
    .map((item) => String(item?.text || "").trim())
    .filter(Boolean);
  if (!bits.length) return "No scored evidence is recorded on this filter.";
  return bits.join(" ");
}

export function validateNarrativeParagraph(text, { checks = {}, check = {}, competitors = [] } = {}) {
  const reasons = [];
  const body = String(text || "").trim();
  if (!body) reasons.push("empty");
  const benchmark = benchmarkFromChecks({ f1: check });
  const allowed = allowedNumbers(checks);
  let token = "";
  let checkValue = "";
  if (benchmark && !body.toLowerCase().includes(benchmark.toLowerCase())) {
    reasons.push("missing-benchmark");
    token = benchmark;
    checkValue = benchmark;
  }
  const strangers = foreignBrands(body, brandAllowList({ benchmark, competitors }), itemTexts(checks).join("\n"));
  if (strangers.length) {
    reasons.push("foreign-brand");
    token = String(strangers[0]).replace(/^[.'’-]+|[.'’-]+$/g, "");
    checkValue = benchmark || "none";
  }
  const rupees = numbersOf(RUPEE, body);
  const percents = numbersOf(PERCENT, body);
  for (const value of rupees) {
    if (near(value, allowed)) continue;
    reasons.push("unknown-rupee");
    if (!token) {
      token = String(value);
      checkValue = nearestCheckValue(value, allowed);
    }
  }
  for (const value of percents) {
    if (near(value, allowed)) continue;
    reasons.push("unknown-percent");
    if (!token) {
      token = String(value);
      checkValue = nearestCheckValue(value, allowed);
    }
  }
  if (contradicts(check.checkLabel, body)) {
    reasons.push("contradicts-status");
    if (!token) {
      token = String(check.checkLabel || "");
      checkValue = String(check.checkLabel || "");
    }
  }
  if (!body && !token) token = "empty";
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)], token, checkValue };
}

function nearestCheckValue(value, allowed) {
  const nums = allowed.filter((candidate) => Number.isFinite(candidate));
  if (!nums.length) return "none";
  let best = nums[0];
  for (const candidate of nums) {
    if (Math.abs(candidate - value) < Math.abs(best - value)) best = candidate;
  }
  return String(best);
}

/**
 * Mechanical check on a generated filter paragraph. Failure keeps the paragraph
 * out of the saved result. The reason is a label, never the paragraph text.
 */
import { analysisCheckItems } from "./filterChecks.js";
import { CK_BRANDS } from "./ckBrands.js";
import { FMCG_BRANDS } from "./fmcgBrands.js";

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

const RUPEE = /(?:₹|Rs\.?)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/gi;
const PERCENT = /(?<![\d.])([0-9]+(?:\.[0-9]+)?)\s*%/g;
const WORD_STOP = new Set(["a", "an", "the", "of", "and", "for", "with", "after", "before", "on", "in", "to", "or"]);

export function distinctiveWords(name) {
  return String(name || "")
    .split(/[^A-Za-z0-9’']+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !WORD_STOP.has(word.toLowerCase()));
}

export function benchmarkMatches(paragraph, benchmark) {
  const words = distinctiveWords(benchmark);
  if (!words.length) return true;
  const body = String(paragraph || "").toLowerCase();
  const head = words[0].toLowerCase();
  if (body.includes(head)) return true;
  const hit = words.filter((word) => body.includes(word.toLowerCase())).length;
  return hit / words.length >= 0.6;
}

function withinTen(value, candidate) {
  if (!Number.isFinite(candidate)) return false;
  if (candidate === 0) return value === 0;
  return Math.abs(value - candidate) / Math.abs(candidate) <= 0.1;
}

function isRounded(value, candidate) {
  if (!Number.isFinite(candidate)) return false;
  const nearest10 = Math.round(candidate / 10) * 10;
  const nearest100 = Math.round(candidate / 100) * 100;
  return Math.abs(value - nearest10) <= 0.5 || Math.abs(value - nearest100) <= 0.5;
}

function derivedFrom(value, allowed) {
  const nums = allowed.filter((candidate) => Number.isFinite(candidate));
  for (let i = 0; i < nums.length; i += 1) {
    for (let j = 0; j < nums.length; j += 1) {
      if (i === j) continue;
      const candidates = [nums[i] + nums[j], Math.abs(nums[i] - nums[j])];
      if (nums[j] !== 0) {
        candidates.push(nums[i] / nums[j], Math.abs((100 * (nums[i] - nums[j])) / nums[j]), Math.abs((100 * nums[i]) / nums[j]));
      }
      if (candidates.some((candidate) => Math.abs(candidate - value) <= 0.5 || withinTen(value, candidate))) return true;
    }
  }
  return false;
}

export function acceptsFigure(value, checks) {
  return figureAccepted(Number(value), allowedNumbers(checks));
}

function figureAccepted(value, allowed) {
  if (allowed.some((candidate) => withinTen(value, candidate) || isRounded(value, candidate))) return true;
  return derivedFrom(value, allowed);
}

export function numbersInChecks(checks) {
  return allowedNumbers(checks);
}

function allowedNumbers(checks) {
  const blob = itemTexts(checks).join("\n");
  return [...numbersOf(RUPEE, blob), ...numbersOf(PERCENT, blob)];
}

export function staticBrandUniverse() {
  const names = [];
  for (const brand of CK_BRANDS) names.push(brand.name, ...(brand.aliases || []));
  names.push(...FMCG_BRANDS);
  return [...new Set(names.map((name) => String(name || "").trim()).filter((name) => name.length >= 3))];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsBrand(text, brand) {
  const pattern = new RegExp(`(?:^|[^A-Za-z0-9])(${escapeRegExp(brand)})(?=$|[^A-Za-z0-9])`, "gi");
  let match = pattern.exec(String(text || ""));
  while (match) {
    if (match[1][0] === match[1][0].toUpperCase()) return match[1];
    match = pattern.exec(String(text || ""));
  }
  return "";
}

export function ideaOwnsBrand(name, benchmark, competitors = []) {
  return brandIsThisIdea(name, benchmark, competitors);
}

function brandIsThisIdea(name, benchmark, competitors) {
  const allowed = [benchmark, ...competitors].map((item) => String(item || "").trim()).filter(Boolean);
  return allowed.some((item) => benchmarkMatches(name, item) || benchmarkMatches(item, name));
}

function foreignBrands(text, universe, benchmark, competitors) {
  const names = [...(Array.isArray(universe) ? universe : staticBrandUniverse())].sort((a, b) => b.length - a.length);
  const found = [];
  for (const name of names) {
    const token = mentionsBrand(text, name);
    if (!token) continue;
    if (brandIsThisIdea(name, benchmark, competitors)) continue;
    found.push(token);
    break;
  }
  return found;
}

function contradicts(label, text) {
  const body = String(text || "");
  const status = String(label || "");
  if (status === "Cleared" && /below the floor|not verified|evidence missing/i.test(body)) return true;
  if (status === "Below floor" && /clears the floor|within the safe|\bcleared\b/i.test(body) && !/\bnot\s+cleared\b/i.test(body)) return true;
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

export function validateNarrativeParagraph(text, { checks = {}, check = {}, competitors = [], brandUniverse } = {}) {
  const reasons = [];
  const body = String(text || "").trim();
  if (!body) reasons.push("empty");
  const benchmark = benchmarkFromChecks({ f1: check });
  const allowed = allowedNumbers(checks);
  let token = "";
  let checkValue = "";
  if (benchmark && !benchmarkMatches(body, benchmark)) {
    reasons.push("missing-benchmark");
    token = benchmark;
    checkValue = benchmark;
  }
  const strangers = foreignBrands(body, brandUniverse, benchmark, competitors);
  if (strangers.length) {
    reasons.push("foreign-brand");
    token = String(strangers[0]).replace(/^[.'’-]+|[.'’-]+$/g, "");
    checkValue = benchmark || "none";
  }
  const rupees = numbersOf(RUPEE, body);
  const percents = numbersOf(PERCENT, body);
  for (const value of rupees) {
    if (figureAccepted(value, allowed)) continue;
    reasons.push("unknown-rupee");
    if (!token) {
      token = String(value);
      checkValue = nearestCheckValue(value, allowed);
    }
  }
  for (const value of percents) {
    if (figureAccepted(value, allowed)) continue;
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

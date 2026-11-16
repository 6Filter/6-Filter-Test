/**
 * Part 132 — deterministic input review. Browser-safe: no I/O, no logging, no LLM.
 */
import {
  DECLARED_GAP_MAX,
  GST_STANDARD_RATES,
  IDEA_DESCRIPTION_MIN_CHARS,
  MRP_IMPLIED_WARNING_PCT,
} from "./lockedConstants.js";
import { computeMrpArithmetic } from "./mrpFormula.js";

const PLACEHOLDERS = new Set([
  "test",
  "testing",
  "tbd",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "xxx",
  "xxxx",
  "asdf",
  "asdfg",
  "asdfgh",
  "qwer",
  "qwert",
  "qwerty",
  "zxcv",
  "zzzz",
  "zzzzz",
  "abc",
  "abcd",
  "foo",
  "bar",
  "baz",
  "sample",
  "example",
  "placeholder",
  "dummy",
  "temp",
  "todo",
]);

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];
const UNIT_TOKENS = new Set(["ml", "g", "kg", "l", "lt", "ltr", "gm", "mg", "oz", "pcs", "pc", "pack"]);

function trim(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return trim(v).toLowerCase();
}

function hasValue(v) {
  if (v == null || v === "") return false;
  if (typeof v === "number") return Number.isFinite(v);
  return trim(v) !== "";
}

function lettersOnly(s) {
  return String(s || "").toLowerCase().replace(/[^a-z]/g, "");
}

function vowelRatio(s) {
  const letters = lettersOnly(s);
  if (!letters.length) return 1;
  const vowels = (letters.match(/[aeiou]/g) || []).length;
  return vowels / letters.length;
}

function isRepeatedChars(s) {
  const t = lettersOnly(s);
  return t.length >= 3 && /^(.)\1+$/.test(t);
}

function isKeyboardMash(s) {
  const t = lettersOnly(s);
  if (t.length < 4) return false;
  if (PLACEHOLDERS.has(t)) return true;
  for (const row of KEYBOARD_ROWS) {
    if (row.includes(t) || [...t].every((ch, i, arr) => i === 0 || row.includes(arr[i - 1] + ch) || row.includes(ch))) {
      // contiguous run on one keyboard row
      if (row.includes(t)) return true;
      let run = 1;
      for (let i = 1; i < t.length; i++) {
        const a = row.indexOf(t[i - 1]);
        const b = row.indexOf(t[i]);
        if (a >= 0 && b >= 0 && Math.abs(a - b) === 1) run += 1;
        else run = 1;
        if (run >= 4) return true;
      }
    }
  }
  // common mash digraphs
  if (/asdf|qwer|zxcv|hjkl|yuio|fghj|vbnm/.test(t)) return true;
  return false;
}

/** Digit/punctuation-only text (e.g. "12345", "1-2-3") is not a real description. */
function isDigitOnlyText(s) {
  return /\d/.test(s) && /^[\d\s.,\-+/:;_()#*]+$/.test(s);
}

/** Part 141 — exported so scorers/research can guard free-text fields. */
export function isGibberishText(raw) {
  const s = trim(raw);
  if (!s) return false;
  const l = lower(s);
  if (PLACEHOLDERS.has(l)) return true;
  if (isDigitOnlyText(s)) return true;
  if (isRepeatedChars(s)) return true;
  if (isKeyboardMash(s)) return true;
  const letters = lettersOnly(s);
  if (letters.length >= 5 && vowelRatio(s) === 0) return true;
  if (letters.length >= 8 && vowelRatio(s) < 0.12) return true;
  return false;
}

function looksOddCapitals(s) {
  const t = trim(s);
  if (t.length < 3) return false;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length < 3) return false;
  const upper = (letters.match(/[A-Z]/g) || []).length;
  const lowerN = (letters.match(/[a-z]/g) || []).length;
  // ALL CAPS or weird mixed (dOVE)
  if (upper === letters.length) return true;
  if (lowerN > 0 && upper > 0 && /[a-z][A-Z]{2,}|[A-Z]{2,}[a-z]/.test(letters) === false) {
    // camel-ish weird: first lower then upper cluster
    if (/^[a-z]+[A-Z]/.test(letters)) return true;
  }
  if (/^[a-z][A-Z]/.test(letters)) return true;
  return false;
}

/**
 * Title-case a product name; keep pack units lowercase (ml, g, …).
 */
export function titleCaseName(text) {
  const raw = trim(text);
  if (!raw) return "";
  return raw
    .split(/\s+/)
    .map((tok) => {
      const bare = tok.replace(/[^A-Za-z0-9.%]/g, "");
      const unitMatch = bare.match(/^(\d+(?:\.\d+)?)(ml|g|kg|l|lt|ltr|gm|mg|oz)$/i);
      if (unitMatch) return `${unitMatch[1]}${unitMatch[2].toLowerCase()}`;
      if (UNIT_TOKENS.has(bare.toLowerCase())) return bare.toLowerCase();
      if (/^\d/.test(bare)) return tok;
      const letters = tok.replace(/[^A-Za-z]/g, "");
      if (!letters) return tok;
      const i = tok.search(/[A-Za-z]/);
      if (i < 0) return tok;
      return tok.slice(0, i) + tok.charAt(i).toUpperCase() + tok.slice(i + 1).toLowerCase();
    })
    .join(" ");
}

function fieldIssue(field, status, code, message, suggestion) {
  const row = { field, status, code, message };
  if (suggestion != null && String(suggestion).trim()) row.suggestion = String(suggestion).trim();
  return row;
}

const NONE_ANSWERS = new Set(["none", "n/a", "na", "nil"]);

function reviewTextField(field, value, { minChars = 0, allowShortBrand = false, allowNone = false } = {}) {
  if (!hasValue(value)) return null;
  const s = trim(value);
  // Parity exceptions explicitly accept "none" — that is a real answer, not a placeholder.
  if (allowNone && NONE_ANSWERS.has(lower(s))) return null;
  if (minChars && s.length < minChars) {
    return fieldIssue(
      field,
      "invalid",
      `${field.toUpperCase()}_TOO_SHORT`,
      `Enter at least ${minChars} characters — a real product concept needs a short description.`,
      null
    );
  }
  if (isGibberishText(s)) {
    return fieldIssue(
      field,
      "invalid",
      `${field.toUpperCase()}_GIBBERISH`,
      `"${s}" does not read as a real ${field.replace(/([A-Z])/g, " $1").toLowerCase()}. Replace it with a clear value.`,
      null
    );
  }
  if (field === "benchmark") {
    const words = s.split(/\s+/).filter(Boolean);
    if (looksOddCapitals(s)) {
      const suggestion = titleCaseName(s);
      if (suggestion && suggestion !== s) {
        return fieldIssue(
          field,
          "fix",
          "BENCHMARK_ODD_CAPITALS",
          `Capitalisation looks off for a shelf brand. Use "${suggestion}" for research queries.`,
          suggestion
        );
      }
    }
    if (!allowShortBrand && words.length === 1 && lettersOnly(s).length >= 2) {
      return fieldIssue(
        field,
        "fix",
        "BENCHMARK_BARE_BRAND",
        `Add the variant and pack size (for example "${titleCaseName(s)} Scalp Serum 100 ml"), not only the brand.`,
        null
      );
    }
  }
  if (field !== "benchmark" && looksOddCapitals(s) && s === s.toUpperCase() && s.length > 4) {
    const suggestion = titleCaseName(s);
    if (suggestion !== s) {
      return fieldIssue(
        field,
        "fix",
        `${field.toUpperCase()}_ODD_CAPITALS`,
        `Prefer title case: "${suggestion}".`,
        suggestion
      );
    }
  }
  return null;
}

function reviewNumber(field, value, { min, max, maxExclusive, integerRates } = {}) {
  if (!hasValue(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fieldIssue(field, "invalid", `${field.toUpperCase()}_NOT_A_NUMBER`, "Enter a number.", null);
  }
  if (min != null && n < min) {
    return fieldIssue(field, "invalid", `${field.toUpperCase()}_TOO_LOW`, `Must be at least ${min}.`, null);
  }
  if (maxExclusive != null && n >= maxExclusive) {
    return fieldIssue(
      field,
      "invalid",
      `${field.toUpperCase()}_TOO_HIGH`,
      `Must be below ${maxExclusive}.`,
      null
    );
  }
  if (max != null && n > max) {
    return fieldIssue(field, "invalid", `${field.toUpperCase()}_TOO_HIGH`, `Must be at most ${max}.`, null);
  }
  if (integerRates && field === "gstRatePct") {
    const rates = GST_STANDARD_RATES;
    if (!rates.includes(n)) {
      return fieldIssue(
        field,
        "fix",
        "GST_NOT_STANDARD_RATE",
        `GST ${n}% is inside 0–40 but not on Finance's standard list (${rates.join(", ")}%). Confirm with Finance.`,
        null
      );
    }
  }
  return null;
}

/**
 * @returns {{ fields: Array<{field,status,code,message,suggestion?}>, blocking: boolean }}
 */
export function reviewInputs(doc = {}) {
  const fields = [];
  const f1 = doc.f1 && typeof doc.f1 === "object" ? doc.f1 : {};
  const f2 = doc.f2 && typeof doc.f2 === "object" ? doc.f2 : {};

  const push = (issue) => {
    if (issue) fields.push(issue);
  };

  push(reviewTextField("name", doc.name));
  push(reviewTextField("category", doc.category));
  push(
    reviewTextField("ideaDescription", doc.ideaDescription, {
      minChars: IDEA_DESCRIPTION_MIN_CHARS,
    })
  );
  push(reviewTextField("declaredAttribute", f1.declaredAttribute));
  push(reviewTextField("benchmark", f1.benchmark));
  push(reviewTextField("gapDerivation", f1.gapDerivation));
  push(reviewTextField("parityExceptions", f1.parityExceptions, { allowNone: true }));
  push(reviewTextField("growthArgument", f1.growthArgument));

  push(reviewNumber("declaredGap", f1.declaredGap, { min: 0, max: DECLARED_GAP_MAX }));

  push(reviewNumber("gstRatePct", f2.gstRatePct, { min: 0, max: 40, integerRates: true }));
  push(reviewNumber("netMarginAtScale", f2.netMarginAtScale, { min: 0, maxExclusive: 100 }));
  push(reviewNumber("mrpInr", f2.mrpInr, { min: 0.01 }));
  push(reviewNumber("cogsAtScale", f2.cogsAtScale, { min: 0 }));

  if (hasValue(f2.grammage)) {
    const g = trim(f2.grammage);
    if (g && !/\d/.test(g)) {
      push(
        fieldIssue(
          "grammage",
          "invalid",
          "GRAMMAGE_NO_NUMBER",
          "Pack size needs a number (for example 100 ml).",
          null
        )
      );
    } else if (g && !/(ml|g|kg|l|gm|mg|oz|ltr|pack|pcs)\b/i.test(g)) {
      push(
        fieldIssue(
          "grammage",
          "fix",
          "GRAMMAGE_NO_UNIT",
          `Add a unit to the pack size (ml, g, kg). "${g}" has no unit.`,
          null
        )
      );
    }
  }

  const cogs = Number(f2.cogsAtScale);
  const mrp = Number(f2.mrpInr);
  if (Number.isFinite(cogs) && Number.isFinite(mrp) && mrp > 0 && cogs >= mrp) {
    push(
      fieldIssue(
        "cogsAtScale",
        "fix",
        "COGS_AT_OR_ABOVE_MRP",
        `COGS ₹${cogs} is at or above MRP ₹${mrp}. Check the numbers.`,
        null
      )
    );
  }

  if (
    Number.isFinite(cogs) &&
    cogs > 0 &&
    Number.isFinite(Number(f2.netMarginAtScale)) &&
    Number.isFinite(mrp) &&
    mrp > 0
  ) {
    const implied = computeMrpArithmetic({
      cogsAtScale: cogs,
      netMarginAtScale: f2.netMarginAtScale,
      gstRatePct: f2.gstRatePct,
    });
    const impliedMrp = implied?.finalMrp ?? implied?.baseMrp;
    if (Number.isFinite(impliedMrp) && impliedMrp > 0) {
      const delta = (Math.abs(mrp - impliedMrp) / impliedMrp) * 100;
      if (delta > MRP_IMPLIED_WARNING_PCT) {
        push(
          fieldIssue(
            "mrpInr",
            "fix",
            "MRP_FAR_FROM_IMPLIED",
            `Typed MRP ₹${mrp} is more than ${MRP_IMPLIED_WARNING_PCT}% away from ₹${impliedMrp.toFixed(1)} implied by COGS, margin and GST.`,
            null
          )
        );
      }
    }
  }

  // Dedupe by field+code
  const seen = new Set();
  const unique = fields.filter((f) => {
    const k = `${f.field}:${f.code}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    fields: unique,
    blocking: unique.some((f) => f.status === "invalid"),
  };
}

/**
 * Part 141 — field keys the review marks status "invalid".
 * Accepts a reviewInputs() result ({fields}) or a doc (reviewed on the fly).
 * @returns {Set<string>}
 */
export function invalidInputFields(docOrReview = {}) {
  const review =
    docOrReview && Array.isArray(docOrReview.fields) ? docOrReview : reviewInputs(docOrReview || {});
  return new Set(review.fields.filter((f) => f.status === "invalid").map((f) => f.field));
}

/** Prefer title-cased suggestion for research prompts; else typed value. */
export function researchDisplayValue(field, typed, inputReview = null) {
  const typedStr = trim(typed);
  const fields = Array.isArray(inputReview?.fields) ? inputReview.fields : [];
  const hit = fields.find((f) => f.field === field && f.suggestion);
  if (hit?.suggestion) return trim(hit.suggestion);
  if (field === "benchmark" && typedStr && looksOddCapitals(typedStr)) {
    return titleCaseName(typedStr);
  }
  return typedStr;
}

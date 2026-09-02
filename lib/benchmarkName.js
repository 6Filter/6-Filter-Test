/**
 * Browser-safe: a Filter 1 benchmark must be a named competitor, not empty/placeholder text.
 */

const VAGUE_EXACT = new Set([
  "0",
  "00",
  "000",
  "n/a",
  "na",
  "n.a",
  "n.a.",
  "none",
  "nil",
  "null",
  "unknown",
  "unclear",
  "unsure",
  "tbd",
  "tba",
  "no",
  "nope",
  "no benchmark",
  "no competitor",
  "none named",
  "not applicable",
  "not available",
  "not found",
  "-",
  "--",
  "—",
  ".",
  "...",
  "?",
  "x",
  "xx",
  "xxx",
]);

export function isNamedBenchmark(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const compact = raw.toLowerCase().replace(/[.']+/g, "").replace(/\s+/g, " ").trim();
  if (!compact) return false;
  if (VAGUE_EXACT.has(compact)) return false;
  if (/^no\s+(benchmark|competitor|brand)\b/.test(compact)) return false;
  if (/^\d+([.,]\d+)?$/.test(raw)) return false;
  const letters = compact.replace(/\s/g, "");
  if (/^(.)\1{2,}$/.test(letters)) return false;
  if (letters.length < 2) return false;
  return true;
}

export function isVagueBenchmark(value) {
  return !isNamedBenchmark(value);
}

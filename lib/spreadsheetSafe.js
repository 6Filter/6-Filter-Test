/**
 * Part 140 D69 — spreadsheet formula-injection guard. Browser-safe, no imports.
 *
 * Export: a text cell that starts with = + @ - (or a tab / carriage return) would be run as a formula by
 * Excel, so it is written with a leading apostrophe. A plain number such as -5 is left alone.
 * Import: the same apostrophe is removed again; the text is otherwise stored exactly as typed and is
 * never evaluated.
 */

const FORMULA_START = /^[=+@\-\t\r]/;
const PLAIN_NUMBER = /^[-+]?\d+(?:[.,]\d+)*(?:e[-+]?\d+)?$/i;

export function startsLikeFormula(value) {
  return typeof value === "string" && FORMULA_START.test(value) && !PLAIN_NUMBER.test(value.trim());
}

/** Make a string safe to write into a spreadsheet cell. Non-strings come back unchanged. */
export function escapeFormulaText(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith("'") && FORMULA_START.test(value.slice(1))) return value; // already escaped
  return startsLikeFormula(value) ? `'${value}` : value;
}

/** Undo escapeFormulaText when reading a cell back in. */
export function unescapeFormulaText(value) {
  if (typeof value !== "string") return value;
  return value.startsWith("'") && FORMULA_START.test(value.slice(1)) ? value.slice(1) : value;
}

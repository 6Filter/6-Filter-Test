/**
 * Normalize a Nielsen/Kantar import. Licensed rows stay out of git.
 * Every row must end up with source, as_of, and category.
 */

const SOURCES = new Set(["nielsen", "kantar"]);

function fail(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function normalizeSyndicatedImport(body) {
  const root = Array.isArray(body) ? { rows: body } : body && typeof body === "object" ? body : {};
  const rows = Array.isArray(root.rows) ? root.rows : null;
  if (!rows) throw fail("Import needs a rows array in the example-file shape.");
  const stampSource = String(root.source || "").trim().toLowerCase();
  const stampAsOf = String(root.asOf || root.as_of || "").trim();
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw fail(`Row ${index + 1} is not an object.`);
    }
    const source = String(row.source || stampSource).trim().toLowerCase();
    const asOf = String(row.as_of || row.asOf || stampAsOf).trim();
    const category = String(row.category || "").trim();
    if (!source || !asOf) throw fail(`Row ${index + 1} needs source and as_of.`);
    if (!SOURCES.has(source)) throw fail(`Row ${index + 1} source must be nielsen or kantar.`);
    if (!category) throw fail(`Row ${index + 1} needs a category.`);
    const family = String(row.family || row.categoryFamily || "").trim();
    const payload = { ...row, source, as_of: asOf, category };
    if (family) payload.categoryFamily = payload.categoryFamily || family;
    return { source, category, family, asOf, payload };
  });
}

export function previewSyndicatedImport(rows) {
  const byCategory = {};
  for (const row of rows) {
    const key = `${row.source}:${row.category}`;
    byCategory[key] = (byCategory[key] || 0) + 1;
  }
  return { rows: rows.length, byCategory };
}

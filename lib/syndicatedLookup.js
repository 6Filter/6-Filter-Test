import fs from "node:fs/promises";
import path from "node:path";
import { normalizeCategoryKey, resolveCategoryFamily } from "./categoryFamily.js";

const DATA = path.join(process.cwd(), "data");
const MAX_SCOPED_ROWS = 8;

async function readJson(file) {
  try {
    const raw = await fs.readFile(path.join(DATA, file), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.rows || parsed.categories || [];
  } catch {
    return [];
  }
}

export async function readNielsenRows() {
  return readJson("nielsen.json");
}

export async function readKantarRows() {
  return readJson("kantar.json");
}

function rowCategoryKeys(row) {
  const keys = [row?.category, row?.segment, ...(Array.isArray(row?.aliases) ? row.aliases : [])];
  return keys.map((k) => normalizeCategoryKey(k)).filter(Boolean);
}

function rowFamily(row) {
  const explicit = String(row?.categoryFamily || "").trim();
  if (explicit) return explicit;
  return resolveCategoryFamily(row?.category);
}

/**
 * Exact category first, then the category family. Never return rows from
 * unrelated categories — empty match falls through to web search.
 */
export function lookupSyndicatedData(dataset, { category } = {}) {
  const rows = Array.isArray(dataset) ? dataset : [];
  const catKey = normalizeCategoryKey(category);
  if (!catKey) return { rows: [], matchedOn: "none", family: null, category: String(category || "").trim() };

  const family = resolveCategoryFamily(category);
  const exactMatches = rows.filter((r) => rowCategoryKeys(r).includes(catKey));
  if (exactMatches.length) {
    return {
      rows: exactMatches.slice(0, MAX_SCOPED_ROWS),
      matchedOn: "category",
      family,
      category: String(category || "").trim(),
    };
  }

  const familyKey = normalizeCategoryKey(family);
  const familyMatches = family
    ? rows.filter((r) => normalizeCategoryKey(rowFamily(r)) === familyKey)
    : [];
  if (familyMatches.length) {
    return {
      rows: familyMatches.slice(0, MAX_SCOPED_ROWS),
      matchedOn: "family",
      family,
      category: String(category || "").trim(),
    };
  }

  return { rows: [], matchedOn: "none", family, category: String(category || "").trim() };
}

export async function lookupNielsenCategory(category) {
  const rows = await readNielsenRows();
  const found = lookupSyndicatedData(rows, { category });
  return found.rows[0] || null;
}

export async function lookupKantarCategory(category) {
  const rows = await readKantarRows();
  const found = lookupSyndicatedData(rows, { category });
  return found.rows[0] || null;
}

export function formatNielsenForPrompt(row) {
  if (!row) {
    return "NIELSEN: (no local audit row for this category — use web search and playbook engines; still name a benchmark and a category size.)";
  }
  const products = Array.isArray(row.products) ? row.products : [];
  const lines = products.slice(0, 12).map((p) => {
    const g = p.gramsOrMl || p.grams || p.ml;
    const ppg = p.pricePerGram ?? (p.mrpInr && g ? Number(p.mrpInr) / Number(g) : null);
    return `- ${p.brand || ""} ${p.variant || ""} ${p.pack || ""} MRP ₹${p.mrpInr ?? "?"} ${g ? `${g}g/ml` : ""} ${ppg != null && Number.isFinite(ppg) ? `₹${Number(ppg).toFixed(2)}/g` : ""}`.trim();
  });
  return (
    `NIELSEN (local audit, ${row.period || "period n/s"}, ${row.geography || "India"}):\n` +
    `category=${row.category || ""} valueCr=${row.categoryValueCr ?? "n/s"} valueGrowthPct=${row.valueGrowthPct ?? "n/s"} volumeGrowthPct=${row.volumeGrowthPct ?? "n/s"}\n` +
    (row.formatShares ? `formatShares=${JSON.stringify(row.formatShares)}\n` : "") +
    `products currently selling:\n${lines.join("\n") || "(no SKU list)"}`
  );
}

export function formatKantarForPrompt(row) {
  if (!row) {
    return "KANTAR: (no local panel row — derive households, trial, repeat, frequency, pack value from HCES / analogs / web; still fill every factor.)";
  }
  return (
    `KANTAR (local panel, ${row.period || "period n/s"}, ${row.geography || "India"}):\n` +
    `category=${row.category || ""} householdsMn=${row.householdsMn ?? ""} penetrationPct=${row.penetrationPct ?? ""} ` +
    `trialRatePct=${row.trialRatePct ?? ""} repeatConversionPct=${row.repeatConversionPct ?? ""} ` +
    `purchaseFrequencyYr=${row.purchaseFrequencyYr ?? ""} avgPackValueInr=${row.avgPackValueInr ?? ""}`
  );
}

function formatLookupBlock(lookup, formatter, emptyText) {
  if (!lookup?.rows?.length) return emptyText;
  const tag = lookup.matchedOn === "family" ? "family" : "category";
  return lookup.rows
    .map(
      (row, i) =>
        `LOCAL ${lookup.matchedOn === "family" ? "FAMILY" : "CATEGORY"} MATCH ${i + 1} (matchedOn=${tag}):\n${formatter(row)}`
    )
    .join("\n\n");
}

export function formatSyndicatedLookup({ nielsen, kantar } = {}) {
  return `${formatLookupBlock(nielsen, formatNielsenForPrompt, formatNielsenForPrompt(null))}\n\n${formatLookupBlock(kantar, formatKantarForPrompt, formatKantarForPrompt(null))}`;
}

/** What we refuse to send: every row in the file, regardless of category. */
export function formatUnscopedSyndicatedPrompt(nielsenRows = [], kantarRows = []) {
  const n = (Array.isArray(nielsenRows) ? nielsenRows : []).map((row) => formatNielsenForPrompt(row)).join("\n\n");
  const k = (Array.isArray(kantarRows) ? kantarRows : []).map((row) => formatKantarForPrompt(row)).join("\n\n");
  return `${n || formatNielsenForPrompt(null)}\n\n${k || formatKantarForPrompt(null)}`;
}

export function measureSyndicatedTokenDelta(nielsenRows, kantarRows, category) {
  const nielsen = lookupSyndicatedData(nielsenRows, { category });
  const kantar = lookupSyndicatedData(kantarRows, { category });
  const unscoped = formatUnscopedSyndicatedPrompt(nielsenRows, kantarRows);
  const scoped = formatSyndicatedLookup({ nielsen, kantar });
  const charsBefore = unscoped.length;
  const charsAfter = scoped.length;
  const tokensBefore = Math.ceil(charsBefore / 4);
  const tokensAfter = Math.ceil(charsAfter / 4);
  return {
    category: String(category || "").trim(),
    family: nielsen.family || kantar.family || resolveCategoryFamily(category),
    nielsenMatchedOn: nielsen.matchedOn,
    kantarMatchedOn: kantar.matchedOn,
    nielsenRows: nielsen.rows.length,
    kantarRows: kantar.rows.length,
    tokensBefore,
    tokensAfter,
    tokensSaved: tokensBefore - tokensAfter,
    charsBefore,
    charsAfter,
  };
}

export async function syndicatedPromptBlock(_ideaText, { category } = {}) {
  const cat = String(category || "").trim();
  const [nielsenRows, kantarRows] = await Promise.all([readNielsenRows(), readKantarRows()]);
  const nielsen = lookupSyndicatedData(nielsenRows, { category: cat });
  const kantar = lookupSyndicatedData(kantarRows, { category: cat });
  const delta = measureSyndicatedTokenDelta(nielsenRows, kantarRows, cat);
  console.log(
    `[primus/syndicated] category=${delta.category || "(none)"} family=${delta.family || "(none)"} ` +
      `nielsen=${delta.nielsenMatchedOn} kantar=${delta.kantarMatchedOn} ` +
      `nielsenRows=${delta.nielsenRows} kantarRows=${delta.kantarRows} ` +
      `tokensBefore=${delta.tokensBefore} tokensAfter=${delta.tokensAfter} saved=${delta.tokensSaved}`
  );
  return formatSyndicatedLookup({ nielsen, kantar });
}

import { resolveCategoryFamily } from "./categoryFamily.js";

/**
 * Category-first web search. Family is a fallback only when the exact
 * category search comes back empty — never an unscoped India FMCG sweep.
 */
export function buildScopedSearchQuery(baseQuery, category) {
  const base = String(baseQuery || "").replace(/\s+/g, " ").trim();
  const cat = String(category || "").trim();
  const family = resolveCategoryFamily(cat);
  const primary = cat ? `${base} ${cat} category India`.replace(/\s+/g, " ").trim() : `${base} India`.trim();
  const fallback =
    family && family.toLowerCase() !== cat.toLowerCase()
      ? `${base} ${family} category India`.replace(/\s+/g, " ").trim()
      : null;
  return { primary, fallback, family: family || null, category: cat || null };
}

export function scopedSearchInstruction(baseQuery, category, { brand = "" } = {}) {
  const q = buildScopedSearchQuery(baseQuery, category);
  const brandName = String(brand || "").replace(/\s+/g, " ").trim();
  const lines = [
    "SEARCH SCOPE — use the web_search tool in this order. Do not broaden past these queries.",
    `PRIMARY: ${q.primary}`,
  ];
  if (q.fallback) {
    lines.push(
      `FALLBACK (only if PRIMARY returns no usable India results for this category): ${q.fallback}`
    );
  }
  if (brandName) {
    const cat = String(category || "").trim();
    const verify = cat
      ? `${brandName} product listing India ${cat}`
      : `${brandName} product listing India`;
    lines.push(
      `BENCHMARK VERIFY (required when STATED_BENCHMARK is set — search this exact brand): ${verify}`
    );
  }
  lines.push(
    "Never search unrelated categories. Never run a generic India FMCG search that is not scoped to this category or its family."
  );
  return lines.join("\n");
}

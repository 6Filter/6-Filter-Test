/**
 * Part 134 — honest GST resolution.
 * Finance table → AI estimate (cited + dated) → plain placeholder. Never "Analysed by AI" on a default.
 */
import { GST_STANDARD_RATES } from "./lockedConstants.js";

export function composeProductIdeaText({ name = "", category = "", ideaDescription = "" } = {}) {
  const lines = [];
  const n = String(name || "").trim();
  const c = String(category || "").trim();
  const idea = String(ideaDescription || "").trim();
  if (n) lines.push(`Proposition name: ${n}`);
  if (c) lines.push(`Category: ${c}`);
  if (idea) lines.push(idea);
  return lines.join("\n");
}

export function gstRateUnfilled(value) {
  if (value == null || String(value).trim() === "") return true;
  return !Number.isFinite(Number(value));
}

function asNum(v) {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

/** Match a Finance table row by HSN or category keyword (longest keyword wins). */
export function matchFinanceGstRow({ name = "", category = "", ideaDescription = "", table = [] } = {}) {
  const rows = Array.isArray(table) ? table : [];
  const blob = `${name} ${category} ${ideaDescription}`.toLowerCase();
  let best = null;
  let bestLen = -1;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rate = asNum(row.rate ?? row.gstRatePct);
    if (rate == null) continue;
    const hsn = norm(row.hsn);
    if (hsn && blob.includes(hsn)) {
      if (hsn.length > bestLen) {
        best = row;
        bestLen = hsn.length;
      }
      continue;
    }
    const keywords = Array.isArray(row.categoryKeywords)
      ? row.categoryKeywords
      : String(row.categoryKeywords || row.category || "")
          .split(/[,;|]/)
          .map((k) => k.trim())
          .filter(Boolean);
    for (const kw of keywords) {
      const k = norm(kw);
      if (k && blob.includes(k) && k.length > bestLen) {
        best = row;
        bestLen = k.length;
      }
    }
  }
  return best;
}

/**
 * @param {{ name?: string, category?: string, ideaDescription?: string, aiProposal?: object|null, table?: object[] }} args
 * @returns {{ gstRatePct: number|null, basis: "finance-table"|"ai-estimate"|"default", needsConfirmation: boolean, note: string, flags: string[] }}
 */
export function resolveGst({
  name = "",
  category = "",
  ideaDescription = "",
  aiProposal = null,
  table = [],
} = {}) {
  const flags = [];
  const financeRow = matchFinanceGstRow({ name, category, ideaDescription, table });
  if (financeRow) {
    const rate = asNum(financeRow.rate ?? financeRow.gstRatePct);
    if (!GST_STANDARD_RATES.includes(rate)) flags.push("NOT_STANDARD_SLAB");
    const asOf = String(financeRow.effectiveFrom || financeRow.asOf || "").trim();
    const source = String(financeRow.source || "").trim();
    return {
      gstRatePct: rate,
      basis: "finance-table",
      needsConfirmation: false,
      note: `Finance rate table: ${rate}%${asOf ? ` effective ${asOf}` : ""}${source ? ` (${source})` : ""}.`,
      flags,
    };
  }

  const aiRate = asNum(aiProposal?.gstRatePct ?? aiProposal?.rate ?? aiProposal?.estimatedGstRatePct);
  const aiSource = String(aiProposal?.source || aiProposal?.sourceUrl || aiProposal?.url || "").trim();
  const aiAsOf = String(aiProposal?.asOf || aiProposal?.asOfDate || aiProposal?.date || "").trim();
  if (aiRate != null && aiSource && aiAsOf) {
    if (!GST_STANDARD_RATES.includes(aiRate)) flags.push("NOT_STANDARD_SLAB");
    return {
      gstRatePct: aiRate,
      basis: "ai-estimate",
      needsConfirmation: true,
      note: `AI estimate from a web search: ${aiRate}% as of ${aiAsOf}, ${aiSource}. You can override it.`,
      flags,
    };
  }

  // Placeholder — never claim an AI analysed this.
  const placeholder = 18;
  flags.push("PLACEHOLDER");
  if (aiRate != null && (!aiSource || !aiAsOf)) flags.push("AI_UNCITED");
  return {
    gstRatePct: placeholder,
    basis: "default",
    needsConfirmation: true,
    note: "No rate was found. 18% is a placeholder and has not been checked. Override it with the right rate.",
    flags,
  };
}

/** @deprecated Prefer resolveGst. Kept for call sites that still pass the old shape. */
export function resolveGstRate({
  aiRate = null,
  aiBasis = "",
  name = "",
  category = "",
  ideaDescription = "",
  table = [],
  aiProposal = null,
} = {}) {
  const proposal =
    aiProposal ||
    (aiRate != null
      ? {
          gstRatePct: aiRate,
          source: /https?:\/\//i.test(String(aiBasis || "")) ? String(aiBasis).trim() : "",
          asOf: "",
        }
      : null);
  const resolved = resolveGst({ name, category, ideaDescription, aiProposal: proposal, table });
  return {
    gstRatePct: resolved.gstRatePct,
    gstKind: resolved.basis,
    gstBasis: resolved.note,
    needsConfirmation: resolved.needsConfirmation,
    flags: resolved.flags,
    basis: resolved.basis,
  };
}

/** @deprecated Keyword classifier removed in Part 134 — kept as a no-op stub for old imports. */
export function classifyProductGstKind() {
  return "other";
}

/** @deprecated */
export function snapGstSlab(raw) {
  const n = asNum(raw);
  if (n == null) return null;
  if (GST_STANDARD_RATES.includes(n)) return n;
  let best = GST_STANDARD_RATES[0];
  let dist = Infinity;
  for (const slab of GST_STANDARD_RATES) {
    const d = Math.abs(n - slab);
    if (d < dist) {
      dist = d;
      best = slab;
    }
  }
  return best;
}

/** @deprecated */
export function formatGstBasis() {
  return "GST rate not checked — confirm with Finance.";
}

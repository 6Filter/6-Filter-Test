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

/**
 * Part 138 D52 — the rate that may be saved or suggested into the form.
 * The "default" placeholder (18) is for research display only; it is never saved when the user never entered GST.
 * @param {{ gstRatePct: number|null, basis: string }|null} resolved result of resolveGst
 * @returns {number|null}
 */
export function gstRateForSave(resolved) {
  if (!resolved || resolved.basis === "default") return null;
  const n = asNum(resolved.gstRatePct);
  return n == null ? null : n;
}

/**
 * Part 138 I — TODO hook for the web GST check. Sets searchUsed from the request, never from the model.
 * Call from the F2 research step once a GST-specific search exists; until then it only records what ran.
 * @param {{ searchUsed?: boolean, resolved?: object|null, asOf?: string }} args
 * @returns {{ searchUsed: boolean, gstRatePct: number|null, basis: string, needsConfirmation: boolean, note: string, asOf: string }}
 */
export function assessGstRate({ searchUsed = false, resolved = null, asOf = "" } = {}) {
  return {
    searchUsed: searchUsed === true,
    gstRatePct: gstRateForSave(resolved),
    basis: resolved?.basis || "none",
    needsConfirmation: true,
    note: String(resolved?.note || "GST needed — no rate was entered or confirmed.").trim(),
    asOf: String(asOf || new Date().toISOString()),
  };
}

function gstStatusEntry(findings) {
  const maps = [findings?.autofillStatus, findings?.autofillReport?.fields];
  for (const map of maps) {
    const entry = map && typeof map === "object" ? map["f2.gstRatePct"] : null;
    if (entry && typeof entry === "object") return entry;
  }
  return null;
}

/**
 * Part 138 I — a stored 18% that no person ever entered (placeholder, AI or default) is cleared.
 * "Never human-entered" means: the form's gstBasis note is still set (the form blanks it on a human edit)
 * or the autofill report says the field was filled by the system and not confirmed.
 * A Finance-table rate is kept. Pure; the caller persists the result.
 * @returns {{ changed: boolean, f2: object, researchFindings: object|null }}
 */
export function clearPlaceholderGst(f2 = {}, researchFindings = null) {
  const form = f2 && typeof f2 === "object" ? f2 : {};
  const findings = researchFindings && typeof researchFindings === "object" ? researchFindings : null;
  const unchanged = { changed: false, f2: form, researchFindings: findings };
  if (asNum(form.gstRatePct) !== 18) return unchanged;
  const basis = String(form.gstBasis || "").trim();
  if (/^finance rate table/i.test(basis)) return unchanged;
  const status = gstStatusEntry(findings);
  if (status?.confirmed === true) return unchanged;
  const systemFilled = status?.status === "filled" || status?.aiSuggested != null;
  const notHuman = basis !== "" || systemFilled;
  if (!notHuman) return unchanged;

  const nextF2 = { ...form, gstRatePct: "", gstBasis: "" };
  let nextFindings = findings;
  if (findings) {
    const dropEntry = (map) => {
      if (!map || typeof map !== "object" || !map["f2.gstRatePct"]) return map;
      const { ["f2.gstRatePct"]: _gone, ...rest } = map;
      return rest;
    };
    const prevGst = findings.f2?.assessments?.gst;
    nextFindings = {
      ...findings,
      gstNeeded: true,
      ...(findings.autofillStatus ? { autofillStatus: dropEntry(findings.autofillStatus) } : {}),
      ...(findings.autofillReport?.fields
        ? { autofillReport: { ...findings.autofillReport, fields: dropEntry(findings.autofillReport.fields) } }
        : {}),
      f2: {
        ...(findings.f2 || {}),
        assessments: {
          ...(findings.f2?.assessments || {}),
          gst: {
            searchUsed: prevGst?.searchUsed === true,
            gstRatePct: null,
            basis: "none",
            needsConfirmation: true,
            needed: true,
            note: "GST needed — the stored 18% was a placeholder, not an entered rate.",
          },
        },
      },
    };
  }
  return { changed: true, f2: nextF2, researchFindings: nextFindings };
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

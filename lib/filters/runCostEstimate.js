import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { sixFilterChecklistSystem, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { GRAMMAGE_PACK_VALUES } from "../propositionFields.js";
import { assessGstRate, gstRateForSave, resolveGst, resolveGstRate } from "../gstRate.js";
import { searchUsedFromRequest } from "../assessmentResult.js";
import { withCategoryScope, maxUsesForMatch } from "../categoryScopedResearch.js";
import { buildStepEvidence } from "../evidenceProvenance.js";
import { listFinanceGstRates } from "../financeGstTable.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"estimatedCogsPerUnitInr":0,"estimatedCogsLowInr":0,"estimatedCogsHighInr":0,' +
  '"confidenceNote":"one line",' +
  '"estimatedGstRatePct":18,' +
  '"gstSource":"https://…","gstAsOf":"YYYY-MM-DD",' +
  '"gstBasis":"one sentence citing the source and date — never say Analysed by AI",' +
  '"estimatedGrammage":"pack size e.g. 100 ml or 100 g",' +
  '"qcomTrajectory":"optional notes on take-rate / fees",' +
  '"qcomPlan":[{"year":1,"mrpInr":0,"priceChangePct":null},{"year":2,"mrpInr":0},{"year":3,"mrpInr":0}],' +
  '"competitorPriceInr":0,"competitorPackSize":"100ml","competitorName":"...",' +
  '"categoryPcc":"...","leaderPcc":"...","leaderName":"...",' +
  '"sources":[{"title":"...","url":"..."}]}';

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeGrammage(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (GRAMMAGE_PACK_VALUES.includes(s)) return s;
  const lower = s.toLowerCase().replace(/\s+/g, "");
  const hit = GRAMMAGE_PACK_VALUES.find((v) => v.toLowerCase() === lower);
  if (hit) return hit;
  return s;
}

/** Convert pack option → base units (g or ml) for ₹/unit comparisons. */
export function grammageToBaseUnits(grammage) {
  const s = String(grammage || "")
    .trim()
    .replace(/\s+/g, "");
  if (!s) return null;
  if (/^1l$/i.test(s)) return 1000;
  if (/^1kg$/i.test(s)) return 1000;
  const m = s.match(/^(\d+(?:\.\d+)?)(ml|g|kg|l)$/i);
  if (m) {
    let n = Number(m[1]);
    const u = m[2].toLowerCase();
    if (u === "kg" || u === "l") n *= 1000;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const bare = s.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = Number(bare[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** Pull g/ml from research strings like "10 ml sachet" or "100ml bottle". */
export function parseGrammageToNumber(grammage) {
  const compact = grammageToBaseUnits(grammage);
  if (compact != null) return compact;
  const s = String(grammage || "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  const m = s.match(
    /(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|grams?|g|kgs?|kilograms?|ltrs?|litres?|liters?|l)\b/i
  );
  if (!m) return null;
  let n = Number(m[1]);
  const u = m[2].toLowerCase();
  const isMilli = u === "ml" || u.startsWith("mill");
  const isKiloOrLitre = !isMilli && /^(kg|kilogram|l|ltr|litre|liter)/.test(u);
  if (isKiloOrLitre) n *= 1000;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ownPricePerUnitFromF2(f2 = {}) {
  const mrp = asNum(f2.mrpInr);
  const base = grammageToBaseUnits(f2.grammage);
  if (mrp != null && mrp > 0 && base != null && base > 0) return mrp / base;
  const raw = String(f2.mrpGrammage || "").trim();
  if (!raw) return null;
  const direct = Number(raw);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const m = raw.match(/([\d.]+)\s*(?:\/|per)\s*([\d.]+)\s*(g|ml|kg|l)\b/i);
  if (m) {
    let price = Number(m[1]);
    let qty = Number(m[2]);
    const unit = m[3].toLowerCase();
    if (!Number.isFinite(price) || !Number.isFinite(qty) || qty <= 0) return null;
    if (unit === "kg" || unit === "l") qty *= 1000;
    return price / qty;
  }
  return null;
}

function nearestGrammage(preferredBase, preferLiquid) {
  const liquid = ["10ml", "25ml", "50ml", "100ml", "150ml", "200ml", "250ml", "500ml", "1L"];
  const solid = ["10g", "25g", "50g", "100g", "200g", "250g", "500g", "1kg"];
  const pool = preferLiquid ? liquid : solid;
  let best = pool[0];
  let bestDist = Infinity;
  for (const v of pool) {
    const b = grammageToBaseUnits(v);
    if (b == null) continue;
    const d = Math.abs(b - preferredBase);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}

function normalizeQcomPlan(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const row = raw[i] || {};
    const mrp = asNum(row.mrpInr);
    const pct = asNum(row.priceChangePct);
    rows.push({
      year: i + 1,
      mrpInr: mrp,
      priceChangePct: pct,
      takeRatePct: asNum(row.takeRatePct),
      deliveryFeeInr: asNum(row.deliveryFeeInr),
      grammage: row.grammage != null ? String(row.grammage).trim() : "",
    });
  }
  if (rows.every((r) => r.mrpInr == null && r.priceChangePct == null)) return null;
  return rows;
}

/**
 * F2 cost / GST / pack / three-year price-plan estimate for auto-fill.
 * Never suggests net margin or financeSigned. MRP is formula-only.
 */
export async function runCostEstimate({
  ideaText = "",
  name = "",
  category = "",
  division = "",
  targetMarginPct = null,
  financeGstTable = null,
} = {}) {
  void targetMarginPct;

  const productIdentity = [name, category, ideaText].filter((s) => String(s || "").trim()).join("\n");
  const gstIdentity = { name, category, ideaDescription: ideaText };

  const packList = GRAMMAGE_PACK_VALUES.join(", ");
  const researchSystem = sixFilterChecklistSystem(
    SOURCE_HIERARCHY_INSTRUCTION +
      "\n\nResearch a credible at-scale COGS (₹ per finished unit) for this FMCG idea in India,\n" +
      "from ingredients / bill of materials at scale. Give a low, middle and high figure.\n" +
      "Do NOT estimate net margin — the proposer types that by hand.\n" +
      "GST RATE: cite a public source URL and an as-of date (YYYY-MM-DD). Never write 'Analysed by AI'.\n" +
      "Do not guess MRP; MRP is computed later from COGS, net margin and GST. Also propose a pack size with a unit.\n" +
      "THREE-YEAR PRICE PLAN: propose year 1–3 shelf MRP (after tax) for the SAME pack, or year-on-year % change.\n" +
      "Optionally note take-rate and delivery fee. Also write optional qcomTrajectory notes.\n" +
      "Also find a named competitor/leader shelf price at a stated pack size, plus category PCC\n" +
      "and market-leader PCC (or volume-share proxy). These feed Filter 3; they do not replace MRP.\n" +
      "Apply the source hierarchy. Never write unsure or not available.\n" +
      `Preferred estimatedGrammage values (custom sizes like 330g are allowed): ${packList}.`
  );

  const { text: userText, nielsenMatchedOn, kantarMatchedOn, nielsenAsOf, kantarAsOf } = await withCategoryScope(
    `PRODUCT AT TOP OF PAGE:\n${String(productIdentity || "").slice(0, 1400)}\n\n` +
      `DIVISION: ${division || "(unknown)"}\n` +
      "Estimate COGS at scale (₹/unit) as low / middle / high, GST rate % with source URL and as-of date, and a pack size with unit.\n" +
      "Do NOT estimate net margin. Do NOT estimate MRP.\n" +
      "Propose qcomPlan for years 1–3 (same pack MRP or % change).\n" +
      "Return competitorPriceInr + competitorPackSize + competitorName, and categoryPcc + leaderPcc + leaderName.",
    {
      category,
      baseQuery: "COGS competitor shelf price GST",
      label: "f2-cost",
    }
  );

  const { parsed, sources, error, searchesUsed, webSearchEnabled } = await researchThenJson({
    label: "f2-cost",
    researchSystem,
    researchUser: userText,
    jsonSystem:
      "You are the structuring step for F2 cost research. Do not search. " +
      "Use only the research brief. Do not invent estimatedMrpInr. " +
      "Do not invent estimatedNetMarginPct — omit it. " +
      "gstSource must be a URL; gstAsOf must be YYYY-MM-DD when a rate is given. " +
      "Never start gstBasis with 'Analysed by AI'. " +
      STRUCTURE_SYSTEM,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 3072,
    jsonMaxTokens: 2048,
    maxUses: maxUsesForMatch(nielsenMatchedOn, kantarMatchedOn, 4),
  });

  let table = financeGstTable;
  if (!Array.isArray(table)) {
    try {
      table = await listFinanceGstRates();
    } catch {
      table = [];
    }
  }

  if (!parsed) {
    console.warn(`[primus/f2-cost] no structured result error=${error || "unknown"}`);
    const gstResolved = resolveGst({ ...gstIdentity, table });
    return {
      status: "failed",
      error: String(error || "The AI's answer could not be read").slice(0, 240),
      estimatedCogsPerUnitInr: null,
      estimatedCogsLowInr: null,
      estimatedCogsHighInr: null,
      estimatedNetMarginPct: null,
      estimatedGstRatePct: gstRateForSave(gstResolved),
      gstBasis: gstResolved.note,
      gstKind: gstResolved.basis,
      gstAssessment: assessGstRate({ searchUsed: searchUsedFromRequest({ webSearchEnabled, searchesUsed }), resolved: gstResolved }),
      estimatedMrpInr: null,
      estimatedGrammage: null,
      qcomTrajectory: null,
      qcomPlan: null,
      competitorPriceInr: null,
      competitorPackSize: null,
      competitorName: null,
      categoryPcc: null,
      leaderPcc: null,
      leaderName: null,
      confidenceNote: null,
      cogsBasis: null,
      sources: [],
      estimateLabel: "AI estimate, review",
    };
  }

  let cogsMid = asNum(parsed.estimatedCogsPerUnitInr);
  let cogsLow = asNum(parsed.estimatedCogsLowInr);
  let cogsHigh = asNum(parsed.estimatedCogsHighInr);
  if (cogsMid != null) {
    if (cogsLow == null) cogsLow = Math.round(cogsMid * 0.85 * 100) / 100;
    if (cogsHigh == null) cogsHigh = Math.round(cogsMid * 1.15 * 100) / 100;
  } else if (cogsLow != null && cogsHigh != null) {
    cogsMid = Math.round(((cogsLow + cogsHigh) / 2) * 100) / 100;
  }

  const gstResolved = resolveGst({
    ...gstIdentity,
    table,
    aiProposal: {
      gstRatePct: asNum(parsed.estimatedGstRatePct),
      source: String(parsed.gstSource || parsed.gstBasis || "").trim(),
      asOf: String(parsed.gstAsOf || "").trim(),
    },
  });
  // Legacy shape for older callers
  const gstLegacy = resolveGstRate({
    ...gstIdentity,
    table,
    aiProposal: {
      gstRatePct: asNum(parsed.estimatedGstRatePct),
      source: String(parsed.gstSource || "").trim(),
      asOf: String(parsed.gstAsOf || "").trim(),
    },
  });
  void gstLegacy;

  // Part 138 D52 — the placeholder 18 is display-only; never hand it on as a rate to save.
  const gst = gstRateForSave(gstResolved);
  const gstAssessment = assessGstRate({ searchUsed: searchUsedFromRequest({ webSearchEnabled, searchesUsed }), resolved: gstResolved });
  let grammage = normalizeGrammage(parsed.estimatedGrammage);

  if (!grammage && cogsMid != null) {
    const liquid = /\b(ml|shampoo|oil|lotion|serum|drink|juice|milk|wash)\b/i.test(productIdentity);
    grammage = nearestGrammage(100, liquid);
  }

  const qcomTrajectory = String(parsed.qcomTrajectory || "").trim() || null;
  const qcomPlan = normalizeQcomPlan(parsed.qcomPlan);
  const confidenceNote = String(parsed.confidenceNote || "").trim() || null;
  const cogsBasis =
    String(parsed.cogsBasis || "").trim() ||
    (cogsMid != null
      ? `AI estimate from idea description and web search (₹${cogsLow}–${cogsHigh}; mid ₹${cogsMid}).`
      : null);

  console.log(
    `[primus/f2-cost] division=${division || "null"} cogs=${cogsMid} gst=${gst} basis=${gstResolved.basis} grammage=${grammage || "null"}`
  );

  return {
    estimatedCogsPerUnitInr: cogsMid,
    estimatedCogsLowInr: cogsLow,
    estimatedCogsHighInr: cogsHigh,
    estimatedNetMarginPct: null,
    estimatedGstRatePct: gst,
    gstBasis: gstResolved.note,
    gstKind: gstResolved.basis,
    gstAssessment,
    estimatedMrpInr: null,
    estimatedGrammage: grammage,
    qcomTrajectory,
    qcomPlan,
    competitorPriceInr: asNum(parsed.competitorPriceInr),
    competitorPackSize: String(parsed.competitorPackSize || "").trim() || null,
    competitorName: String(parsed.competitorName || "").trim() || null,
    categoryPcc: String(parsed.categoryPcc || "").trim() || null,
    leaderPcc: String(parsed.leaderPcc || "").trim() || null,
    leaderName: String(parsed.leaderName || "").trim() || null,
    confidenceNote,
    cogsBasis,
    sources: mergeSources(parsed.sources, sources),
    estimateLabel: "AI estimate, review",
    evidence: buildStepEvidence({
      nielsenMatchedOn,
      kantarMatchedOn,
      nielsenAsOf,
      kantarAsOf,
      searchesUsed,
      sources,
      asOf: new Date().toISOString(),
    }),
  };
}

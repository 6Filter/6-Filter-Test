import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { loadSkillText, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { GRAMMAGE_PACK_VALUES } from "../propositionFields.js";
import { getDivisionMarginFloor } from "../divisionConfig.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"estimatedCogsPerUnitInr":0,"confidenceNote":"...",' +
  '"estimatedNetMarginPct":0,"estimatedMrpInr":0,' +
  '"estimatedGrammage":"<one of the allowed pack-size values>",' +
  '"qcomTrajectory":"one short paragraph on 3-year quick-commerce terms direction",' +
  '"sources":[{"title":"...","url":"..."}]}';

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeGrammage(raw) {
  const s = String(raw || "").trim();
  if (GRAMMAGE_PACK_VALUES.includes(s)) return s;
  const lower = s.toLowerCase().replace(/\s+/g, "");
  const hit = GRAMMAGE_PACK_VALUES.find((v) => v.toLowerCase() === lower);
  return hit || null;
}

/** Convert pack option → base units (g or ml) for ₹/unit comparisons. */
export function grammageToBaseUnits(grammage) {
  const s = String(grammage || "").trim();
  if (!s) return null;
  if (s === "1L") return 1000;
  if (s === "1kg") return 1000;
  const m = s.match(/^(\d+(?:\.\d+)?)(ml|g)$/i);
  if (!m) return null;
  return Number(m[1]);
}

export function ownPricePerUnitFromF2(f2 = {}) {
  const mrp = asNum(f2.mrpInr);
  const base = grammageToBaseUnits(f2.grammage);
  if (mrp != null && mrp > 0 && base != null && base > 0) return mrp / base;
  // Legacy free-text fallback
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

/**
 * F2 cost / margin / MRP / grammage estimate for auto-fill.
 * Never suggests financeSigned.
 */
export async function runCostEstimate({
  ideaText = "",
  division = "",
  targetMarginPct = null,
} = {}) {
  const floor =
    targetMarginPct != null
      ? asNum(targetMarginPct)
      : division
        ? await getDivisionMarginFloor(division)
        : null;

  const packList = GRAMMAGE_PACK_VALUES.join(", ");
  const researchSystem =
    loadSkillText(
      "six-filter-test/SKILL.md",
      "six-filter-test/references/filter-checklist-research.md"
    ) +
    "\n\n---\n\n" +
    SOURCE_HIERARCHY_INSTRUCTION +
    "\n\nResearch a credible at-scale COGS (₹ per finished unit) for this FMCG idea in India,\n" +
    "and a realistic launch net-margin % vs the division floor when given. Also propose an MRP (₹)\n" +
    "and a standard pack size. Apply the source hierarchy. Never write unsure or not available.\n" +
    `Allowed estimatedGrammage values only: ${packList}.`;

  const userText =
    `PRODUCT IDEA:\n${String(ideaText || "").slice(0, 1200)}\n\n` +
    `DIVISION: ${division || "(unknown)"}\n` +
    (floor != null ? `DIVISION_NET_MARGIN_FLOOR_PCT: ${floor}\n` : "DIVISION_NET_MARGIN_FLOOR_PCT: (none — still estimate)\n") +
    "Estimate COGS at scale (₹/unit), net margin %, MRP ₹, and one allowed grammage.\n" +
    "Also write a one-paragraph qcomTrajectory on where quick-commerce terms are heading over 3 years.\n" +
    "If useful: MRP ≈ COGS / (1 − targetMargin/100), then pick the nearest allowed pack size.";

  const { parsed, sources, error } = await researchThenJson({
    label: "f2-cost",
    researchSystem,
    researchUser: userText,
    jsonSystem:
      "You are the structuring step for F2 cost research. Do not search. " +
      "Use only the research brief. estimatedGrammage must be one of the allowed pack sizes. " +
      STRUCTURE_SYSTEM,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 3072,
    jsonMaxTokens: 2048,
    maxUses: 4,
  });

  if (!parsed) {
    console.warn(`[primus/f2-cost] no structured result error=${error || "unknown"}`);
    return null;
  }

  let cogs = asNum(parsed.estimatedCogsPerUnitInr);
  let margin = asNum(parsed.estimatedNetMarginPct);
  let mrp = asNum(parsed.estimatedMrpInr);
  let grammage = normalizeGrammage(parsed.estimatedGrammage);

  if (cogs != null && cogs > 0 && margin == null && floor != null) {
    margin = floor;
  }
  if (cogs != null && cogs > 0 && (mrp == null || mrp <= 0)) {
    const target = margin != null ? margin : floor != null ? floor : 40;
    const denom = 1 - target / 100;
    if (denom > 0.05) mrp = Math.round((cogs / denom) * 10) / 10;
  }
  if (!grammage && mrp != null) {
    // Heuristic pack: mid sizes; prefer ml for liquids if idea text hints so.
    const liquid = /\b(ml|shampoo|oil|lotion|serum|drink|juice|milk|wash)\b/i.test(ideaText);
    grammage = nearestGrammage(100, liquid);
  }

  const qcomTrajectory = String(parsed.qcomTrajectory || "").trim() || null;

  console.log(
    `[primus/f2-cost] division=${division || "null"} cogs=${cogs} margin=${margin} mrp=${mrp} grammage=${grammage || "null"}`
  );

  return {
    estimatedCogsPerUnitInr: cogs,
    estimatedNetMarginPct: margin,
    estimatedMrpInr: mrp,
    estimatedGrammage: grammage,
    qcomTrajectory,
    confidenceNote: String(parsed.confidenceNote || "").trim() || null,
    sources: mergeSources(parsed.sources, sources),
  };
}

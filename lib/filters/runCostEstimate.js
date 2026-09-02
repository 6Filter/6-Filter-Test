import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { skillTextForProvider, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { GRAMMAGE_PACK_VALUES } from "../propositionFields.js";
import { getDivisionMarginFloor } from "../divisionConfig.js";
import { computeDerivedMrp } from "../f2Derived.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"estimatedCogsPerUnitInr":0,"confidenceNote":"...",' +
  '"estimatedNetMarginPct":0,"estimatedGstRatePct":18,' +
  '"estimatedGrammage":"pack size e.g. 100ml or 330g",' +
  '"qcomTrajectory":"one short paragraph on 3-year quick-commerce terms direction",' +
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
  const s = String(grammage || "").trim().replace(/\s+/g, "");
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
 * F2 cost / margin / GST estimate for auto-fill. MRP is formula-only (never AI-guessed).
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
    skillTextForProvider(
      "six-filter-test/SKILL.md",
      "six-filter-test/references/filter-checklist-research.md"
    ) +
    "\n\n---\n\n" +
    SOURCE_HIERARCHY_INSTRUCTION +
    "\n\nResearch a credible at-scale COGS (₹ per finished unit) for this FMCG idea in India,\n" +
    "from ingredients / bill of materials at scale, and a realistic launch net-margin % vs the\n" +
    "division floor when given. Also suggest the GST rate (%) that applies to this product's HSN\n" +
    "category in India: food products are usually 5% or 18%; packaged snacks typically 18%.\n" +
    "Reason from the category — do not invent a rate, and do not guess MRP; MRP is computed later\n" +
    "from COGS, margin and GST. Also propose a pack size. Apply the source hierarchy.\n" +
    "Never write unsure or not available.\n" +
    `Preferred estimatedGrammage values (custom sizes like 330g are allowed): ${packList}.`;

  const userText =
    `PRODUCT IDEA:\n${String(ideaText || "").slice(0, 1200)}\n\n` +
    `DIVISION: ${division || "(unknown)"}\n` +
    (floor != null ? `DIVISION_NET_MARGIN_FLOOR_PCT: ${floor}\n` : "DIVISION_NET_MARGIN_FLOOR_PCT: (none — still estimate)\n") +
    "Estimate COGS at scale (₹/unit), net margin %, GST rate %, and a pack size.\n" +
    "Do NOT estimate MRP — it is derived as COGS / (1 − margin/100) × (1 + GST/100).\n" +
    "Also write a one-paragraph qcomTrajectory on where quick-commerce terms are heading over 3 years.";

  const { parsed, sources, error } = await researchThenJson({
    label: "f2-cost",
    researchSystem,
    researchUser: userText,
    jsonSystem:
      "You are the structuring step for F2 cost research. Do not search. " +
      "Use only the research brief. Do not invent estimatedMrpInr. " +
      "estimatedGstRatePct must be a number (typically 5 or 18). " +
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
  let gst = asNum(parsed.estimatedGstRatePct);
  let grammage = normalizeGrammage(parsed.estimatedGrammage);

  if (cogs != null && cogs > 0 && margin == null && floor != null) {
    margin = floor;
  }
  const mrp = computeDerivedMrp(cogs, margin, gst);
  if (!grammage && (mrp != null || cogs != null)) {
    const liquid = /\b(ml|shampoo|oil|lotion|serum|drink|juice|milk|wash)\b/i.test(ideaText);
    grammage = nearestGrammage(100, liquid);
  }

  const qcomTrajectory = String(parsed.qcomTrajectory || "").trim() || null;

  console.log(
    `[primus/f2-cost] division=${division || "null"} cogs=${cogs} margin=${margin} gst=${gst} mrp=${mrp} grammage=${grammage || "null"}`
  );

  return {
    estimatedCogsPerUnitInr: cogs,
    estimatedNetMarginPct: margin,
    estimatedGstRatePct: gst,
    estimatedMrpInr: mrp,
    estimatedGrammage: grammage,
    qcomTrajectory,
    confidenceNote: String(parsed.confidenceNote || "").trim() || null,
    sources: mergeSources(parsed.sources, sources),
  };
}

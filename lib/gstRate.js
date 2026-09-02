/**
 * Indian GST for CavinKare FMCG SKUs.
 * Food is usually 5% or 18%. Packaged snacks are typically 18%.
 * Rate is analysed from the product named at the top of the proposition page.
 */

const GST_SLABS = [0, 5, 12, 18, 28];

const SNACK_RE =
  /\b(snack|snacks|namkeen|chips|crisps|extruded|kurkure|mixture|bhujia|sev|farsan|puff|puffs|nachos|popcorn|chakli|murukku|khakhra|banana\s*chips|potato\s*chips|corn\s*chips|ready[-\s]?to[-\s]?eat\s+savoury)\b/i;

const STAPLE_FOOD_RE =
  /\b(atta|wheat\s*flour|maida|rice|dal|dals|pulse|pulses|lentil|plain\s*milk|toned\s*milk|curd|dahi|ghee|edible\s*oil|mustard\s*oil|sunflower\s*oil|sugar|salt)\b/i;

const FOOD_RE =
  /\b(food|foods|fmcg\s*food|edible|grocery|namkeen|snack|dairy|beverage|drink|juice|sauce|pickle|masala|spice|noodle|pasta|biscuit|cookie|confection|sweet|mithai|jam|spread|cereal|oats|health\s*food|nutrition)\b/i;

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

function blob(name, category, ideaDescription) {
  return `${name || ""} ${category || ""} ${ideaDescription || ""}`;
}

export function classifyProductGstKind({ name = "", category = "", ideaDescription = "" } = {}) {
  const text = blob(name, category, ideaDescription);
  if (SNACK_RE.test(text)) return "packaged-snack";
  if (STAPLE_FOOD_RE.test(text)) return "staple-food";
  if (FOOD_RE.test(text)) return "food";
  return "other";
}

export function gstRateUnfilled(value) {
  if (value == null || String(value).trim() === "") return true;
  return !Number.isFinite(Number(value));
}

export function snapGstSlab(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  let best = 18;
  let dist = Infinity;
  for (const slab of GST_SLABS) {
    const d = Math.abs(n - slab);
    if (d < dist) {
      dist = d;
      best = slab;
    }
  }
  return best;
}

function defaultRateForKind(kind) {
  if (kind === "staple-food") return 5;
  return 18;
}

export function formatGstBasis({ kind, rate, fromAi = true } = {}) {
  const analysed = fromAi ? "Analysed by AI" : "From the product at the top of this page";
  if (kind === "packaged-snack") {
    return `${analysed}: packaged snack — GST typically 18%.`;
  }
  if (kind === "staple-food") {
    return `${analysed}: staple food — GST usually 5% (confirm against the HSN).`;
  }
  if (kind === "food") {
    return `${analysed}: food product — GST is usually 5% or 18%; using ${rate}%.`;
  }
  return `${analysed} from the product at the top of this page — GST ${rate}%.`;
}

/**
 * Prefer the AI rate, then apply the food / packaged-snack rules.
 * Never leave GST empty.
 */
export function resolveGstRate({
  aiRate = null,
  aiBasis = "",
  name = "",
  category = "",
  ideaDescription = "",
} = {}) {
  const kind = classifyProductGstKind({ name, category, ideaDescription });
  const fromAi = aiRate != null && String(aiRate).trim() !== "" && Number.isFinite(Number(aiRate));
  let rate = fromAi ? snapGstSlab(aiRate) : null;
  if (rate == null) rate = defaultRateForKind(kind);

  if (kind === "packaged-snack") rate = 18;
  else if (kind === "food" && rate !== 5 && rate !== 18) rate = 18;
  else if (kind === "staple-food" && rate !== 5 && rate !== 18) rate = 5;

  const cleanedAiBasis = String(aiBasis || "").trim();
  const gstBasis =
    cleanedAiBasis || formatGstBasis({ kind, rate, fromAi: true });

  return { gstRatePct: rate, gstKind: kind, gstBasis };
}

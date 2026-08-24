import {
  HIGH_REVENUE_CRORES,
  PLANTS,
  PLATFORMS,
} from "./investmentMaster.js";

function scoreKeywordHit(text, keywords) {
  let score = 0;
  for (const kw of keywords) {
    const k = String(kw).toLowerCase().trim();
    if (!k) continue;
    if (text.includes(k)) score += k.length > 8 ? 2 : 1;
  }
  return score;
}

function plantById(id) {
  return PLANTS.find((p) => p.id === id) || null;
}

/** Food / dairy senses that should NOT force Personal Care. */
function isFoodNotPersonalCare(text) {
  return /\b(ice\s*cream|milk\s*powder|dairy\s*whitener|protein\s*powder|chili\s*powder|chilli\s*powder|curry\s*powder|baking\s*powder|custard|uht\b|paneer|payasam|kheer|nata\s*de\s*coco|whipped\s*cream|sour\s*cream)\b/.test(
    text
  ) && !/\b(hair|skin|face|facial|scalp|beard|shampoo|soap|lotion|serum|moisturis|moisturiz|gel\s*cream)\b/.test(text);
}

/**
 * Broad Personal Care detector: hair, skin, personal care,
 * and gel / cream / powder aimed at skin or hair.
 */
export function detectPersonalCare(text) {
  if (isFoodNotPersonalCare(text)) return null;

  const hasHair = /\b(hair|scalp|beard|shampoo|conditioner|dandruff|haircare)\b/.test(text);
  const hasSkin =
    /\b(skin|skincare|face|facial|derm|dermo|body\s*care|lip\s*care|moisturis|moisturiz)\b/.test(
      text
    );
  const hasPcLabel =
    /\b(personal\s*care|\bpc\b|beauty|cosmetic|grooming|salon)\b/.test(text);
  const hasGelCreamLotion =
    /\b(gel|cream|lotion|serum|mask|toner|balm|mousse|emulsion)\b/.test(text);
  const hasPcPowder =
    /\b((face|facial|hair|body|baby|compact|setting|talc|talcum)\s*powder|powder\s*for\s*(face|skin|hair)|talc|talcum)\b/.test(
      text
    );
  const hasPcFormCombo =
    hasGelCreamLotion &&
    /\b(hair|skin|face|facial|scalp|beard|body|hand|foot|lip|nail|underarm|moisturis|moisturiz)\b/.test(
      text
    );
  const hasCosmeticForm =
    /\b(gel\s*cream|cream\s*gel|leave[\s-]*in|leave[\s-]*on|day\s*cream|night\s*cream|bb\s*cream|cc\s*cream|hair\s*gel|hair\s*cream|shower\s*gel)\b/.test(
      text
    );

  // Bare cosmetic gel/cream (not food) → Personal Care / Skin Care
  const hasStandaloneCosmetic =
    hasGelCreamLotion &&
    !/\b(milk|dairy|uht|paneer|butter|ghee|curd|yogurt|snack|pickle|kibble)\b/.test(text);

  if (
    !(
      hasHair ||
      hasSkin ||
      hasPcLabel ||
      hasPcFormCombo ||
      hasCosmeticForm ||
      hasPcPowder ||
      hasStandaloneCosmetic
    )
  ) {
    return null;
  }

  const portfolios = [];
  if (
    hasHair ||
    /\b(shampoo|conditioner|dandruff|hair\s*gel|hair\s*cream|hair\s*oil|hair\s*dye|dry\s*shampoo|hair\s*powder)\b/.test(
      text
    )
  ) {
    portfolios.push("Hair Care");
  }
  if (
    hasSkin ||
    hasCosmeticForm ||
    hasStandaloneCosmetic ||
    hasPcPowder ||
    /\b(moisturis|moisturiz|sunscreen|serum|toner|fairness|brightening|exosome|pdrna|face\s*powder|gel|cream|lotion)\b/.test(
      text
    )
  ) {
    portfolios.push("Skin Care");
  }
  if (
    /\b(soap|body\s*wash|shower\s*gel|handwash|hand\s*wash|sanitis|sanitiz|talc|talcum|scrub|exfoliant)\b/.test(
      text
    )
  ) {
    portfolios.push("Bath & Body");
  }
  if (/\b(tooth|mouth\s*wash|mouthwash|oral\s*care)\b/.test(text)) {
    portfolios.push("Oral Care");
  }
  if (/\b(deodorant|perfume|fragrance|body\s*mist|edt)\b/.test(text)) {
    portfolios.push("Deodorants & Fragrances");
  }
  if (/\b(shaving|razor|aftershave|beard|men'?s\s*grooming|mens\s*grooming)\b/.test(text)) {
    portfolios.push("Men's Grooming");
  }
  if (portfolios.length === 0) {
    portfolios.push(hasHair ? "Hair Care" : "Skin Care");
  }

  return [...new Set(portfolios)];
}

/**
 * Match idea text to best platform and/or plant(s).
 * Multi-plant platforms → High investment.
 * Single plant + fits future/current lines → Low investment.
 * Weak fit / new capability → High investment.
 * Personal-care portfolio → Personal Care (Pan-India), Low investment.
 */
export function matchInvestmentProfile(ideaText) {
  const text = String(ideaText || "").toLowerCase();
  const pc = plantById("pc");

  // Personal-care (hair / skin / gel / cream / powder) → Pan-India PC first.
  if (pc) {
    const detected = detectPersonalCare(text);
    const portfolioKeywords = Object.values(pc.portfolios || {}).flat();
    const keywordScore =
      scoreKeywordHit(text, pc.keywords) +
      scoreKeywordHit(text, portfolioKeywords) +
      scoreKeywordHit(text, pc.productsNow) +
      scoreKeywordHit(text, pc.futureExtensions);

    if (detected || (keywordScore >= 1 && !isFoodNotPersonalCare(text))) {
      const matchedPortfolios = Object.entries(pc.portfolios || {})
        .filter(([, kws]) => scoreKeywordHit(text, kws) > 0)
        .map(([name]) => name);
      const portfoliosLabel =
        (detected && detected.length ? detected : null) ||
        (matchedPortfolios.length > 0 ? matchedPortfolios : ["Skin Care"]);

      return {
        matchType: "plant",
        platform: null,
        plants: [pc],
        investmentLevel: "low",
        investmentReason: `Maps to Personal Care portfolio (${portfoliosLabel.join(", ")}) on Personal Care (Pan-India) using emulsification / blending / filling — investment Low.`,
        planSummary: `PC plan: ${portfoliosLabel.join(" · ")}. Now [${pc.productsNow.slice(0, 4).join(", ")}]; extend toward [${pc.futureExtensions.slice(0, 2).join(", ")}].`,
        machinery: pc.keyAssets,
        category: pc.category,
      };
    }
  }

  let bestPlatform = null;
  let bestPlatformScore = 0;
  for (const p of PLATFORMS) {
    const s = scoreKeywordHit(text, p.keywords);
    if (s > bestPlatformScore) {
      bestPlatformScore = s;
      bestPlatform = p;
    }
  }

  const plantScores = PLANTS.filter((plant) => plant.id !== "pc")
    .map((plant) => {
      const s =
        scoreKeywordHit(text, plant.keywords) +
        scoreKeywordHit(text, plant.futureExtensions) +
        scoreKeywordHit(text, plant.productsNow);
      return { plant, score: s };
    })
    .sort((a, b) => b.score - a.score);

  const topPlants = plantScores.filter((x) => x.score > 0).slice(0, 3);
  const primary = topPlants[0]?.plant || null;

  // Platform match wins if strong enough → High investment
  if (bestPlatform && bestPlatformScore >= 2) {
    const plants = bestPlatform.plantIds.map(plantById).filter(Boolean);
    return {
      matchType: "platform",
      platform: bestPlatform,
      plants,
      investmentLevel: "high",
      investmentReason: `Maps to multi-plant platform “${bestPlatform.name}” (${plants
        .map((p) => p.name)
        .join(" + ")}). Combined facilities imply higher investment.`,
      planSummary: bestPlatform.concept,
      machinery: plants.flatMap((p) => p.keyAssets).slice(0, 10),
      category: bestPlatform.name,
    };
  }

  if (primary && topPlants[0].score >= 2) {
    const multiPlant = topPlants.filter((x) => x.score >= 2).length >= 2;
    const investmentLevel = multiPlant ? "high" : "low";
    const plantsUsed = multiPlant
      ? topPlants.filter((x) => x.score >= 2).map((x) => x.plant)
      : [primary];

    return {
      matchType: "plant",
      platform: null,
      plants: plantsUsed,
      investmentLevel,
      investmentReason: multiPlant
        ? `Idea spans multiple plants (${plantsUsed.map((p) => p.name).join(" + ")}), so investment is High.`
        : `Fits existing / planned lines at ${primary.name} using current assets — investment Low.`,
      planSummary: `Leverage ${primary.name}: now [${primary.productsNow.slice(0, 3).join(", ")}]; extend toward [${primary.futureExtensions
        .slice(0, 2)
        .join(", ")}].`,
      machinery: primary.keyAssets,
      category: primary.category,
    };
  }

  return {
    matchType: "unmatched",
    platform: null,
    plants: [],
    investmentLevel: "high",
    investmentReason:
      "No clear plant fit in the current asset map — treat as High investment (new capability / greenfield risk) until category is confirmed.",
    planSummary: "Confirm category with Manufacturing / Capex team.",
    machinery: [],
    category: "Unclassified",
  };
}

export function classifyRevenueLevel(revenueCrores) {
  const cr = Number(revenueCrores) || 0;
  return cr >= HIGH_REVENUE_CRORES ? "high" : "low";
}

export function buildInvestmentGrid(ideaText, revenueCrores, tamValuation = "") {
  const profile = matchInvestmentProfile(ideaText);
  const revenueLevel = classifyRevenueLevel(revenueCrores);
  const investmentLevel = profile.investmentLevel;

  const key = `${investmentLevel}-${revenueLevel}`;
  const labels = {
    "high-high": "High investment · High revenue",
    "high-low": "High investment · Low revenue",
    "low-low": "Low investment · Low revenue",
    "low-high": "Low investment · High revenue",
  };

  const guidance = {
    "high-high": "Scale play — justify multi-plant / capex with strong return signal.",
    "high-low": "Caution — heavy spend vs weaker revenue signal; rethink scope or proof.",
    "low-low": "Niche / incremental — limited upside and limited spend.",
    "low-high": "Attractive — efficient return using existing or light assets.",
  };

  return {
    category: profile.category,
    matchType: profile.matchType,
    platformName: profile.platform?.name || null,
    plants: profile.plants.map((p) => ({
      id: p.id,
      name: p.name,
      keyAssets: p.keyAssets,
    })),
    planSummary: profile.planSummary,
    machinery: profile.machinery,
    investmentLevel,
    revenueLevel,
    revenueThresholdCrores: HIGH_REVENUE_CRORES,
    revenueCrores: Number(revenueCrores) || 0,
    tamValuation: String(tamValuation || ""),
    investmentReason: profile.investmentReason,
    quadrantKey: key,
    quadrantLabel: labels[key],
    quadrantGuidance: guidance[key],
    grid: {
      "high-high": key === "high-high",
      "high-low": key === "high-low",
      "low-high": key === "low-high",
      "low-low": key === "low-low",
    },
  };
}

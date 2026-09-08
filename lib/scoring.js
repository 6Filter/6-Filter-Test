import { buildInvestmentGrid } from "./investmentGrid.js";
import { brandRosterForPrompt } from "./ckBrands.js";
import { ideaScaleLabel } from "./ideaScale.js";

function stripJsonFence(raw) {
  let s = String(raw ?? "").replace(/^\uFEFF/, "").trim();
  const wrapped = s.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i);
  if (wrapped) return wrapped[1].trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "");
    s = s.replace(/\s*```$/i, "");
  }
  return s.trim();
}

export function extractJsonObject(raw) {
  const cleaned = stripJsonFence(raw);
  const start = cleaned.indexOf("{");
  if (start < 0) throw new Error("No JSON object found in model response.");

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }

  throw new Error("Model response was truncated before JSON finished.");
}

export function repairJson(jsonStr) {
  return stripJsonFence(jsonStr)
    .replace(/^\uFEFF/, "")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\\(?!["\\/bfnrtu])/g, "")
    .replace(/'([^']*)'/g, '"$1"')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
}

export function repairTruncatedJson(jsonStr) {
  let s = repairJson(String(jsonStr || "")).trim();
  let quotes = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && s[i - 1] !== "\\") quotes++;
  }
  if (quotes % 2 === 1) s += '"';
  s = s.replace(/,\s*$/, "");
  let brace = 0;
  let bracket = 0;
  for (const c of s) {
    if (c === "{") brace++;
    else if (c === "}") brace--;
    else if (c === "[") bracket++;
    else if (c === "]") bracket--;
  }
  while (bracket > 0) {
    s += "]";
    bracket--;
  }
  while (brace > 0) {
    s += "}";
    brace--;
  }
  return s;
}

function snapScore100(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x / 5) * 5));
}

function dimScore(value, fallback = 40) {
  if (value == null) return snapScore100(fallback);
  if (typeof value === "number") {
    return snapScore100(Number.isFinite(value) ? value : fallback);
  }
  if (typeof value === "object" && value.score != null) {
    const n = Number(value.score);
    return snapScore100(Number.isFinite(n) ? n : fallback);
  }
  const n = Number(value);
  return snapScore100(Number.isFinite(n) ? n : fallback);
}

export function normalizeFlatResult(obj) {
  if (!obj || typeof obj !== "object") {
    throw new Error("Model returned an empty validation payload.");
  }

  const n = dimScore(obj.novelty, 40);
  const m = dimScore(obj.market ?? obj.relevance, 40);
  const e = dimScore(obj.evidence, 30);
  const noveltyObj = typeof obj.novelty === "object" && obj.novelty ? obj.novelty : {};
  const marketObj = typeof obj.market === "object" && obj.market ? obj.market : {};
  const evidenceObj = typeof obj.evidence === "object" && obj.evidence ? obj.evidence : {};

  return {
    novelty: {
      score: n,
      rationale: String(noveltyObj.rationale || obj.noveltyRationale || obj.rationale || "Assessed for uniqueness."),
      edge: String(noveltyObj.edge || obj.edge || "Sharpen differentiation."),
    },
    market: {
      score: m,
      rationale: String(marketObj.rationale || obj.marketRationale || "Assessed for category fit."),
      trend: String(marketObj.trend || obj.trend || "Watch consumer demand."),
    },
    evidence: {
      score: e,
      rationale: String(evidenceObj.rationale || obj.evidenceRationale || "Evidence is limited."),
      gap: String(evidenceObj.gap || obj.gap || "Add proof points."),
    },
    improvements: Array.isArray(obj.improvements)
      ? obj.improvements.map((s) => String(s)).filter(Boolean).slice(0, 5)
      : ["Sharpen the benefit claim", "Add evidence", "Clarify TAM"],
    oneLiner: String(obj.oneLiner || "A concept that needs clearer positioning."),
    revenuePotentialCrores: Number(obj.revenuePotentialCrores) || null,
    tamValuation: String(obj.tamValuation || ""),
    categoryTags: Array.isArray(obj.categoryTags)
      ? obj.categoryTags.map((t) => String(t)).filter(Boolean).slice(0, 4)
      : undefined,
    analysisSummary: obj.analysisSummary != null ? String(obj.analysisSummary) : undefined,
    refinementPivot: obj.refinementPivot != null ? String(obj.refinementPivot) : undefined,
  };
}

function scrapeScoresFallback(raw) {
  const flatNum = (key) => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`, "i"));
    return m ? Number(m[1]) : null;
  };
  const nestedNum = (key) => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*\\{[\\s\\S]*?"score"\\s*:\\s*(\\d+)`, "i"));
    return m ? Number(m[1]) : null;
  };
  const novelty = nestedNum("novelty") ?? flatNum("novelty");
  const market = nestedNum("market") ?? flatNum("market") ?? flatNum("relevance");
  const evidence = nestedNum("evidence") ?? flatNum("evidence");
  if (novelty == null || market == null || evidence == null) return null;

  const pull = (re, fallback = "") => {
    const m = raw.match(re);
    return m ? m[1].trim() : fallback;
  };
  return {
    novelty,
    market,
    evidence,
    oneLiner: pull(/"oneLiner"\s*:\s*"([^"]*)"/i, "A concept that still needs sharper positioning."),
    revenuePotentialCrores: flatNum("revenuePotentialCrores"),
    tamValuation: pull(/"tamValuation"\s*:\s*"([^"]*)"/i, ""),
    improvements: ["Sharpen the proposition", "Add evidence", "Validate TAM"],
    edge: pull(/"edge"\s*:\s*"([^"]*)"/i, "Needs a sharper unique edge."),
    trend: pull(/"trend"\s*:\s*"([^"]*)"/i, "Align with a clearer consumer trend."),
    gap: pull(/"gap"\s*:\s*"([^"]*)"/i, "Add consumer or category data."),
  };
}

export function estimateRevenueFromScores(parsed) {
  const n = Number(parsed?.novelty?.score);
  const m = Number(parsed?.market?.score);
  const e = Number(parsed?.evidence?.score);
  const novelty = Number.isFinite(n) ? n : 40;
  const market = Number.isFinite(m) ? m : 40;
  const evidence = Number.isFinite(e) ? e : 25;
  const phase1 = (novelty * 0.4 + market * 0.3 + evidence * 0.3) * 0.6;

  if (phase1 < 30) {
    const cr = 0.04 + (Math.max(phase1, 0) / 30) * 0.05;
    return Math.round(cr * 100) / 100;
  }
  if (phase1 <= 40) {
    const cr = 0.1 + ((phase1 - 30) / 10) * 0.4;
    return Math.round(cr * 100) / 100;
  }
  const cr = 1.2 + ((Math.min(phase1, 60) - 40) / 20) * 2.8;
  return Math.round(cr * 100) / 100;
}

export function resolveRevenueCrores(parsed) {
  const raw = Number(parsed?.revenuePotentialCrores);
  if (!Number.isFinite(raw) || raw <= 0) {
    return estimateRevenueFromScores(parsed);
  }
  return raw;
}

export function classifyIdeaWeight(revenueCrores) {
  // Same locked bands as the badge / gate / log: ≤ ₹1 Cr → 10g | ≤ ₹12 Cr → 100g | else 1000g
  return ideaScaleLabel(revenueCrores);
}

export function formatRevenueFromCrores(cr) {
  const value = Number(cr);
  if (!Number.isFinite(value) || value <= 0) return "₹3 – ₹10 Lakhs";
  if (value < 0.01) return "< ₹1 Lakh";
  if (value < 1) {
    const lakhs = value * 100;
    if (lakhs < 10) return `₹${lakhs.toFixed(1)} Lakhs`;
    return `₹${Math.round(lakhs)} Lakhs`;
  }
  if (value < 10) return `₹${value.toFixed(2)} Cr`;
  return `₹${value.toFixed(0)} Cr`;
}

export function revenueDisplayFor(result) {
  const crores = resolveRevenueCrores(result);
  return {
    crores,
    label: formatRevenueFromCrores(crores),
    weight: classifyIdeaWeight(crores),
  };
}

export function computePhase1(parsed) {
  const weighted = parsed.novelty.score * 0.4 + parsed.market.score * 0.3 + parsed.evidence.score * 0.3;
  return weighted * 0.6;
}

export function matrixScores(parsed) {
  return {
    novelty: scoreToFive(parsed.novelty.score),
    relevance: scoreToFive(parsed.market.score),
    evidence: scoreToFive(parsed.evidence.score),
  };
}

function buildTamFallback(idea, marketTrend) {
  const lower = (idea || "").toLowerCase();
  let category = "adjacent FMCG category";
  let size = "₹5,000–₹15,000 Cr";
  if (/soap|bath|wash|cleanser|skin/.test(lower)) {
    category = "Indian bathing / personal wash market";
    size = "~₹28,000 Cr";
  } else if (/shampoo|hair|scalp/.test(lower)) {
    category = "Indian hair care market";
    size = "~₹30,000 Cr";
  } else if (/oral|tooth|mouth/.test(lower)) {
    category = "Indian oral care market";
    size = "~₹10,000 Cr";
  } else if (/food|snack|gut|nutrition|ready.?mix/.test(lower)) {
    category = "Indian packaged foods / health nutrition market";
    size = "~₹50,000 Cr+";
  } else if (/home|detergent|clean/.test(lower)) {
    category = "Indian home care market";
    size = "~₹25,000 Cr";
  }
  const trendBit = marketTrend ? ` Trend signal: ${marketTrend}` : "";
  return `${category}: ${size} (est.). Niche within this TAM depends on proposition strength.${trendBit}`;
}

export function enrichScorecardFields(parsed, idea) {
  const matrix = matrixScores(parsed);
  parsed.matrix = matrix;

  parsed.revenuePotentialCrores = resolveRevenueCrores(parsed);
  parsed.ideaWeight = classifyIdeaWeight(parsed.revenuePotentialCrores);
  parsed.revenuePotentialRange = formatRevenueFromCrores(parsed.revenuePotentialCrores);
  parsed.tamValuation = String(parsed.tamValuation || buildTamFallback(idea, parsed.market?.trend));
  if (!Array.isArray(parsed.categoryTags) || !parsed.categoryTags.length) {
    const words = idea.trim().split(/\s+/).slice(0, 2).join(" ");
    parsed.categoryTags = words ? [words] : ["FMCG", "NEW CONCEPT"];
  } else {
    parsed.categoryTags = parsed.categoryTags.map((t) => String(t)).slice(0, 4);
  }
  if (!parsed.categoryTags.length) parsed.categoryTags = ["FMCG", "NEW CONCEPT"];
  parsed.analysisSummary = String(
    parsed.analysisSummary ||
      [parsed.novelty?.rationale, parsed.market?.rationale].filter(Boolean).join(" ").slice(0, 300) ||
      parsed.oneLiner
  );
  parsed.refinementPivot = String(parsed.refinementPivot || parsed.improvements?.[0] || "");
  return parsed;
}

export function scoreToFive(score100) {
  return Math.max(1, Math.min(5, Math.round(score100 / 20) || 1));
}

export function statusOf(pts, maxPoints = 60) {
  const max = Number(maxPoints) > 0 ? Number(maxPoints) : 60;
  const approvedCut = (40 / 60) * max;
  const promisingCut = (30 / 60) * max;
  if (pts > approvedCut) return { key: "approved", label: "Approved" };
  if (pts >= promisingCut) return { key: "promising", label: "Promising" };
  return { key: "rejected", label: "Rejected" };
}

export function toneOf(pts, maxPoints = 60) {
  const st = statusOf(pts, maxPoints);
  if (st.key === "approved") return { key: "strong", color: "#24A866", word: "Clears the bar" };
  if (st.key === "promising") return { key: "moderate", color: "#C9A227", word: "Promising" };
  return { key: "weak", color: "#E45757", word: "Below the bar" };
}

export function trimInput(text, max = 2400) {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n[Input truncated for scoring — keep briefs under ~2400 characters.]";
}

export function friendlyParseError(err) {
  const kind = err?.failureKind || err?.cause?.failureKind;
  if (kind === "truncated") {
    return "The AI's answer was cut off before it finished — retrying usually fixes this, it isn't about your idea being too long.";
  }
  if (kind === "malformed") {
    return "The AI hit a tool-use hiccup formatting its answer — retrying should resolve it.";
  }
  const msg = err?.message ?? "";
  if (/claude api failed|gemini api failed/i.test(msg) && /image|media_type|base64|could not process/i.test(msg)) {
    return "The attached image could not be read. Try a JPG or PNG under 5 MB.";
  }
  if (/truncated|max_tokens|cut off before it finished/i.test(msg)) {
    return "The AI's answer was cut off before it finished — retrying usually fixes this, it isn't about your idea being too long.";
  }
  if (
    err?.name === "SyntaxError" ||
    /json|unexpected token|position|no json|tool-use hiccup|couldn't parse/i.test(msg)
  ) {
    return "The AI hit a tool-use hiccup formatting its answer — retrying should resolve it.";
  }
  return msg || "Couldn't parse the validation. Try running it again.";
}

function normalizeDim(dim, extraKey) {
  if (!dim[extraKey]) {
    dim[extraKey] = dim.edgeTrendGap ?? dim.edge ?? dim.trend ?? dim.gap ?? "";
  }
  return dim;
}

export function validateValidationResult(parsed) {
  for (const key of ["novelty", "market", "evidence"]) {
    const dim = parsed[key];
    if (!dim || dim.score == null) throw new Error(`Missing ${key} score`);
    dim.score = Math.min(100, Math.max(0, Number(dim.score) || 0));
    dim.rationale = String(dim.rationale ?? "");
    const extra = key === "novelty" ? "edge" : key === "market" ? "trend" : "gap";
    normalizeDim(dim, extra);
    dim[extra] = String(dim[extra] ?? "");
  }
  if (!Array.isArray(parsed.improvements)) parsed.improvements = [];
  parsed.improvements = parsed.improvements.map((s) => String(s)).slice(0, 5);
  parsed.oneLiner = String(parsed.oneLiner ?? "");
  parsed.tamValuation = String(parsed.tamValuation ?? "").trim();
  parsed.revenuePotentialCrores = resolveRevenueCrores(parsed);
  return parsed;
}

export function parseValidationJson(raw, meta = {}) {
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  if (meta.stopReason === "max_tokens") {
    console.error(
      `[primus/json-fail] scorecard stop_reason=max_tokens blocks=[${(meta.contentTypes || []).join(",")}] parser_input=${text}`
    );
    const err = new Error("truncated");
    err.failureKind = "truncated";
    throw err;
  }
  const attempts = [text];
  try {
    attempts.push(extractJsonObject(text));
  } catch (e) {
    if (/truncated/i.test(e?.message || "")) {
      console.error(
        `[primus/json-fail] scorecard stop_reason=${meta.stopReason ?? "null"} blocks=[${(meta.contentTypes || []).join(",")}] parser_input=${text}`
      );
      const err = new Error("truncated");
      err.failureKind = "truncated";
      err.cause = e;
      throw err;
    }
  }

  let lastErr;
  for (const candidate of attempts) {
    const variants = [candidate];
    try {
      variants.push(repairJson(candidate));
    } catch {
      /* skip */
    }
    try {
      variants.push(repairTruncatedJson(candidate));
    } catch {
      /* skip */
    }

    for (const jsonStr of variants) {
      try {
        const parsed = normalizeFlatResult(JSON.parse(jsonStr));
        return validateValidationResult(parsed);
      } catch (e) {
        lastErr = e;
      }
    }
  }

  const scraped = scrapeScoresFallback(text);
  if (scraped) {
    try {
      return validateValidationResult(normalizeFlatResult(scraped));
    } catch (e) {
      lastErr = e;
    }
  }
  console.error(
    `[primus/json-fail] scorecard stop_reason=${meta.stopReason ?? "null"} blocks=[${(meta.contentTypes || []).join(",")}] parser_input=${text}`
  );
  const err = lastErr || new Error("Couldn't parse the validation response.");
  err.failureKind = err.failureKind || "malformed";
  throw err;
}

export const SCORING_SYSTEM_PROMPT =
  "You are 6 Filter Test, CavinKare's product screening engine for the Indian FMCG market. " +
  "Use this brand-to-category map. Do not place a SKU on a brand that does not carry that line, " +
  "and do not reassign a named valid brand to a sibling (Nyle shampoo stays Nyle, not Chik):\n" +
  `${brandRosterForPrompt()}\n` +
  "A milkshake under Friva is a mis-home (Cavin's dairy, not Friva beverages) — call that out in the one-liner and treat novelty/market as a brand-architecture miss. " +
  "Score the idea on three 0-100 dimensions:\n" +
  "- novelty: genuine differentiation and 'right to win'. Reward truly novel formats, ingredients, or business models. Punish 'me-too'/commodity 'Red Ocean' ideas (<25).\n" +
  "- market: relevance to 2026 Indian consumer shifts. Reward strong alignment with any of: longevity & healthspan, gut-health & functional foods, sachet-economy & Tier-2/3 accessibility, Gen Z 'dopamine'/experiential, sustainability/refill-first, convenience/on-the-go, or solving a sharp pain point. Broad mass-relevant categories score high.\n" +
  "- evidence: strength of the 'reason to believe'. Reward stated pilots, sales feedback, clinical/ingredient proof; if none, score 20-45.\n" +
  "Be decisive and generous with clearly trend-aligned, differentiated, pain-point-solving concepts (novelty/market often 75-95). A vanilla commodity idea should land in the 1-25 range on novelty.\n" +
  "Round novelty, market, and evidence to the nearest 5 (0, 5, 10, … 100). The same idea text and numbers must produce the same scores.\n" +
  "Return ONE complete minified JSON object only:\n" +
  '{"novelty":85,"market":90,"evidence":60,' +
  '"noveltyRationale":"...","marketRationale":"...","evidenceRationale":"...",' +
  '"oneLiner":"one-line strategic critique of why it wins or fails",' +
  '"revenuePotentialCrores":0.3,"tamValuation":"India <category> ~Rs X Cr, growing at Y% CAGR",' +
  '"improvements":["refinement pivot a","b","c"],"edge":"sharpest differentiator","trend":"top trend it rides","gap":"biggest evidence gap"}. ' +
  "Keep every string under 120 ASCII characters. Return raw minified JSON only — no markdown fences, no commentary.";

export function buildValidationPayload(parsed, ideaText) {
  enrichScorecardFields(parsed, ideaText);
  const revenueInfo = revenueDisplayFor(parsed);
  parsed.revenuePotentialCrores = revenueInfo.crores;
  parsed.revenuePotentialRange = revenueInfo.label;
  parsed.ideaWeight = revenueInfo.weight;
  const phase1 = computePhase1(parsed);
  const weighted = phase1 / 0.6;
  const investmentGrid = buildInvestmentGrid(
    ideaText,
    revenueInfo.crores,
    parsed.tamValuation
  );
  return { ...parsed, weighted, phase1, idea: ideaText, investmentGrid };
}

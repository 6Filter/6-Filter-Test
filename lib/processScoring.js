/**
 * Process Idea Phase-1 scoring (40% of final).
 * Efficiency 50% · Feasibility 30% · Scalability 20%
 * Maximum Phase-1 score = 40 points.
 */

function dimScore(value, fallback = 40) {
  if (value == null) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "object" && value.score != null) {
    const n = Number(value.score);
    return Number.isFinite(n) ? n : fallback;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeProcessResult(obj) {
  if (!obj || typeof obj !== "object") {
    throw new Error("Model returned an empty process validation payload.");
  }

  const efficiencyObj = typeof obj.efficiency === "object" && obj.efficiency ? obj.efficiency : {};
  const feasibilityObj = typeof obj.feasibility === "object" && obj.feasibility ? obj.feasibility : {};
  const scalabilityObj = typeof obj.scalability === "object" && obj.scalability ? obj.scalability : {};

  return {
    efficiency: {
      score: dimScore(obj.efficiency, 40),
      rationale: String(
        efficiencyObj.rationale || obj.efficiencyRationale || "Assessed for time/cost reduction."
      ),
      lever: String(efficiencyObj.lever || obj.lever || "Clarify the main efficiency lever."),
    },
    feasibility: {
      score: dimScore(obj.feasibility, 40),
      rationale: String(
        feasibilityObj.rationale || obj.feasibilityRationale || "Assessed for ease of implementation."
      ),
      barrier: String(feasibilityObj.barrier || obj.barrier || "Name the biggest implementation barrier."),
    },
    scalability: {
      score: dimScore(obj.scalability, 40),
      rationale: String(
        scalabilityObj.rationale || obj.scalabilityRationale || "Assessed for cross-team applicability."
      ),
      reach: String(scalabilityObj.reach || obj.reach || "Define where this can scale next."),
    },
    improvements: Array.isArray(obj.improvements)
      ? obj.improvements.map((s) => String(s)).filter(Boolean).slice(0, 5)
      : ["Pilot on one team", "Define success metrics", "Reduce change friction"],
    oneLiner: String(obj.oneLiner || "A process concept that needs clearer efficiency proof."),
    estimatedEfficiencyGain: String(
      obj.estimatedEfficiencyGain || obj.efficiencyGainEstimate || "Estimate TBD"
    ),
    implementationEffort: String(obj.implementationEffort || "Medium"),
    applicabilityScope: String(obj.applicabilityScope || "Single team / pilot"),
    categoryTags: Array.isArray(obj.categoryTags)
      ? obj.categoryTags.map((t) => String(t)).filter(Boolean).slice(0, 4)
      : undefined,
    analysisSummary: obj.analysisSummary != null ? String(obj.analysisSummary) : undefined,
    refinementPivot: obj.refinementPivot != null ? String(obj.refinementPivot) : undefined,
  };
}

function scrapeProcessScoresFallback(raw) {
  const flatNum = (key) => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*(\\d+(?:\\.\\d+)?)`, "i"));
    return m ? Number(m[1]) : null;
  };
  const nestedNum = (key) => {
    const m = raw.match(new RegExp(`"${key}"\\s*:\\s*\\{[\\s\\S]*?"score"\\s*:\\s*(\\d+)`, "i"));
    return m ? Number(m[1]) : null;
  };
  const efficiency = nestedNum("efficiency") ?? flatNum("efficiency");
  const feasibility = nestedNum("feasibility") ?? flatNum("feasibility");
  const scalability = nestedNum("scalability") ?? flatNum("scalability");
  if (efficiency == null || feasibility == null || scalability == null) return null;

  const pull = (re, fallback = "") => {
    const m = raw.match(re);
    return m ? m[1].trim() : fallback;
  };
  return {
    efficiency,
    feasibility,
    scalability,
    oneLiner: pull(/"oneLiner"\s*:\s*"([^"]*)"/i, "A process idea that needs sharper definition."),
    estimatedEfficiencyGain: pull(/"estimatedEfficiencyGain"\s*:\s*"([^"]*)"/i, "Estimate TBD"),
    implementationEffort: pull(/"implementationEffort"\s*:\s*"([^"]*)"/i, "Medium"),
    applicabilityScope: pull(/"applicabilityScope"\s*:\s*"([^"]*)"/i, "Pilot"),
    improvements: ["Pilot on one team", "Define KPIs", "Map change impact"],
    lever: pull(/"lever"\s*:\s*"([^"]*)"/i, "Clarify the efficiency lever."),
    barrier: pull(/"barrier"\s*:\s*"([^"]*)"/i, "Name the main barrier."),
    reach: pull(/"reach"\s*:\s*"([^"]*)"/i, "Define scale path."),
  };
}

export function validateProcessResult(parsed) {
  for (const key of ["efficiency", "feasibility", "scalability"]) {
    const dim = parsed[key];
    if (!dim || dim.score == null) throw new Error(`Missing ${key} score`);
    dim.score = Math.min(100, Math.max(0, Number(dim.score) || 0));
    dim.rationale = String(dim.rationale ?? "");
  }
  if (!Array.isArray(parsed.improvements)) parsed.improvements = [];
  parsed.improvements = parsed.improvements.map((s) => String(s)).slice(0, 5);
  parsed.oneLiner = String(parsed.oneLiner ?? "");
  parsed.estimatedEfficiencyGain = String(parsed.estimatedEfficiencyGain ?? "Estimate TBD");
  parsed.implementationEffort = String(parsed.implementationEffort ?? "Medium");
  parsed.applicabilityScope = String(parsed.applicabilityScope ?? "Pilot");
  return parsed;
}

export function parseProcessValidationJson(raw, helpers) {
  const { extractJsonObject, repairJson, repairTruncatedJson } = helpers;
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  const attempts = [text];
  try {
    attempts.push(extractJsonObject(text));
  } catch {
    /* fall through */
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
        const parsed = normalizeProcessResult(JSON.parse(jsonStr));
        return validateProcessResult(parsed);
      } catch (e) {
        lastErr = e;
      }
    }
  }

  const scraped = scrapeProcessScoresFallback(text);
  if (scraped) {
    try {
      return validateProcessResult(normalizeProcessResult(scraped));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Couldn't parse the process validation response.");
}

/** Phase-1 process score out of 40. */
export function computeProcessPhase1(parsed) {
  const weighted =
    parsed.efficiency.score * 0.5 +
    parsed.feasibility.score * 0.3 +
    parsed.scalability.score * 0.2;
  return weighted * 0.4;
}

export function scoreToFive(score100) {
  return Math.max(1, Math.min(5, Math.round(Number(score100) / 20) || 1));
}

export function enrichProcessScorecardFields(parsed, idea) {
  parsed.matrix = {
    efficiency: scoreToFive(parsed.efficiency.score),
    feasibility: scoreToFive(parsed.feasibility.score),
    scalability: scoreToFive(parsed.scalability.score),
  };
  if (!Array.isArray(parsed.categoryTags) || !parsed.categoryTags.length) {
    const words = String(idea || "").trim().split(/\s+/).slice(0, 2).join(" ");
    parsed.categoryTags = words ? [words] : ["PROCESS", "OPS"];
  } else {
    parsed.categoryTags = parsed.categoryTags.map((t) => String(t)).slice(0, 4);
  }
  parsed.analysisSummary = String(
    parsed.analysisSummary ||
      [parsed.efficiency?.rationale, parsed.feasibility?.rationale].filter(Boolean).join(" ").slice(0, 300) ||
      parsed.oneLiner
  );
  parsed.refinementPivot = String(parsed.refinementPivot || parsed.improvements?.[0] || "");
  return parsed;
}

export function buildProcessValidationPayload(parsed, ideaText) {
  enrichProcessScorecardFields(parsed, ideaText);
  const phase1 = computeProcessPhase1(parsed);
  const weighted = phase1 / 0.4;
  return {
    ...parsed,
    ideaType: "process",
    phase1Max: 40,
    weighted,
    phase1,
    idea: ideaText,
    // Keep product-shaped keys null so UI can branch cleanly
    novelty: null,
    market: null,
    evidence: null,
    investmentGrid: null,
    revenuePotentialCrores: null,
    ideaWeight: null,
  };
}

export const PROCESS_SCORING_SYSTEM_PROMPT =
  "You are Primus, CavinKare's Process Validation Architect for internal operating / Luminar-style process ideas. " +
  "Score the process idea on three 0-100 dimensions for Phase-1 LLM validation:\n" +
  "- efficiency: estimated time/cost reduction. Reward clear, measurable savings (hours, rupees, cycle-time). Vague 'efficiency' claims score 20-40.\n" +
  "- feasibility: ease of implementation with current tools, skills, and change load. Reward low-friction pilots; punish heavy IT/org overhauls without a path.\n" +
  "- scalability: applicability across teams/projects. Reward reusable playbooks; punish one-off local hacks.\n" +
  "Be decisive. Strong, measurable, easily piloted process ideas often land 75-95 on efficiency/feasibility. " +
  "Hand-wavy process theatre should score low on efficiency.\n" +
  "Return ONE complete minified JSON object only:\n" +
  '{"efficiency":80,"feasibility":70,"scalability":65,' +
  '"efficiencyRationale":"...","feasibilityRationale":"...","scalabilityRationale":"...",' +
  '"oneLiner":"one-line critique of why the process wins or fails",' +
  '"estimatedEfficiencyGain":"e.g. 20% cycle-time cut / 4 hrs per week",' +
  '"implementationEffort":"Low|Medium|High",' +
  '"applicabilityScope":"e.g. Sales ops + Finance",' +
  '"improvements":["pilot step a","b","c"],"lever":"main efficiency lever","barrier":"biggest barrier","gap":"reach note"}. ' +
  "Keep every string under 120 ASCII characters. Return raw minified JSON only — no markdown fences, no commentary.";

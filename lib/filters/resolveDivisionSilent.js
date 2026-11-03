import { brandRosterForPrompt } from "../ckBrands.js";
import { detectDivision } from "../npdMaster.js";
import { LOCKED_DIVISION_NAMES } from "../lockedConstants.js";
import {
  INTERNATIONAL_BUSINESS,
  lockedDivisionNamesExcludingIb,
} from "../divisionMargin.js";
import { divisionDefinitionsPromptBlock } from "../divisionDefinitions.js";
import { researchThenJson } from "../llmJson.js";
import { trimInput } from "../scoring.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"division":null,"reason":"one sentence","confidence":"high"}';

/**
 * AI-first division classifier (Part 126). Keywords are a cross-check only.
 */
async function runDivisionAi(text, { allowedNames = LOCKED_DIVISION_NAMES } = {}) {
  const idea = trimInput(String(text || ""), 1600);
  if (!idea.trim()) {
    return { division: null, reason: "No idea text to classify.", confidence: "low" };
  }

  const options = [...allowedNames];
  const allowed = new Set(options);
  const defs = divisionDefinitionsPromptBlock();

  const researchSystem =
    "You classify a CavinKare FMCG idea into EXACTLY ONE division for margin screening.\n\n" +
    `${brandRosterForPrompt()}\n\n` +
    `Divisions (exact names only):\n${options.join(", ")}\n\n` +
    `Definitions:\n${defs}\n\n` +
    "Pick the single best division, or say none if you would have to guess.\n" +
    "Prefer null over a weak nearest match. Use web_search only if the category is unclear.\n" +
    "Write a short research brief in prose (not JSON).";

  const { parsed, error } = await researchThenJson({
    label: "division-ai-first",
    researchSystem,
    researchUser: `PRODUCT IDEA / CATEGORY:\n${idea}`,
    jsonSystem:
      "You are the structuring step for division classification. Do not search.\n" +
      "division must be exactly one of the configured division names, or null.\n" +
      "confidence must be high, medium, or low. Use low when the brief is uncertain.\n" +
      "If the research says new / uncovered / guessy, division must be null and confidence low.\n" +
      STRUCTURE_SYSTEM,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 2048,
    jsonMaxTokens: 512,
    maxUses: 3,
  });

  if (!parsed) {
    console.warn(`[primus/division] AI classify failed error=${error || "empty"}`);
    return {
      division: null,
      reason: "Division could not be determined automatically.",
      confidence: "low",
    };
  }

  const raw = parsed.division;
  const division =
    typeof raw === "string" && allowed.has(raw.trim()) ? raw.trim() : null;
  const confRaw = String(parsed.confidence || "").trim().toLowerCase();
  const confidence = ["high", "medium", "low"].includes(confRaw) ? confRaw : "low";
  const reason =
    String(parsed.reason || "").trim() ||
    (division ? `Matched to ${division}.` : "No automatic division label.");

  return { division, reason, confidence };
}

async function resolveRespectiveDivision(text) {
  const names = lockedDivisionNamesExcludingIb();
  try {
    const ai = await runDivisionAi(text, { allowedNames: names });
    if (ai.division && names.includes(ai.division)) {
      return {
        respectiveDivision: ai.division,
        respectiveSource: "ai",
        respectiveReason: ai.reason || `AI matched respective division ${ai.division}.`,
        respectiveConfidence: ai.confidence || "medium",
      };
    }
  } catch (e) {
    console.warn(`[primus/division] respective AI threw: ${e.message || e}`);
  }
  const stripped = String(text || "")
    .replace(/\b(export|overseas|international|gcc|middle east)\b/gi, " ")
    .trim();
  const retry = detectDivision(stripped);
  if (retry && retry !== INTERNATIONAL_BUSINESS && names.includes(retry)) {
    return {
      respectiveDivision: retry,
      respectiveSource: "rules",
      respectiveReason: `Keyword cross-check for respective division: ${retry}`,
      respectiveConfidence: "medium",
    };
  }
  return {
    respectiveDivision: null,
    respectiveSource: "none",
    respectiveReason: "Could not determine the product's respective division for International Business.",
    respectiveConfidence: "low",
  };
}

function detectionPayload(fields) {
  return {
    division: fields.division || null,
    source: fields.source || "none",
    reason: fields.reason || "",
    confidence: fields.confidence || null,
    needsConfirmation: Boolean(fields.needsConfirmation),
    rulesDivision: fields.rulesDivision ?? null,
    respectiveDivision: fields.respectiveDivision || null,
    respectiveSource: fields.respectiveSource || null,
    respectiveReason: fields.respectiveReason || null,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * AI-first; keyword rules as cross-check.
 * Agree → store. Disagree or AI low confidence → store AI, needsConfirmation.
 * Optional aiClassify inject for tests (returns { division, reason, confidence }).
 */
export async function resolveDivisionSilently({
  ideaDescription = "",
  category = "",
  name = "",
  aiClassify = null,
} = {}) {
  const text = `${name || ""}\n${ideaDescription || ""}\n${category || ""}`.trim();
  const rulesDivision = detectDivision(text) || null;

  console.log("[primus/division] resolveDivisionSilently AI-first");
  let ai;
  try {
    ai =
      typeof aiClassify === "function"
        ? await aiClassify(text)
        : await runDivisionAi(text, { allowedNames: LOCKED_DIVISION_NAMES });
  } catch (e) {
    console.warn(`[primus/division] AI threw: ${e.message || e}`);
    if (rulesDivision) {
      const detection = detectionPayload({
        division: rulesDivision,
        source: "rules",
        reason: `AI failed; keyword fallback: ${rulesDivision}`,
        confidence: "low",
        needsConfirmation: true,
        rulesDivision,
      });
      return {
        division: rulesDivision,
        source: "rules",
        reason: detection.reason,
        confidence: "low",
        needsConfirmation: true,
        respectiveDivision: null,
        divisionDetection: detection,
      };
    }
    return {
      division: null,
      source: "none",
      reason: "Division AI match failed — research continues without a division.",
      confidence: "low",
      needsConfirmation: true,
      respectiveDivision: null,
      divisionDetection: detectionPayload({
        division: null,
        source: "none",
        reason: "Division AI match failed — research continues without a division.",
        confidence: "low",
        needsConfirmation: true,
        rulesDivision,
      }),
    };
  }

  const aiDivision = ai?.division || null;
  const confidence = ai?.confidence || "low";
  const agree =
    Boolean(aiDivision) && Boolean(rulesDivision) && aiDivision === rulesDivision;
  const disagree =
    Boolean(aiDivision) && Boolean(rulesDivision) && aiDivision !== rulesDivision;
  // Confirm only when rules disagree with AI, or AI confidence is low.
  const needsConfirmation = Boolean(aiDivision) && (disagree || confidence === "low");

  let source = "ai";
  let division = aiDivision;
  let reason = ai?.reason || "";
  if (agree) {
    source = "ai";
    reason = `${ai?.reason || `Matched ${aiDivision}.`} (rules agree)`;
  } else if (!aiDivision && rulesDivision) {
    // AI abstained — do not invent from rules alone for Part 126 primary path; mark pending
    division = null;
    source = "none";
    reason = `AI returned null (rules suggested ${rulesDivision}).`;
  }

  if (division === INTERNATIONAL_BUSINESS) {
    const resp = await resolveRespectiveDivision(text);
    const detection = detectionPayload({
      division,
      source,
      reason,
      confidence,
      needsConfirmation: needsConfirmation || !resp.respectiveDivision,
      rulesDivision,
      respectiveDivision: resp.respectiveDivision,
      respectiveSource: resp.respectiveSource,
      respectiveReason: resp.respectiveReason,
    });
    if (!resp.respectiveDivision) {
      return {
        division: null,
        source: "none",
        reason: resp.respectiveReason,
        confidence: "low",
        needsConfirmation: true,
        respectiveDivision: null,
        divisionDetection: detection,
      };
    }
    return {
      division,
      source,
      reason,
      confidence,
      needsConfirmation: detection.needsConfirmation,
      respectiveDivision: resp.respectiveDivision,
      divisionDetection: detection,
    };
  }

  const detection = detectionPayload({
    division,
    source: division ? source : "none",
    reason,
    confidence: division ? confidence : "low",
    needsConfirmation: division ? needsConfirmation : Boolean(rulesDivision) || true,
    rulesDivision,
  });

  console.log(
    `[primus/division] resolveDivisionSilently source=${detection.source} division=${division || "null"} needsConfirmation=${detection.needsConfirmation}`
  );

  return {
    division,
    source: detection.source,
    reason,
    confidence: detection.confidence,
    needsConfirmation: detection.needsConfirmation,
    respectiveDivision: null,
    divisionDetection: detection,
  };
}

import { brandRosterForPrompt } from "../ckBrands.js";
import { detectDivision } from "../npdMaster.js";
import { LOCKED_DIVISION_NAMES } from "../lockedConstants.js";
import {
  INTERNATIONAL_BUSINESS,
  lockedDivisionNamesExcludingIb,
} from "../divisionMargin.js";
import { researchThenJson } from "../llmJson.js";
import { trimInput } from "../scoring.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"division":null,"reason":"one sentence"}';

/**
 * AI fallback — only when detectDivision finds nothing.
 * Never force a nearest-sounding match. Names must be exact locked table names.
 */
async function runDivisionFallback(text, { allowedNames = LOCKED_DIVISION_NAMES } = {}) {
  const idea = trimInput(String(text || ""), 1600);
  if (!idea.trim()) {
    return { division: null, reason: "No idea text to classify." };
  }

  const options = [...allowedNames];
  const allowed = new Set(options);
  const listLabel = options.length === 11 ? "The eleven divisions" : "The configured divisions";

  const researchSystem =
    "You are matching a product idea to CavinKare's actual divisions for margin/revenue screening.\n\n" +
    `${brandRosterForPrompt()}\n\n` +
    `${listLabel}: ${options.join(", ")}.\n\n` +
    "Given this product idea, which ONE division does it most plausibly belong to — if any genuinely does?\n" +
    "Only name a division when a CavinKare brand or category on the roster above already carries this kind of product.\n" +
    "Do NOT invent a fit from shared infrastructure (e.g. cold chain for meat), adjacent categories, or nearest-sounding names.\n" +
    "If none are a reasonable fit, say so plainly. Use web_search only if the commercial category isn't obvious from the text.\n" +
    "Write a short research brief in prose (not JSON).";

  const { parsed, error } = await researchThenJson({
    label: "division-silent",
    researchSystem,
    researchUser: `PRODUCT IDEA / CATEGORY:\n${idea}`,
    jsonSystem:
      "You are the structuring step for silent division resolution. Do not search.\n" +
      "division must be exactly one of the configured division names, or null. Never invent a near miss.\n" +
      "If the research says this is a new / uncovered category, division must be null.\n" +
      STRUCTURE_SYSTEM,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 2048,
    jsonMaxTokens: 512,
    maxUses: 3,
  });

  if (!parsed) {
    console.warn(`[primus/division] AI fallback failed error=${error || "empty"}`);
    return {
      division: null,
      reason: "Division could not be determined automatically.",
    };
  }

  const raw = parsed.division;
  const division =
    typeof raw === "string" && allowed.has(raw.trim()) ? raw.trim() : null;
  const reason = String(parsed.reason || "").trim() ||
    (division
      ? `Matched to ${division}.`
      : "No automatic division label — use the category recorded on the form.");

  return { division, reason };
}

async function resolveRespectiveDivision(text) {
  const names = lockedDivisionNamesExcludingIb();
  const detected = detectDivision(text);
  if (detected && detected !== INTERNATIONAL_BUSINESS && names.includes(detected)) {
    return {
      respectiveDivision: detected,
      respectiveSource: "rule",
      respectiveReason: `Keyword match for respective division: ${detected}`,
    };
  }
  // Strip export cues so the second pass can see the product category.
  const stripped = String(text || "")
    .replace(/\b(export|overseas|international|gcc|middle east)\b/gi, " ")
    .trim();
  const retry = detectDivision(stripped);
  if (retry && retry !== INTERNATIONAL_BUSINESS && names.includes(retry)) {
    return {
      respectiveDivision: retry,
      respectiveSource: "rule",
      respectiveReason: `Keyword match (sans export cues): ${retry}`,
    };
  }
  try {
    const ai = await runDivisionFallback(stripped || text, { allowedNames: names });
    if (ai.division && names.includes(ai.division)) {
      return {
        respectiveDivision: ai.division,
        respectiveSource: "ai",
        respectiveReason: ai.reason || `AI matched respective division ${ai.division}.`,
      };
    }
  } catch (e) {
    console.warn(`[primus/division] respective AI threw: ${e.message || e}`);
  }
  return {
    respectiveDivision: null,
    respectiveSource: "none",
    respectiveReason: "Could not determine the product's respective division for International Business.",
  };
}

function detectionPayload({
  division,
  source,
  reason,
  respectiveDivision = null,
  respectiveSource = null,
  respectiveReason = null,
}) {
  return {
    division: division || null,
    source: source || "none",
    reason: reason || "",
    respectiveDivision: respectiveDivision || null,
    respectiveSource: respectiveSource || null,
    respectiveReason: respectiveReason || null,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * Deterministic keyword pass first; AI only if that returns null.
 * International Business triggers a second pass for the respective product division.
 * @returns {{
 *   division: string|null,
 *   source: "rule"|"ai"|"none",
 *   reason?: string,
 *   respectiveDivision?: string|null,
 *   divisionDetection?: object
 * }}
 */
export async function resolveDivisionSilently({ ideaDescription = "", category = "" } = {}) {
  const text = `${ideaDescription || ""}\n${category || ""}`.trim();
  const detected = detectDivision(text);
  if (detected) {
    console.log(`[primus/division] resolveDivisionSilently source=rule division=${detected}`);
    if (detected === INTERNATIONAL_BUSINESS) {
      const resp = await resolveRespectiveDivision(text);
      const detection = detectionPayload({
        division: detected,
        source: "rule",
        reason: `Keyword match: ${detected}`,
        respectiveDivision: resp.respectiveDivision,
        respectiveSource: resp.respectiveSource,
        respectiveReason: resp.respectiveReason,
      });
      if (!resp.respectiveDivision) {
        console.log("[primus/division] IB without respective — treat as unmatched");
        return {
          division: null,
          source: "none",
          reason: resp.respectiveReason,
          respectiveDivision: null,
          divisionDetection: detection,
        };
      }
      return {
        division: detected,
        source: "rule",
        reason: detection.reason,
        respectiveDivision: resp.respectiveDivision,
        divisionDetection: detection,
      };
    }
    return {
      division: detected,
      source: "rule",
      reason: `Keyword match: ${detected}`,
      respectiveDivision: null,
      divisionDetection: detectionPayload({
        division: detected,
        source: "rule",
        reason: `Keyword match: ${detected}`,
      }),
    };
  }

  console.log("[primus/division] resolveDivisionSilently keyword=null — running AI fallback");
  let fallback;
  try {
    fallback = await runDivisionFallback(text, { allowedNames: LOCKED_DIVISION_NAMES });
  } catch (e) {
    console.warn(`[primus/division] AI fallback threw: ${e.message || e}`);
    return {
      division: null,
      source: "none",
      reason: "Division AI match failed — research continues without a division.",
      respectiveDivision: null,
      divisionDetection: detectionPayload({
        division: null,
        source: "none",
        reason: "Division AI match failed — research continues without a division.",
      }),
    };
  }
  if (fallback?.division) {
    console.log(
      `[primus/division] resolveDivisionSilently source=ai division=${fallback.division}`
    );
    if (fallback.division === INTERNATIONAL_BUSINESS) {
      const resp = await resolveRespectiveDivision(text);
      const detection = detectionPayload({
        division: fallback.division,
        source: "ai",
        reason: fallback.reason,
        respectiveDivision: resp.respectiveDivision,
        respectiveSource: resp.respectiveSource,
        respectiveReason: resp.respectiveReason,
      });
      if (!resp.respectiveDivision) {
        return {
          division: null,
          source: "none",
          reason: resp.respectiveReason,
          respectiveDivision: null,
          divisionDetection: detection,
        };
      }
      return {
        division: fallback.division,
        source: "ai",
        reason: fallback.reason,
        respectiveDivision: resp.respectiveDivision,
        divisionDetection: detection,
      };
    }
    return {
      division: fallback.division,
      source: "ai",
      reason: fallback.reason,
      respectiveDivision: null,
      divisionDetection: detectionPayload({
        division: fallback.division,
        source: "ai",
        reason: fallback.reason,
      }),
    };
  }

  console.log("[primus/division] resolveDivisionSilently source=none");
  const reason =
    fallback?.reason ||
    "No automatic division label — use the category recorded on the form.";
  return {
    division: null,
    source: "none",
    reason,
    respectiveDivision: null,
    divisionDetection: detectionPayload({ division: null, source: "none", reason }),
  };
}

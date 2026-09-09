import { brandRosterForPrompt } from "../ckBrands.js";
import { detectDivision } from "../npdMaster.js";
import { getDivisionOptions } from "../divisionConfig.js";
import { researchThenJson } from "../llmJson.js";
import { trimInput } from "../scoring.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"division":null,"reason":"one sentence"}';

/**
 * AI fallback — only when detectDivision finds nothing.
 * Never force a nearest-sounding match.
 */
async function runDivisionFallback(text) {
  const idea = trimInput(String(text || ""), 1600);
  if (!idea.trim()) {
    return { division: null, reason: "No idea text to classify." };
  }

  const options = await getDivisionOptions();
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

/**
 * Deterministic keyword pass first; AI only if that returns null.
 * Callers must skip this entirely when proposition.division is already set —
 * this function never reads the stored division; locking happens at the caller.
 * @returns {{ division: string|null, source: "keyword"|"ai"|"none", reason?: string }}
 */
export async function resolveDivisionSilently({ ideaDescription = "", category = "" } = {}) {
  const text = `${ideaDescription || ""}\n${category || ""}`.trim();
  const detected = detectDivision(text);
  if (detected) {
    console.log(`[primus/division] resolveDivisionSilently source=keyword division=${detected}`);
    return { division: detected, source: "keyword", reason: `Keyword match: ${detected}` };
  }

  console.log("[primus/division] resolveDivisionSilently keyword=null — running AI fallback");
  let fallback;
  try {
    fallback = await runDivisionFallback(text);
  } catch (e) {
    console.warn(`[primus/division] AI fallback threw: ${e.message || e}`);
    return {
      division: null,
      source: "none",
      reason: "Division AI match failed — research continues without a division.",
    };
  }
  if (fallback?.division) {
    console.log(
      `[primus/division] resolveDivisionSilently source=ai division=${fallback.division}`
    );
    return { division: fallback.division, source: "ai", reason: fallback.reason };
  }

  console.log("[primus/division] resolveDivisionSilently source=none");
  return {
    division: null,
    source: "none",
    reason:
      fallback?.reason ||
      "No automatic division label — use the category recorded on the form.",
  };
}

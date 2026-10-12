import { researchThenJson } from "../llmJson.js";
import { mergeSources } from "./parseFilterJson.js";
import { sixFilterChecklistSystem, SOURCE_HIERARCHY_INSTRUCTION } from "../skills/loadSkill.js";
import { withCategoryScope, maxUsesForMatch } from "../categoryScopedResearch.js";
import { buildStepEvidence, mergeEvidence } from "../evidenceProvenance.js";
import { getResearchCache, saveResearchCache } from "../db.js";
import { fingerprintNoCompetitor, logResearchCacheLookup } from "../researchCache.js";
import { isClaimingNoCompetitor } from "../filterChecks.js";

const STRUCTURE_SYSTEM =
  "Return ONLY minified JSON:\n" +
  '{"majorCompetitorsFound":["Brand A","Brand B"],"searchSummary":"one sentence","sources":[{"title":"...","url":"..."}]}';

const NO_COMPETITOR_PROMPT =
  "Research whether genuine, established, major brand competitors exist for this product idea in its category. Apply the " +
  "six-filter-test skill's source hierarchy. Report every credible major competitor by name — don't undercount to be " +
  "generous, and don't overcount a minor, unclear, or barely-relevant brand as a genuine competitor.\n" +
  "A genuine major competitor is a currently-selling, established brand in this exact category in India — not a " +
  "private-label, not a one-off Amazon listing, not an adjacent category, not a regional unknown with no retail presence.\n" +
  "If you find only one weak, ambiguous, or barely-relevant match, leave it out of majorCompetitorsFound.\n" +
  STRUCTURE_SYSTEM;

function normalizeCheck(parsed, sources = []) {
  const names = (Array.isArray(parsed?.majorCompetitorsFound) ? parsed.majorCompetitorsFound : [])
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return {
    majorCompetitorsFound: unique,
    searchSummary: String(parsed?.searchSummary || "").trim() || "competitor search complete",
    sources: mergeSources(parsed?.sources, sources),
  };
}

export async function runNoCompetitorCheck({ ideaDescription, category } = {}) {
  const researchSystem = sixFilterChecklistSystem(
    SOURCE_HIERARCHY_INSTRUCTION + "\n\n" + NO_COMPETITOR_PROMPT
  );
  const { text: userText, nielsenMatchedOn, kantarMatchedOn, nielsenAsOf, kantarAsOf } = await withCategoryScope(
    `PRODUCT IDEA:\n${String(ideaDescription || "").slice(0, 1600)}\n\n` +
      `CATEGORY: ${String(category || "").trim() || "(infer from the idea)"}\n` +
      "Name every genuine, established, major brand competitor currently selling in this category in India. " +
      "Do not pad the list with minor, unclear, or barely-relevant brands.",
    {
      category,
      baseQuery: "major brand competitors established",
      label: "no-competitor",
    }
  );

  const { parsed, sources, error, searchesUsed } = await researchThenJson({
    label: "no-competitor",
    researchSystem,
    researchUser: userText,
    jsonSystem:
      "You are the structuring step for the no-competitor check. Do not search. " +
      "Use only the research brief. Include only genuine major competitors. " +
      STRUCTURE_SYSTEM,
    jsonUserSuffix: STRUCTURE_SYSTEM,
    researchMaxTokens: 3072,
    jsonMaxTokens: 2048,
    maxUses: maxUsesForMatch(nielsenMatchedOn, kantarMatchedOn, 4),
  });

  if (!parsed) {
    console.warn(`[primus/no-competitor] no structured result error=${error || "unknown"}`);
    return null;
  }
  const check = normalizeCheck(parsed, sources);
  check.evidence = buildStepEvidence({
    nielsenMatchedOn,
    kantarMatchedOn,
    nielsenAsOf,
    kantarAsOf,
    searchesUsed,
    sources,
    asOf: new Date().toISOString(),
  });
  console.log(
    `[primus/no-competitor] category=${category || "(none)"} majors=${check.majorCompetitorsFound.length} ` +
      `names=${check.majorCompetitorsFound.join("|") || "(none)"}`
  );
  return check;
}

export async function getOrRunNoCompetitorCheck({
  ideaDescription = "",
  category = "",
  forceFresh = false,
} = {}) {
  const hash = fingerprintNoCompetitor({ ideaDescription, category });
  if (!forceFresh) {
    try {
      const cached = await getResearchCache(hash);
      const check = cached?.researchFindings?.f1?.noCompetitorCheck;
      logResearchCacheLookup(hash, check ? cached : null);
      if (check && Array.isArray(check.majorCompetitorsFound)) return check;
    } catch (e) {
      console.warn(`[primus/no-competitor] cache lookup failed: ${e.message || e}`);
    }
  } else {
    logResearchCacheLookup(hash, null);
  }

  const check = await runNoCompetitorCheck({ ideaDescription, category });
  if (check) {
    try {
      await saveResearchCache(hash, { researchFindings: { f1: { noCompetitorCheck: check } } });
    } catch (e) {
      console.warn(`[primus/no-competitor] cache save failed: ${e.message || e}`);
    }
  }
  return check;
}

export async function attachNoCompetitorCheck(proposition = {}, findings = {}, { forceFresh = false } = {}) {
  const f1Findings = findings?.f1 && typeof findings.f1 === "object" ? findings.f1 : {};
  if (!isClaimingNoCompetitor(proposition?.f1, f1Findings)) {
    console.log(
      `[primus/no-competitor] skip verified=${f1Findings.benchmarkVerified === true} ` +
        `gap=${proposition?.f1?.declaredGap ?? "(blank)"} benchmark=${String(proposition?.f1?.benchmark || "").slice(0, 80)}`
    );
    return findings;
  }
  console.log(
    `[primus/no-competitor] run gap=${proposition?.f1?.declaredGap ?? "(blank)"} ` +
      `verified=${f1Findings.benchmarkVerified === true} ` +
      `benchmark=${String(proposition?.f1?.benchmark || "").slice(0, 80) || "(empty)"}`
  );
  const check = await getOrRunNoCompetitorCheck({
    ideaDescription: proposition.ideaDescription || "",
    category: proposition.category || "",
    forceFresh,
  });
  if (!check) return findings;
  return {
    ...findings,
    f1: {
      ...f1Findings,
      noCompetitorCheck: check,
      evidence: mergeEvidence([f1Findings.evidence, check.evidence]),
    },
  };
}

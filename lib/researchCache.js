import { createHash } from "node:crypto";

/** Bump when Filter 1–4 research inputs or payload shape change so stale caches miss. */
export const RESEARCH_SCHEMA_VERSION = "f1-benchmark-v6";

function normalizeResearchText(v) {
  return String(v || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Hash every field that actually feeds research. COGS / margin / GST stay out —
 * they change arithmetic, not what gets searched. AI prose (growth argument)
 * stays out so a rewrite does not fragment the cache.
 */
export function fingerprintResearchInput({
  ideaDescription,
  category,
  benchmark,
  attribute1,
  attribute2,
  attribute3,
  division,
  isPureCommodity,
  attachmentHash,
} = {}) {
  const normalized = [
    RESEARCH_SCHEMA_VERSION,
    normalizeResearchText(ideaDescription),
    normalizeResearchText(category),
    normalizeResearchText(benchmark),
    normalizeResearchText(attribute1),
    normalizeResearchText(attribute2),
    normalizeResearchText(attribute3),
    normalizeResearchText(division),
    Boolean(isPureCommodity),
    attachmentHash || "",
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function fingerprintNoCompetitor({ ideaDescription, category } = {}) {
  const normalized = [
    "no-competitor-v1",
    normalizeResearchText(ideaDescription),
    normalizeResearchText(category),
  ].join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

export function hashAttachment(attachment) {
  const data = attachment?.data;
  if (data == null || data === "") return "";
  return createHash("sha256").update(String(data)).digest("hex");
}

export function wrapResearchCachePayload({
  researchFindings = {},
  suggestions = null,
  sources = [],
  notCovered = [],
  filterNarratives = null,
  narrativeChecksHash = "",
} = {}) {
  return {
    researchFindings,
    suggestions,
    sources: Array.isArray(sources) ? sources : [],
    notCovered: Array.isArray(notCovered) ? notCovered : [],
    filterNarratives:
      filterNarratives && typeof filterNarratives === "object" ? filterNarratives : null,
    narrativeChecksHash: String(narrativeChecksHash || ""),
  };
}

export function unwrapResearchCachePayload(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const extras = {
    filterNarratives:
      parsed.filterNarratives && typeof parsed.filterNarratives === "object"
        ? parsed.filterNarratives
        : null,
    narrativeChecksHash: String(parsed.narrativeChecksHash || ""),
  };
  if (parsed.researchFindings && typeof parsed.researchFindings === "object") {
    return {
      researchFindings: parsed.researchFindings,
      suggestions: parsed.suggestions || null,
      sources: Array.isArray(parsed.sources) ? parsed.sources : parsed.researchFindings.sources || [],
      notCovered: parsed.notCovered || null,
      ...extras,
    };
  }
  return {
    researchFindings: parsed,
    suggestions: null,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    notCovered: null,
    ...extras,
  };
}

export function researchHashFor(doc = {}) {
  const f1 = doc.f1 && typeof doc.f1 === "object" ? doc.f1 : {};
  return fingerprintResearchInput({
    ideaDescription: doc.ideaDescription,
    category: doc.category,
    benchmark: f1.benchmark,
    attribute1: f1.declaredAttribute,
    attribute2: f1.declaredAttribute2,
    attribute3: f1.declaredAttribute3,
    division: doc.division,
    isPureCommodity: Boolean(f1.pureCommodity),
    attachmentHash: hashAttachment(doc.attachment),
  });
}

export function researchCacheResultLabel(cached) {
  return cached ? "HIT" : "MISS";
}

/** Log every research-cache lookup. Identical research inputs must print HIT. */
export function logResearchCacheLookup(hash, cached) {
  console.log(`[primus/research-cache] hash=${hash} result=${researchCacheResultLabel(cached)}`);
}

/** Bump when the narrative prompt changes so cached prose regenerates. */
export const NARRATIVE_PROMPT_VERSION = 5;

export function fingerprintNarrativeInputs({
  advisoryChecks = {},
  researchFindings = {},
  extras = {},
} = {}) {
  const slice = {
    promptVersion: NARRATIVE_PROMPT_VERSION,
    f1: advisoryChecks.f1 || null,
    f2: advisoryChecks.f2 || null,
    f3: advisoryChecks.f3 || null,
    f4: advisoryChecks.f4 || null,
    researchFindings: researchFindings || null,
    extras: {
      competitiveNote: extras.competitiveNote || "",
      obsolescenceVerdict: extras.obsolescenceVerdict || "",
      benchmarkEvidence: extras.benchmarkEvidence || "",
      categorySizeEvidence: extras.categorySizeEvidence || "",
    },
  };
  return createHash("sha256").update(JSON.stringify(slice)).digest("hex");
}

export function logScoringTrace({
  propositionId,
  hash,
  division,
  providerUsed,
  researchFindings,
  cache = "miss",
}) {
  console.log(
    `[primus/scoring-trace] proposition=${propositionId} hash=${hash} division=${division || ""} ` +
      `providerUsed=${providerUsed || ""} cache=${cache} findings=${JSON.stringify(researchFindings || null)}`
  );
}

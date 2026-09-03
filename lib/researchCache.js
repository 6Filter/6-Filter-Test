import { createHash } from "node:crypto";

/** Bump when Filter 1–4 research inputs or payload shape change so stale caches miss. */
export const RESEARCH_SCHEMA_VERSION = "f1-benchmark-v5";

function normalizeResearchText(v) {
  return String(v || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function f1Fingerprint(f1 = {}) {
  const attrs = [f1.declaredAttribute, f1.declaredAttribute2, f1.declaredAttribute3]
    .map((v) => normalizeResearchText(v))
    .filter(Boolean)
    .join("|");
  return [
    normalizeResearchText(f1.benchmark),
    attrs,
    normalizeResearchText(f1.growthRoute),
  ].join("|");
}

export function fingerprintResearchInput({
  ideaDescription,
  category,
  name,
  attachmentHash,
  f1 = null,
} = {}) {
  const normalized =
    `${RESEARCH_SCHEMA_VERSION}|${normalizeResearchText(name)}|` +
    `${normalizeResearchText(ideaDescription)}|${normalizeResearchText(category)}|` +
    `${attachmentHash || ""}|${f1Fingerprint(f1 || {})}`;
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
  return fingerprintResearchInput({
    ideaDescription: doc.ideaDescription,
    category: doc.category,
    name: doc.name,
    attachmentHash: hashAttachment(doc.attachment),
    f1: doc.f1 || null,
  });
}

export function researchCacheResultLabel(cached) {
  return cached ? "HIT — reused, no API call" : "MISS — running fresh research";
}

/** Log every research-cache lookup. Identical inputs must print HIT. */
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

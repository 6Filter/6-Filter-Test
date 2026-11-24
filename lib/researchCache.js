import { createHash } from "node:crypto";

/** Bump when Filter 1–4 research inputs or payload shape change so stale caches miss. */
export const RESEARCH_SCHEMA_VERSION = "f1-benchmark-evidence-v8";

function normalizeResearchText(v) {
  return String(v || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Hash every field that feeds research or a scored answer.
 * COGS and net margin stay out: scoring reads those numbers from the form.
 * A changed gap, parity line, growth route, growth argument, pack, GST or MRP
 * is a new entry and must not reuse the previous research.
 *
 * Part 93 billing policy: submitterDepartment / session department are NOT in
 * this fingerprint. Research cache is REUSED across teams — a HIT does not call
 * Anthropic and does not charge anyone. Only misses bill the verified session.
 * See docs/PART93_BILLING.md.
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
  evidenceLink = null,
  evidenceSha256 = null,
  declaredGap = "",
  gapDerivation = "",
  parityExceptions = "",
  growthRoute = "",
  growthArgument = "",
  grammage = "",
  gstRatePct = "",
  mrpInr = "",
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
    normalizeResearchText(evidenceLink),
    String(evidenceSha256 || "").trim().toLowerCase(),
    normalizeResearchText(declaredGap),
    normalizeResearchText(gapDerivation),
    normalizeResearchText(parityExceptions),
    normalizeResearchText(growthRoute),
    normalizeResearchText(growthArgument),
    normalizeResearchText(grammage),
    normalizeResearchText(gstRatePct),
    normalizeResearchText(mrpInr),
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

/** Bump when Category Sizing research inputs or payload shape change so stale caches miss. */
export const CATEGORY_SIZING_CACHE_VERSION = "category-sizing-v1";

function normalizePricePerUnit(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : normalizeResearchText(value);
}

/**
 * Fingerprint for standalone Category Sizing (`POST /api/category-sizing/run`).
 * Hashes fields that feed `runCategorySizing` research — not ideaId / request ids.
 * ideaText is the resolved product text (from ideaId or categoryName), same as the HTTP handler.
 */
export function fingerprintCategorySizingInput({
  ideaText = "",
  categoryName = "",
  attribute = "",
  benchmarkName = "",
  isPureCommodity = false,
  pricePerUnit = null,
  scope = "",
} = {}) {
  const normalized = [
    CATEGORY_SIZING_CACHE_VERSION,
    normalizeResearchText(ideaText),
    normalizeResearchText(categoryName),
    normalizeResearchText(attribute),
    normalizeResearchText(benchmarkName),
    Boolean(isPureCommodity),
    normalizePricePerUnit(pricePerUnit),
    normalizeResearchText(scope),
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
  let evidenceLink = String(f1.evidenceSourceDate || "").trim();
  if (evidenceLink) {
    try {
      const u = new URL(evidenceLink);
      evidenceLink = `${u.origin}${u.pathname}`.toLowerCase();
    } catch {
      evidenceLink = evidenceLink.split("?")[0].toLowerCase();
    }
  }
  const evidenceSha256 = String(f1.evidenceSourceFile?.sha256 || "").trim() || null;
  return fingerprintResearchInput({
    ideaDescription: doc.ideaDescription,
    category: doc.category,
    benchmark: f1.benchmark,
    attribute1: f1.declaredAttribute,
    attribute2: f1.declaredAttribute2,
    attribute3: f1.declaredAttribute3,
    targetConsumer: f1.targetConsumer,
    growthRoute: f1.growthRoute,
    gapDerivation: f1.gapDerivation,
    parityExceptions: f1.parityExceptions,
    growthArgument: f1.growthArgument,
    declaredGap: f1.declaredGap,
    grammage: doc.f2?.grammage,
    gstRatePct: doc.f2?.gstRatePct,
    mrpInr: doc.f2?.mrpInr,
    division: doc.division,
    isPureCommodity: Boolean(f1.pureCommodity),
    attachmentHash: hashAttachment(doc.attachment),
    evidenceLink: evidenceLink || null,
    evidenceSha256,
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

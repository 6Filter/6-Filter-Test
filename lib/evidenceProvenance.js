/**
 * Browser-safe evidence line. Records where a research step's numbers came from.
 * A cache hit keeps the stored date.
 */

const MATCH_RANK = { category: 3, family: 2, none: 1 };

function matchRank(value) {
  return MATCH_RANK[String(value || "none")] || 1;
}

export function buildStepEvidence({
  nielsenMatchedOn = "none",
  kantarMatchedOn = "none",
  searchesUsed = 0,
  sources = [],
  sourceCount,
  asOf = "",
  nielsenAsOf = "",
  kantarAsOf = "",
  cacheHit = false,
} = {}) {
  return {
    nielsenMatchedOn: String(nielsenMatchedOn || "none"),
    kantarMatchedOn: String(kantarMatchedOn || "none"),
    searchesUsed: Number(searchesUsed) || 0,
    sourceCount: Number.isFinite(Number(sourceCount))
      ? Number(sourceCount)
      : Array.isArray(sources)
        ? sources.length
        : 0,
    asOf: String(asOf || "").trim(),
    nielsenAsOf: String(nielsenAsOf || "").trim(),
    kantarAsOf: String(kantarAsOf || "").trim(),
    cacheHit: Boolean(cacheHit),
    confidence: evidenceConfidence({
      nielsenMatchedOn,
      kantarMatchedOn,
      searchesUsed,
      sourceCount: Number.isFinite(Number(sourceCount))
        ? Number(sourceCount)
        : Array.isArray(sources)
          ? sources.length
          : 0,
    }),
  };
}

function evidenceConfidence({ nielsenMatchedOn, kantarMatchedOn, searchesUsed, sourceCount }) {
  const local = nielsenMatchedOn === "category" || nielsenMatchedOn === "family" || kantarMatchedOn === "category" || kantarMatchedOn === "family";
  if (local && (Number(searchesUsed) || 0) > 0 && (Number(sourceCount) || 0) > 0) return "recorded";
  if (local && (Number(sourceCount) || 0) > 0) return "recorded";
  if (!local && ((Number(searchesUsed) || 0) === 0 || (Number(sourceCount) || 0) === 0)) return "low";
  return "recorded";
}

export function mergeEvidence(parts) {
  const list = (Array.isArray(parts) ? parts : []).filter((part) => part && typeof part === "object");
  if (!list.length) return buildStepEvidence();
  let nielsenMatchedOn = "none";
  let kantarMatchedOn = "none";
  let searchesUsed = 0;
  let sourceCount = 0;
  let asOf = "";
  let nielsenAsOf = "";
  let kantarAsOf = "";
  let cacheHit = list.every((part) => part.cacheHit === true);
  for (const part of list) {
    if (matchRank(part.nielsenMatchedOn) > matchRank(nielsenMatchedOn)) {
      nielsenMatchedOn = part.nielsenMatchedOn || "none";
    }
    if (matchRank(part.kantarMatchedOn) > matchRank(kantarMatchedOn)) {
      kantarMatchedOn = part.kantarMatchedOn || "none";
    }
    searchesUsed += Number(part.searchesUsed) || 0;
    sourceCount += Number(part.sourceCount) || 0;
    if (!nielsenAsOf && part.nielsenAsOf) nielsenAsOf = part.nielsenAsOf;
    if (!kantarAsOf && part.kantarAsOf) kantarAsOf = part.kantarAsOf;
    if (!asOf && part.asOf) asOf = part.asOf;
  }
  return buildStepEvidence({
    nielsenMatchedOn,
    kantarMatchedOn,
    searchesUsed,
    sourceCount,
    asOf,
    nielsenAsOf,
    kantarAsOf,
    cacheHit,
  });
}

export function markEvidenceCacheHit(evidence, savedAt = "") {
  const next = buildStepEvidence(evidence || {});
  next.cacheHit = true;
  if (!next.asOf && savedAt) next.asOf = String(savedAt);
  return next;
}

export function markFindingsCacheHit(findings, savedAt = "") {
  const base = findings && typeof findings === "object" ? { ...findings } : {};
  for (const key of ["f1", "f2", "f3", "f4", "f5"]) {
    const block = base[key] && typeof base[key] === "object" ? { ...base[key] } : {};
    block.evidence = markEvidenceCacheHit(block.evidence, savedAt);
    base[key] = block;
  }
  return base;
}

function formatWhen(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return raw;
  return new Date(parsed).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export const PRECHANGE_EVIDENCE_LINE =
  "Evidence details were not recorded for research done before 8 Oct 2026";

export const GENERAL_KNOWLEDGE_EVIDENCE_LINE =
  "No sources found; based on the model's general knowledge. Lower confidence.";

export function formatEvidenceLine(evidence = {}) {
  if (evidence.unrecorded) return PRECHANGE_EVIDENCE_LINE;
  const searches = Number(evidence.searchesUsed);
  const hasCount = Number.isFinite(searches) && evidence.searchesUsed != null && evidence.searchesUsed !== "";
  const sourceCount = Number(evidence.sourceCount) || 0;
  const when = formatWhen(evidence.asOf) || "the saved research";
  const searchBit = hasCount ? `${searches} ${searches === 1 ? "search" : "searches"}, ` : "";
  const local = [];
  if (evidence.nielsenMatchedOn && evidence.nielsenMatchedOn !== "none") {
    const dated = evidence.nielsenAsOf ? `, as of ${formatWhen(evidence.nielsenAsOf) || evidence.nielsenAsOf}` : "";
    local.push(`Nielsen (${evidence.nielsenMatchedOn}${dated})`);
  }
  if (evidence.kantarMatchedOn && evidence.kantarMatchedOn !== "none") {
    const dated = evidence.kantarAsOf ? `, as of ${formatWhen(evidence.kantarAsOf) || evidence.kantarAsOf}` : "";
    local.push(`Kantar (${evidence.kantarMatchedOn}${dated})`);
  }
  const noSearch = !hasCount || searches === 0;
  const noSources = sourceCount === 0;
  if (!local.length && (noSearch || noSources)) return GENERAL_KNOWLEDGE_EVIDENCE_LINE;
  if (local.length && (noSearch || noSources)) {
    return `Evidence: ${local.join("; ")}.`;
  }
  const web = `public web search, India, ${searchBit}as of ${when}`;
  if (!local.length) {
    return `Evidence: ${web}. No local Nielsen or Kantar row for this category.`;
  }
  return `Evidence: ${local.join("; ")}; ${web}.`;
}

export function evidenceLineForFilter(filterKey, doc) {
  if (filterKey === "f6") return "";
  const stored = doc?.researchFindings?.[filterKey]?.evidence;
  if (stored && typeof stored === "object") {
    const ran =
      stored.asOf ||
      stored.searchesUsed ||
      stored.sourceCount ||
      stored.nielsenMatchedOn === "category" ||
      stored.nielsenMatchedOn === "family" ||
      stored.kantarMatchedOn === "category" ||
      stored.kantarMatchedOn === "family" ||
      stored.cacheHit;
    if (ran) return formatEvidenceLine(stored);
  }
  if (doc?.researchRunAt) return PRECHANGE_EVIDENCE_LINE;
  return "";
}

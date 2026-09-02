import { createHash } from "node:crypto";

export function fingerprintResearchInput({ ideaDescription, category, attachmentHash } = {}) {
  const normalized = `${String(ideaDescription || "").trim().toLowerCase()}|${String(category || "").trim().toLowerCase()}|${attachmentHash || ""}`;
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
} = {}) {
  return {
    researchFindings,
    suggestions,
    sources: Array.isArray(sources) ? sources : [],
    notCovered: Array.isArray(notCovered) ? notCovered : [],
  };
}

export function unwrapResearchCachePayload(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.researchFindings && typeof parsed.researchFindings === "object") {
    return {
      researchFindings: parsed.researchFindings,
      suggestions: parsed.suggestions || null,
      sources: Array.isArray(parsed.sources) ? parsed.sources : parsed.researchFindings.sources || [],
      notCovered: parsed.notCovered || null,
    };
  }
  return {
    researchFindings: parsed,
    suggestions: null,
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    notCovered: null,
  };
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

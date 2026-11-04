/**
 * Part 133 — code-enforced safeguards for Filter 1 / plan AI replies.
 * Browser-safe helpers for unit tests.
 */
import { urlAmongReturnedSources } from "./relevanceGrade.js";

function trim(v) {
  return String(v ?? "").trim();
}

function sourceList(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((s) => {
      if (typeof s === "string") return trim(s);
      if (s && typeof s === "object") return trim(s.url || s.source_url || s.href || s.link);
      return "";
    })
    .filter(Boolean);
}

function normalizeRelevance(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "strong" || s === "adequate" || s === "weak" || s === "none") return s;
  if (s === "relevant") return "strong";
  if (s === "not-relevant") return "weak";
  if (s === "not-found") return "none";
  return "none";
}

/**
 * Benchmark relevance stands only if source_url is among returnedSources.
 */
export function sanitizeBenchmarkAssessment(raw = {}, returnedSources = []) {
  const relevance = normalizeRelevance(raw.relevance ?? raw.status);
  const source_url = trim(raw.source_url || raw.sourceUrl) || undefined;
  const out = {
    relevance,
    found: raw.found,
    reason: raw.reason ? trim(raw.reason) : undefined,
    source_url,
    stronger_competitors: Array.isArray(raw.stronger_competitors) ? raw.stronger_competitors : undefined,
  };
  if (relevance !== "none" && !urlAmongReturnedSources(source_url, returnedSources)) {
    out.relevance = "none";
    out.reason = out.reason
      ? `${out.reason} (source_url was not among returned search sources)`
      : "source_url was not among returned search sources";
  }
  return out;
}

/** Contradiction counts only with returned source_url AND non-empty quote. */
export function sanitizeClaimAssessment(raw = {}, returnedSources = []) {
  let relevance = normalizeRelevance(raw.relevance);
  const specific = raw.specific === true;
  let supported = raw.supported === true;
  let contradicted = raw.contradicted === true;
  const source_url = trim(raw.source_url || raw.sourceUrl) || undefined;
  const quote = trim(raw.quote);

  if (contradicted) {
    if (!urlAmongReturnedSources(source_url, returnedSources) || !quote) {
      contradicted = false;
    }
  }
  if (supported && !urlAmongReturnedSources(source_url, returnedSources)) {
    supported = false;
  }

  return {
    relevance,
    specific,
    supported,
    contradicted,
    source_url,
    quote: quote || undefined,
  };
}

export function sanitizePlanAssessment(raw = {}) {
  const attr = raw.attributes && typeof raw.attributes === "object" ? raw.attributes : {};
  const qcom = raw.qcom && typeof raw.qcom === "object" ? raw.qcom : {};
  const route = raw.route && typeof raw.route === "object" ? raw.route : {};
  const matches = String(route.matches || "")
    .trim()
    .toLowerCase();
  const confidence = String(route.confidence || "low")
    .trim()
    .toLowerCase();
  return {
    attributes: {
      relevance: normalizeRelevance(attr.relevance),
      specific: attr.specific === true,
    },
    qcom: {
      relevance: normalizeRelevance(qcom.relevance),
      specific: qcom.specific === true,
    },
    route: {
      matches: matches === "yes" || matches === "unclear" || matches === "no" ? matches : "unclear",
      confidence: confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "low",
      expected: trim(route.expected) || undefined,
      reason: trim(route.reason) || undefined,
    },
  };
}

// ——— Legacy helpers (binary Part 133) kept for older tests ———

export function sanitizeBenchmarkCheck(raw, sources = []) {
  const assessment = sanitizeBenchmarkAssessment(raw, sourceList(sources));
  return {
    status:
      assessment.relevance === "strong"
        ? "relevant"
        : assessment.relevance === "none"
          ? "not-found"
          : "not-relevant",
    found: assessment.found,
    reason: assessment.reason,
    source_url: assessment.source_url,
    stronger_competitors: assessment.stronger_competitors,
    sources: sourceList(sources),
  };
}

export function sanitizeClaimList(claims = [], sources = []) {
  const src = sourceList(sources);
  const cleaned = (Array.isArray(claims) ? claims : []).slice(0, 6).map((c) => {
    let verdict = String(c?.verdict || "unverifiable").toLowerCase();
    if (verdict !== "supported" && verdict !== "contradicted" && verdict !== "unverifiable") {
      verdict = "unverifiable";
    }
    const source_url = trim(c?.source_url || c?.sourceUrl);
    const quote = trim(c?.quote);
    if (verdict === "contradicted") {
      if (!urlAmongReturnedSources(source_url, src) || !quote) verdict = "unverifiable";
    }
    return {
      claim: trim(c?.claim || c?.text),
      verdict,
      source_url: source_url || undefined,
      quote: quote || undefined,
    };
  });
  let verdict = "unverified";
  if (cleaned.some((c) => c.verdict === "contradicted")) verdict = "contradicted";
  else if (cleaned.some((c) => c.verdict === "supported")) verdict = "supported";
  return { claims: cleaned, verdict, sources: src };
}

export function sanitizeClaimChecks(raw = {}, sources = []) {
  const keys = ["gapDerivation", "parityExceptions", "growthArgument", "derivation", "argument"];
  const out = {};
  for (const key of keys) {
    const block = raw?.[key];
    if (!block) continue;
    if (block.relevance != null || block.specific != null) {
      out[key] = {
        ...sanitizeClaimAssessment(block, sources),
        sources: sourceList(sources),
      };
      continue;
    }
    const claims = Array.isArray(block.claims) ? block.claims : Array.isArray(block) ? block : [];
    out[key] = sanitizeClaimList(claims, sources.length ? sources : block.sources || raw.sources || []);
  }
  return out;
}

export function sanitizeRouteCheck(raw = {}) {
  const confidence = String(raw?.confidence || "low").toLowerCase();
  const conf = confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "low";
  if (raw.matches) {
    return {
      matches: String(raw.matches).toLowerCase(),
      confidence: conf,
      expected: trim(raw.expected),
      reason: trim(raw.reason),
      mismatchCounts: conf === "high" && String(raw.matches).toLowerCase() === "no",
    };
  }
  return {
    expected: trim(raw?.expected || raw?.expectedRoute),
    confidence: conf,
    reason: trim(raw?.reason),
    mismatchCounts: conf === "high",
  };
}

export function urlsMatchReturnedSources(url, sources) {
  return urlAmongReturnedSources(url, sources);
}

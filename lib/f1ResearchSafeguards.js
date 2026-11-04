/**
 * Part 133 — code-enforced safeguards for Filter 1 AI replies (no trust in the prompt alone).
 * Browser-safe helpers for unit tests.
 */

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

function urlInSources(url, sources) {
  const u = trim(url);
  if (!u) return false;
  const list = sourceList(sources);
  if (!list.length) return false;
  const norm = (x) => x.replace(/\/$/, "").toLowerCase();
  const nu = norm(u);
  return list.some((s) => {
    const ns = norm(s);
    return ns === nu || ns.includes(nu) || nu.includes(ns);
  });
}

/**
 * relevant stands only if source_url is among sources returned in the SAME call.
 */
export function sanitizeBenchmarkCheck(raw, sources = []) {
  const status = String(raw?.status || "").toLowerCase();
  const out = {
    status: status === "relevant" || status === "not-found" || status === "not-relevant" ? status : "not-found",
    found: raw?.found,
    reason: raw?.reason ? String(raw.reason).trim() : undefined,
    sold_in_india: raw?.sold_in_india,
    category_match: raw?.category_match,
    stronger_competitors: Array.isArray(raw?.stronger_competitors) ? raw.stronger_competitors : undefined,
    source_url: raw?.source_url ? String(raw.source_url).trim() : undefined,
    sources: sourceList(sources.length ? sources : raw?.sources),
  };
  if (out.status === "relevant" && !urlInSources(out.source_url, out.sources)) {
    out.status = "not-found";
    out.reason = out.reason
      ? `${out.reason} (source_url was not among returned search sources)`
      : "source_url was not among returned search sources";
  }
  return out;
}

/**
 * contradicted stands only with a returned source_url AND non-empty quote.
 * Per text: contradicted > supported > unverified.
 */
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
      if (!urlInSources(source_url, src) || !quote) {
        verdict = "unverifiable";
      }
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
  else if (!cleaned.length) verdict = "unverified";
  return { claims: cleaned, verdict, sources: src };
}

export function sanitizeClaimChecks(raw = {}, sources = []) {
  const keys = ["gapDerivation", "parityExceptions", "growthArgument"];
  const out = {};
  for (const key of keys) {
    const block = raw?.[key];
    if (!block) continue;
    const claims = Array.isArray(block.claims) ? block.claims : Array.isArray(block) ? block : [];
    out[key] = sanitizeClaimList(claims, sources.length ? sources : block.sources || raw.sources || []);
  }
  return out;
}

/** Route mismatch counts only at confidence high; always store the reply. */
export function sanitizeRouteCheck(raw = {}) {
  const confidence = String(raw?.confidence || "low").toLowerCase();
  const conf = confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "low";
  return {
    expected: trim(raw?.expected || raw?.expectedRoute),
    confidence: conf,
    reason: trim(raw?.reason),
    mismatchCounts: conf === "high",
  };
}

export function urlsMatchReturnedSources(url, sources) {
  return urlInSources(url, sources);
}

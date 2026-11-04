/**
 * Part 133 (relevance) — locked grading rules. Browser-safe: no I/O, no LLM.
 * The AI's answer is DATA; these rules alone turn it into a level + credit.
 */
export const RELEVANCE_LEVELS = Object.freeze(["none", "weak", "adequate", "strong"]);

export const RELEVANCE_CREDIT = Object.freeze({
  none: 0,
  weak: 1 / 3,
  adequate: 2 / 3,
  strong: 1,
});

export const MIN_ASSESSABLE_CHARS = 3;

const LEVEL_RANK = Object.freeze({ none: 0, weak: 1, adequate: 2, strong: 3 });

function normalizeLevel(v) {
  const s = String(v || "")
    .trim()
    .toLowerCase();
  if (s === "none" || s === "weak" || s === "adequate" || s === "strong") return s;
  // Legacy status aliases from the binary Part 133 calls
  if (s === "relevant" || s === "yes" || s === "match") return "strong";
  if (s === "not-relevant" || s === "partial") return "adequate";
  if (s === "not-found" || s === "no") return "none";
  return null;
}

function creditFor(level) {
  return RELEVANCE_CREDIT[level] ?? 0;
}

function result(level, reasons) {
  const lv = normalizeLevel(level) || "none";
  return { level: lv, credit: creditFor(lv), reasons: [...reasons] };
}

function sourceList(sources) {
  if (!Array.isArray(sources)) return [];
  return sources
    .map((s) => {
      if (typeof s === "string") return String(s).trim();
      if (s && typeof s === "object") return String(s.url || s.source_url || s.href || s.link || "").trim();
      return "";
    })
    .filter(Boolean);
}

export function urlAmongReturnedSources(url, returnedSources = []) {
  const u = String(url || "")
    .trim()
    .replace(/\/$/, "")
    .toLowerCase();
  if (!u) return false;
  return sourceList(returnedSources).some((s) => {
    const ns = s.replace(/\/$/, "").toLowerCase();
    return ns === u || ns.includes(u) || u.includes(ns);
  });
}

function minLevel(a, b) {
  const ra = LEVEL_RANK[a] ?? 0;
  const rb = LEVEL_RANK[b] ?? 0;
  return ra <= rb ? a : b;
}

/**
 * @param {"benchmark"|"claims"|"route"|"plan"|"evidence"} kind
 * @param {object|null} raw — stored AI assessment payload (never trusted alone)
 * @param {{ entered?: boolean, tooShort?: boolean, inputInvalid?: boolean, humanWritten?: boolean, returnedSources?: any[], notAssessed?: boolean }} ctx
 */
export function gradeAssessment(kind, raw, ctx = {}) {
  if (ctx.entered === false) return result("none", ["NOT_ENTERED"]);
  if (ctx.tooShort === true) return result("none", ["TOO_SHORT"]);
  if (ctx.inputInvalid === true) return result("none", ["INPUT_INVALID"]);
  if (ctx.humanWritten === false) return result("none", ["NEEDS_CONFIRMATION"]);
  if (ctx.notAssessed === true || raw == null || raw === undefined) {
    return result("none", ["NOT_ASSESSED"]);
  }

  const returnedSources = sourceList(ctx.returnedSources || raw.returnedSources || []);

  if (kind === "benchmark") {
    const cited = urlAmongReturnedSources(raw.source_url || raw.sourceUrl, returnedSources);
    let level = normalizeLevel(raw.relevance ?? raw.status) || "none";
    const reasons = [];
    if (level !== "none" && !cited) {
      return result("none", ["NOT_CITED"]);
    }
    if (level === "none") reasons.push("NOT_RELEVANT");
    else if (level === "weak") reasons.push("WEAK_MATCH");
    else if (level === "adequate") reasons.push("ADEQUATE_MATCH");
    else reasons.push("STRONG_MATCH");
    return result(level, reasons.length ? reasons : ["NOT_ASSESSED"]);
  }

  if (kind === "claims") {
    const url = raw.source_url || raw.sourceUrl;
    const quote = String(raw.quote || "").trim();
    const contradicted =
      raw.contradicted === true || String(raw.verdict || "").toLowerCase() === "contradicted";
    if (contradicted) {
      if (urlAmongReturnedSources(url, returnedSources) && quote) {
        return result("none", ["CONTRADICTED"]);
      }
      // Contradiction without cite/quote is ignored (does not force none)
    }
    let level = normalizeLevel(raw.relevance) || "none";
    const reasons = [];
    const specific = raw.specific === true;
    if (!specific && level !== "none") {
      level = minLevel(level, "weak");
      reasons.push("NOT_SPECIFIC");
    }
    const supported =
      raw.supported === true || String(raw.verdict || "").toLowerCase() === "supported";
    if (level === "strong") {
      if (!(supported && urlAmongReturnedSources(url, returnedSources))) {
        level = "adequate";
        reasons.push(supported ? "NOT_CITED" : "NOT_SUPPORTED");
      } else {
        reasons.push("SUPPORTED");
      }
    } else if (level === "adequate") reasons.push("ADEQUATE_CLAIM");
    else if (level === "weak") {
      if (!reasons.includes("NOT_SPECIFIC")) reasons.push("WEAK_CLAIM");
    } else reasons.push("NONE");
    return result(level, reasons);
  }

  if (kind === "plan") {
    let level = normalizeLevel(raw.relevance) || "none";
    const reasons = [];
    const specific = raw.specific === true;
    if (!specific && level !== "none") {
      level = minLevel(level, "weak");
      reasons.push("NOT_SPECIFIC");
    } else if (level === "strong") reasons.push("SPECIFIC_PLAN");
    else if (level === "adequate") reasons.push("ADEQUATE_PLAN");
    else if (level === "weak") reasons.push("WEAK_PLAN");
    else reasons.push("NONE");
    return result(level, reasons);
  }

  if (kind === "route") {
    const matches = String(raw.matches || raw.match || "")
      .trim()
      .toLowerCase();
    const confidence = String(raw.confidence || "")
      .trim()
      .toLowerCase();
    if (matches === "yes") return result("strong", ["ROUTE_MATCH"]);
    if (matches === "unclear") return result("adequate", ["ROUTE_UNCLEAR"]);
    if (matches === "no") {
      if (confidence === "high") return result("none", ["ROUTE_MISMATCH"]);
      return result("weak", ["ROUTE_MISMATCH_LOW_CONFIDENCE"]);
    }
    // Legacy: expected route vs selected, mapped by caller into matches
    return result("none", ["NOT_ASSESSED"]);
  }

  if (kind === "evidence") {
    // raw may be a precomputed { relevance } or facts list via ctx
    if (raw && raw.relevance) {
      const level = normalizeLevel(raw.relevance) || "none";
      return result(level, [String(raw.reasonCode || level.toUpperCase())]);
    }
    return result("none", ["NO_EVIDENCE"]);
  }

  return result("none", ["NOT_ASSESSED"]);
}

/**
 * Derive evidence relevance from Part 131 quote-verified facts (never from file presence).
 */
export function evidenceAssessmentFromRead(evidenceRead) {
  if (!evidenceRead || typeof evidenceRead !== "object") {
    return { relevance: "none", reasonCode: "NOT_READ" };
  }
  const status = String(evidenceRead.status || "").toLowerCase();
  if (status === "unreadable" || status === "blocked") {
    return { relevance: "none", reasonCode: "UNREADABLE" };
  }
  if (!status || status === "none" || status === "pending") {
    return { relevance: "none", reasonCode: "NOT_READ" };
  }
  const facts = Array.isArray(evidenceRead.facts) ? evidenceRead.facts : [];
  const verified = facts.filter((f) => f?.verified === true);
  if (!verified.length) return { relevance: "none", reasonCode: "NO_VERIFIED_FACTS" };

  const topicOf = (f) =>
    String(f?.topic || "")
      .toLowerCase()
      .trim();
  const hasCore = verified.some((f) =>
    ["benchmark", "attribute", "attributes", "gap", "declaredgap", "declaredattribute"].some((t) =>
      topicOf(f).includes(t)
    )
  );
  if (hasCore) return { relevance: "strong", reasonCode: "CORE_FACT" };

  const hasContext = verified.some((f) =>
    ["category", "size", "growth", "price", "volume"].some((t) => topicOf(f).includes(t))
  );
  if (hasContext) return { relevance: "adequate", reasonCode: "CONTEXT_FACT" };

  const onlyOther = verified.every((f) => topicOf(f) === "other" || topicOf(f) === "");
  if (onlyOther) return { relevance: "weak", reasonCode: "OTHER_FACT" };

  return { relevance: "weak", reasonCode: "OTHER_FACT" };
}

export function lowerOfLevels(a, b) {
  return minLevel(normalizeLevel(a) || "none", normalizeLevel(b) || "none");
}

export function isTooShort(text) {
  const t = String(text ?? "").trim();
  return t.length > 0 && t.length < MIN_ASSESSABLE_CHARS;
}

export function hasEnteredText(text) {
  return String(text ?? "").trim().length > 0;
}

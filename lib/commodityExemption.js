/**
 * Part 145 D110 — "pure commodity" is a research finding, never a tick.
 *
 * The Filter 1 research step returns { pureCommodity, reason, source_url, quote, confidence }.
 * The Filter 1 exemption applies ONLY when research says yes, with a quote and a source the
 * search actually returned, at medium or high confidence. A person's earlier tick never exempts.
 * An exempt idea is scored over the checks that remain (11 at screening, 14 in the final);
 * Filter 1's seven checks leave the numerator and the denominator together. No free marks.
 *
 * Browser-safe: no I/O, no Node APIs.
 */

/** Filter 1's checks that leave the score when the exemption applies. */
export const EXEMPT_F1_SLOT_COUNT = 7;

const CONFIDENCE_OK = new Set(["medium", "high"]);

function normUrl(u) {
  return String(u ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[#?].*$/, "")
    .replace(/\/+$/, "");
}

function urlsOf(returnedSources) {
  const out = [];
  for (const s of Array.isArray(returnedSources) ? returnedSources : []) {
    if (typeof s === "string") out.push(s);
    else if (s && typeof s === "object") out.push(s.url || s.source_url || "");
  }
  return out.map(normUrl).filter(Boolean);
}

/** Clean what the research step returned into the stored finding shape. */
export function normalizeCommodityFinding(raw, returnedSources = []) {
  if (!raw || typeof raw !== "object") return null;
  const yes = raw.pureCommodity === true || String(raw.pureCommodity).toLowerCase() === "true";
  const conf = String(raw.confidence || "").trim().toLowerCase();
  return {
    pureCommodity: yes,
    reason: String(raw.reason || "").trim(),
    source_url: String(raw.source_url || raw.sourceUrl || "").trim(),
    quote: String(raw.quote || "").trim(),
    confidence: ["low", "medium", "high"].includes(conf) ? conf : "low",
    returnedSources: urlsOf(returnedSources),
  };
}

/**
 * Decide the exemption. `returnedSources` are the URLs the search actually returned.
 * @returns {{ exempt: boolean, why: string }}
 */
export function decideExemption(finding, returnedSources = null) {
  if (!finding || typeof finding !== "object") return { exempt: false, why: "no research finding" };
  if (finding.pureCommodity !== true) return { exempt: false, why: "research did not say pure commodity" };
  if (!CONFIDENCE_OK.has(String(finding.confidence || "").toLowerCase())) {
    return { exempt: false, why: "confidence below medium" };
  }
  if (!String(finding.quote || "").trim()) return { exempt: false, why: "no quote" };
  const url = normUrl(finding.source_url);
  if (!url) return { exempt: false, why: "no source" };
  const returned = urlsOf(returnedSources ?? finding.returnedSources);
  if (!returned.includes(url)) return { exempt: false, why: "source was not returned by the search" };
  return { exempt: true, why: "sourced research finding" };
}

/** The finding stored on an idea (researchFindings.f1.commodityFinding), or null. */
export function commodityFindingOf(doc = {}) {
  const f = doc?.researchFindings?.f1?.commodityFinding;
  return f && typeof f === "object" ? f : null;
}

/** True only when the stored research finding exempts this idea. The tick is ignored. */
export function isF1ExemptByResearch(doc = {}) {
  return decideExemption(commodityFindingOf(doc)).exempt;
}

/** Same decision from a Filter 1 findings object (researchFindings.f1). */
export function isExemptFromFindings(f1Findings = {}) {
  const f = f1Findings?.commodityFinding;
  return decideExemption(f && typeof f === "object" ? f : null).exempt;
}

/**
 * An idea stored with the old tick and a sealed Exempt Filter 1, but no sourced finding:
 * its stored score stays, labelled. Screening it again follows the new rule.
 */
export const OLDER_RELEASE_LABEL = "Scored under an older release";

export function scoredUnderOlderRelease(doc = {}) {
  const go = doc?.goNoGo || {};
  const label = String(go.output?.filters?.f1?.label || go.checkLabels?.f1 || "").trim();
  return label === "Exempt" && !isF1ExemptByResearch(doc);
}

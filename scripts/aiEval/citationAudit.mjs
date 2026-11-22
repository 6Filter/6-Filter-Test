/**
 * Open every cited address and look for the quoted text.
 * Uses the SSRF-safe fetch helper. Injectable fetch for tests (no network).
 * Quote matching is local so the harness does not load the evidence extractor
 * (unpdf/mammoth) — same substring rule as evidence reads.
 */
import { assertPublicHttpsUrl, safeFetchPublicUrl } from "./safeFetch.mjs";

function normalizeQuoteText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9₹%.\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looseQuoteText(s) {
  return normalizeQuoteText(s)
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteFoundInText(quote, extractedText) {
  const q = normalizeQuoteText(quote);
  if (!q || q.length < 8) return false;
  const hay = normalizeQuoteText(extractedText);
  if (hay.includes(q)) return true;
  const looseQ = looseQuoteText(quote);
  if (looseQ.length < 8) return false;
  return looseQuoteText(extractedText).includes(looseQ);
}

export function collectCitations(predicted = {}) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(predicted.citations) ? predicted.citations : [];
  for (const c of list) {
    const url = String(c?.url || c?.source_url || "").trim();
    const quote = String(c?.quote || "").trim();
    if (!url) continue;
    const key = `${url}|${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url,
      quote,
      field: String(c?.field || "").trim(),
    });
  }
  return out;
}

function quotePresent(quote, text) {
  const q = String(quote || "").trim();
  if (!q) return false;
  if (quoteFoundInText(q, text)) return true;
  // Short quotes (under 8 chars) are too weak for the evidence helper; still require a substring.
  if (q.length < 8) return String(text || "").includes(q);
  return false;
}

export async function auditOneCitation(citation, fetchOpts = {}) {
  const url = String(citation?.url || "").trim();
  const quote = String(citation?.quote || "").trim();
  const base = { url, quote, field: citation?.field || "" };
  try {
    assertPublicHttpsUrl(url);
  } catch (e) {
    return {
      ...base,
      ok: false,
      found: false,
      reason: e.code === "EVAL_SSRF" ? "blocked-private" : "invalid-url",
      code: e.code || "EVAL_URL",
    };
  }
  try {
    const fetched = await safeFetchPublicUrl(url, fetchOpts);
    const found = quote ? quotePresent(quote, fetched.text) : false;
    return {
      ...base,
      ok: true,
      found,
      reason: found ? "quote-found" : quote ? "quote-missing" : "no-quote",
      finalUrl: fetched.finalUrl,
      status: fetched.status,
    };
  } catch (e) {
    const reason =
      e.code === "EVAL_TIMEOUT"
        ? "timeout"
        : e.code === "EVAL_SIZE"
          ? "too-large"
          : e.code === "EVAL_SSRF"
            ? "blocked-private"
            : "fetch-failed";
    return {
      ...base,
      ok: false,
      found: false,
      reason,
      code: e.code || "EVAL_FETCH",
    };
  }
}

export async function auditCitations(predicted = {}, fetchOpts = {}) {
  const citations = collectCitations(predicted);
  const results = [];
  for (const c of citations) {
    results.push(await auditOneCitation(c, fetchOpts));
  }
  const checked = results.length;
  const found = results.filter((r) => r.found).length;
  const blocked = results.filter((r) => r.reason === "blocked-private").length;
  const missing = results.filter((r) => r.reason === "quote-missing").length;
  return {
    citations: results,
    checked,
    found,
    missing,
    blocked,
    invented: missing + results.filter((r) => r.reason === "fetch-failed" && r.quote).length,
  };
}

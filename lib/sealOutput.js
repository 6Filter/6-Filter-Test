/**
 * Part 136 — seal the whole output once, when every required evaluation step is done.
 * Immutable until an explicit Evaluate replaces it (previous snapshot audited).
 */
import { SCORING_RULESET_VERSION } from "./lockedConstants.js";
import { scoreInputKey } from "./analysisStability.js";
import { evaluationStatus } from "./evaluationStatus.js";
import { fallbackFilterNarrative } from "./filterNarrativeText.js";
import { scoreAdvisoryChecks } from "./goNoGo.js";
import { ITEM_COPY } from "./itemCopy.js";

const FILTER_KEYS = ["f1", "f2", "f3", "f4"];

function levelPlain(level) {
  const l = String(level || "").trim().toLowerCase();
  if (l === "strong") return "Strong evidence";
  if (l === "adequate") return "Some support";
  if (l === "weak") return "Weak";
  if (l === "none" || l === "no" || l === "no_support") return "No support";
  if (!l) return "";
  // Never pass through UPPER_CASE codes as badges.
  return l.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function itemText(item = {}, ctx = {}) {
  const credited = Number(item.credit) >= 1 || String(item.status || "") === "done";
  const own = String(item.text || item.message || "").trim();
  // A cleared point keeps its credited sentence — do not rewrite it through open-check ITEM_COPY.
  if (credited && own) return own;
  const code = String(item.code || item.itemCode || "").trim();
  const entry = code ? ITEM_COPY[code] : null;
  if (entry && typeof entry.instruction === "function") {
    try {
      return entry.instruction({ ...ctx, ...item });
    } catch {
      /* fall through */
    }
  }
  return own;
}

function itemSources(item = {}) {
  const out = [];
  if (Array.isArray(item.sources)) {
    for (const s of item.sources) {
      if (typeof s === "string" && s.trim()) out.push(s.trim());
      else if (s?.url) out.push(String(s.url).trim());
      else if (s?.source_url) out.push(String(s.source_url).trim());
    }
  }
  if (item.sourceUrl) out.push(String(item.sourceUrl).trim());
  if (item.source_url) out.push(String(item.source_url).trim());
  return [...new Set(out.filter(Boolean))];
}

/**
 * Build the immutable sealed snapshot from advisory checks + gate result.
 */
export function buildSealedOutput({
  advisoryChecks = {},
  goNoGo = {},
  doc = {},
  sealedAt = new Date().toISOString(),
} = {}) {
  const filters = {};
  for (const key of FILTER_KEYS) {
    const check = advisoryChecks[key] || {};
    const items = Array.isArray(check.items) ? check.items : [];
    filters[key] = {
      label: String(check.checkLabel || "").trim() || "Not yet run",
      narrative: fallbackFilterNarrative(check),
      items: items.map((it) => {
        const sealed = {
          slot: it.slot || it.key || null,
          text: itemText(it, { filter: key, ...(doc.f1 || {}) }),
          level: levelPlain(it.level || it.relevance || ""),
          credit: it.credit != null ? Number(it.credit) : null,
          reasons: Array.isArray(it.reasons) ? it.reasons.map(String) : it.code ? [String(it.code)] : [],
          sources: itemSources(it),
        };
        // Part 141 — carry the finding (why / where / quote) and any input guard onto the sealed item.
        const reason = String(it.reason ?? "").trim();
        const sourceUrl = String(it.source_url ?? it.sourceUrl ?? "").trim();
        const quote = String(it.quote ?? "").trim();
        const guard = String(it.guard ?? "").trim();
        if (reason) sealed.reason = reason;
        if (sourceUrl) sealed.source_url = sourceUrl;
        if (quote) sealed.quote = quote;
        if (guard) sealed.guard = guard;
        return sealed;
      }),
    };
  }

  const score = goNoGo.score || scoreAdvisoryChecks(advisoryChecks);
  return {
    sealedAt,
    rulesetVersion: SCORING_RULESET_VERSION,
    scoreInputKey: goNoGo.scoreInputKey || scoreInputKey(doc),
    score: {
      pct: Number(score?.pct) || 0,
      done: Number(score?.done) || 0,
      total: Number(score?.total) || 0,
      byFilter: score?.byFilter || null,
      relevancePct: score?.relevancePct,
      legacyPct: score?.legacyPct,
      points: score?.points,
      shadowMode: score?.shadowMode,
    },
    classification: String(goNoGo.classification || "").trim(),
    rationale: String(goNoGo.rationale || "").trim(),
    filters,
  };
}

/**
 * True when every required step is done (no missing, no failed).
 */
export function canSealOutput(doc = {}) {
  return evaluationStatus(doc).state === "evaluated";
}

/**
 * Attach sealed output onto goNoGo. Caller persists and audits the previous output.
 */
export function sealGoNoGoOutput(goNoGo = {}, { advisoryChecks, doc, sealedAt } = {}) {
  const output = buildSealedOutput({
    advisoryChecks,
    goNoGo,
    doc,
    sealedAt,
  });
  return {
    ...goNoGo,
    output,
    filterNarratives: {
      f1: output.filters.f1.narrative,
      f2: output.filters.f2.narrative,
      f3: output.filters.f3.narrative,
      f4: output.filters.f4.narrative,
    },
    checkLabels: {
      f1: output.filters.f1.label,
      f2: output.filters.f2.label,
      f3: output.filters.f3.label,
      f4: output.filters.f4.label,
    },
  };
}

/** Advisory-shaped checks reconstructed from a sealed output (for Path to GO / PDF). */
export function advisoryChecksFromOutput(output = null) {
  if (!output?.filters || typeof output.filters !== "object") return null;
  const out = {};
  for (const key of FILTER_KEYS) {
    const f = output.filters[key] || {};
    out[key] = {
      checkLabel: f.label || "Not yet run",
      items: Array.isArray(f.items)
        ? f.items.map((it) => {
            const credit = it.credit == null || it.credit === "" ? null : Number(it.credit);
            const level = String(it.level || "");
            // Null credit is not a pass — only an explicit full credit or a strong-level badge is done.
            const done =
              (Number.isFinite(credit) && credit >= 1) ||
              (/strong|some support|adequate/i.test(level) && credit !== 0);
            const pending =
              !done || credit === 0 || /no support|marked down|fail/i.test(level);
            return {
              status: pending ? "pending" : "done",
              text: it.text,
              slot: it.slot,
              level: it.level,
              credit: it.credit,
              reasons: it.reasons,
              sources: it.sources,
              ...(it.reason ? { reason: it.reason } : {}),
              ...(it.source_url ? { source_url: it.source_url } : {}),
              ...(it.quote ? { quote: it.quote } : {}),
              ...(it.guard ? { guard: it.guard } : {}),
            };
          })
        : [],
    };
  }
  return out;
}

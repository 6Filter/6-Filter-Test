/**
 * Score a pipeline prediction against expert labels.
 * Does not import scoring rules — this is agreement with labels, not a rescore.
 */
import {
  SCORE_FIELDS,
  TECH_SHIFT_DIMS,
  gstRatesEqual,
  normalizeYesNo,
  normalizeVerdict,
  parseBool,
  withinOneLevel,
} from "./fields.mjs";

function yesNoMatch(predicted, labelled) {
  const a = normalizeYesNo(predicted);
  const b = normalizeYesNo(labelled);
  if (!a || !b) return false;
  return a === b;
}

function techShiftWithinOneLevel(predicted = {}, labelled = {}) {
  let compared = 0;
  for (const dim of TECH_SHIFT_DIMS) {
    if (!labelled[dim]) continue;
    compared += 1;
    if (!withinOneLevel(predicted[dim], labelled[dim])) return { match: false, compared };
  }
  return { match: compared > 0, compared };
}

function boolish(value) {
  if (typeof value === "boolean") return value;
  return parseBool(value);
}

export function scorePrediction(predicted = {}, labels = {}) {
  const tech = techShiftWithinOneLevel(predicted.techShift || {}, labels.techShift || {});
  const fields = {
    gstRate: gstRatesEqual(predicted.gstRatePct, labels.gstRate),
    benchmarkRelevance: yesNoMatch(predicted.benchmarkRelevant, labels.benchmarkRelevant),
    gapCredibility: yesNoMatch(predicted.gapCredible, labels.gapCredible),
    priceEventsDatedAndSourced: boolish(predicted.priceEventsDatedAndSourced) === boolish(labels.priceEventsDatedAndSourced),
    techShiftWithinOneLevel: tech.match,
    routeMatch: yesNoMatch(predicted.routeMatches, labels.routeMatches),
    verdictBand: normalizeVerdict(predicted.verdictBand) === normalizeVerdict(labels.verdictBand) && Boolean(normalizeVerdict(labels.verdictBand)),
  };
  const matched = SCORE_FIELDS.filter((k) => fields[k]).length;
  return {
    fields,
    matched,
    total: SCORE_FIELDS.length,
    agreementPct: SCORE_FIELDS.length ? Math.round((100 * matched) / SCORE_FIELDS.length) : 0,
    techShiftCompared: tech.compared,
  };
}

export function fieldAgreement(rows) {
  const out = {};
  for (const name of SCORE_FIELDS) {
    const total = rows.length;
    const same = rows.filter((r) => r.score?.fields?.[name] === true).length;
    out[name] = {
      same,
      total,
      pct: total ? Math.round((100 * same) / total) : 0,
    };
  }
  return out;
}

/** A field is stable when every repeat for that idea produced the same predicted value. */
export function fieldStability(byIdea) {
  const out = {};
  for (const name of SCORE_FIELDS) {
    const ideas = Object.values(byIdea);
    let stable = 0;
    for (const runs of ideas) {
      const keys = runs.map((r) => JSON.stringify(predictionKey(r.predicted, name)));
      if (keys.length && keys.every((k) => k === keys[0])) stable += 1;
    }
    out[name] = {
      stable,
      total: ideas.length,
      pct: ideas.length ? Math.round((100 * stable) / ideas.length) : 0,
    };
  }
  return out;
}

function predictionKey(predicted = {}, field) {
  switch (field) {
    case "gstRate":
      return predicted.gstRatePct;
    case "benchmarkRelevance":
      return normalizeYesNo(predicted.benchmarkRelevant);
    case "gapCredibility":
      return normalizeYesNo(predicted.gapCredible);
    case "priceEventsDatedAndSourced":
      return Boolean(predicted.priceEventsDatedAndSourced);
    case "techShiftWithinOneLevel":
      return predicted.techShift || {};
    case "routeMatch":
      return normalizeYesNo(predicted.routeMatches);
    case "verdictBand":
      return normalizeVerdict(predicted.verdictBand);
    default:
      return null;
  }
}

export { SCORE_FIELDS };

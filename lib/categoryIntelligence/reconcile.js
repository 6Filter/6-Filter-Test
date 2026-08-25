/**
 * Port of the workbook Reconciliation tab and methods.md §4.
 * Diagnose, never average, when spread > 30%.
 * Workbook middle band (15–30%) is labelled WIDE; we publish it as MODERATE.
 */

export function reconcile(engineEstimates) {
  const usable = (Array.isArray(engineEstimates) ? engineEstimates : [])
    .filter((e) => e && e.value != null && Number.isFinite(Number(e.value)));
  const values = usable.map((e) => Number(e.value)).sort((a, b) => a - b);
  if (values.length < 2) {
    return {
      status: "INSUFFICIENT",
      reason: "Fewer than 2 grounded engines — cannot triangulate.",
      median: null,
      spreadPct: null,
      p10: null,
      p50: null,
      p90: null,
      engines: usable,
    };
  }
  const median =
    values.length % 2
      ? values[(values.length - 1) / 2]
      : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const withDeviation = usable.map((e) => ({
    ...e,
    value: Number(e.value),
    deviationPct: Number(e.value) / median - 1,
  }));
  const min = values[0];
  const max = values[values.length - 1];
  const spreadPct = (max - min) / median;

  if (spreadPct <= 0.15) {
    return {
      status: "TIGHT",
      median,
      spreadPct,
      p10: min,
      p50: median,
      p90: max,
      engines: withDeviation,
    };
  }
  if (spreadPct > 0.3) {
    return {
      status: "DIAGNOSE",
      median,
      spreadPct,
      p10: min,
      p50: median,
      p90: max,
      engines: withDeviation,
      diagnosticOrder: [
        "price level mismatch",
        "informal sector treatment",
        "out-of-home consumption",
        "segment definition",
        "stale base year",
      ],
    };
  }
  return {
    status: "MODERATE",
    median,
    spreadPct,
    p10: min,
    p50: median,
    p90: max,
    engines: withDeviation,
  };
}

/**
 * Exact failing-set gate for scripts/run-all-tests.mjs (the pre-push / ciDryRun suite).
 * Load scripts/regressionBaseline.json. The push is refused if the actual failures
 * are not exactly that list.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export function loadRegressionBaseline(scriptsDir) {
  const file = path.join(scriptsDir, "regressionBaseline.json");
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const failures = Array.isArray(doc?.failures) ? doc.failures : [];
  const names = failures.map((row) => String(row?.name || "").trim()).filter(Boolean);
  if (names.length !== 14 || new Set(names).size !== names.length) {
    throw new Error(
      `regressionBaseline.json must list exactly 14 unique names (got ${names.length}).`
    );
  }
  return { file, doc, names, byName: Object.fromEntries(failures.map((row) => [row.name, row.reason || ""])) };
}

export function diffRegressionFailures(actualFailed, baselineNames) {
  const expected = new Set(baselineNames);
  const actual = new Set(actualFailed);
  const extra = [...actual].filter((name) => !expected.has(name)).sort();
  const missing = [...expected].filter((name) => !actual.has(name)).sort();
  const ok = extra.length === 0 && missing.length === 0;
  const lines = [];
  if (extra.length) {
    lines.push(`new failure(s) not on the baseline (${extra.length}):`);
    for (const name of extra) lines.push(`  ${name}`);
  }
  if (missing.length) {
    lines.push(`baseline test(s) started passing — re-pin the baseline (${missing.length}):`);
    for (const name of missing) lines.push(`  ${name}`);
  }
  return { ok, extra, missing, message: lines.join("\n") };
}

export function formatBaselineMatch(baseline) {
  const lines = [`${baseline.names.length} known failure(s) matched ${path.basename(baseline.file)}:`];
  for (const name of baseline.names) {
    const reason = baseline.byName[name] || "";
    lines.push(`  ${name}${reason ? ` — ${reason}` : ""}`);
  }
  return lines.join("\n");
}

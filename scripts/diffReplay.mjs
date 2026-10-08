/**
 * Diff two scoring replays. Exit 1 when a change is not a Part 96 section C case.
 * node scripts/diffReplay.mjs data/replay/base.json data/replay/new.json
 */
import { readFile } from "node:fs/promises";

const FILTERS = ["f1", "f2", "f3", "f4"];

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function hadUnrunFilter(row) {
  return FILTERS.some((key) => row.labels?.[key] === "Not yet run" || (row.items?.[key] || [])[1] === 0);
}

function allFiltersScored(row) {
  return FILTERS.every((key) => (row.items?.[key] || [])[1] > 0 && row.labels?.[key] && row.labels[key] !== "Not yet run");
}

export function explainReplayChange(base, next) {
  if (
    base.classification === next.classification &&
    base.pct === next.pct &&
    base.floorFailure === next.floorFailure &&
    sameJson(base.labels, next.labels) &&
    sameJson(base.items, next.items) &&
    sameJson(base.derived, next.derived)
  ) {
    return { ok: true, reasons: [] };
  }

  if (allFiltersScored(base)) {
    return { ok: false, reasons: ["scored filters changed"] };
  }

  const reasons = [];
  const labelChanged = FILTERS.filter((key) => base.labels?.[key] !== next.labels?.[key]);
  const itemsChanged = FILTERS.filter((key) => !sameJson(base.items?.[key], next.items?.[key]));
  const f4Retry =
    base.labels?.f4 === "Not yet run" &&
    String(next.leads?.f4 || "").includes("Research failed — retry");
  if (f4Retry) reasons.push("F4 Not yet run now reads Research failed — retry");

  const goCapped =
    base.classification === "GO" &&
    (next.classification === "WATCH" || next.classification === "NO-GO") &&
    hadUnrunFilter(base);
  if (goCapped) reasons.push(`GO capped to ${next.classification} because a filter had not run`);

  const unexpectedLabel = labelChanged.filter((key) => !(key === "f4" && f4Retry));
  const unexpectedItems = itemsChanged.filter((key) => !(key === "f4" && f4Retry));
  const classChanged = base.classification !== next.classification;
  const classExplained = !classChanged || goCapped;
  const pctSame = base.pct === next.pct;
  const pctOk = pctSame || (f4Retry && unexpectedItems.length === 0);
  const floorSame = base.floorFailure === next.floorFailure;
  const derivedSame = sameJson(base.derived, next.derived);

  if (
    reasons.length &&
    unexpectedLabel.length === 0 &&
    unexpectedItems.length === 0 &&
    classExplained &&
    pctOk &&
    floorSame &&
    derivedSame
  ) {
    return { ok: true, reasons };
  }
  const why = [];
  if (!pctOk) why.push(`pct ${base.pct} -> ${next.pct}`);
  if (!classExplained) why.push(`classification ${base.classification} -> ${next.classification}`);
  if (!floorSame) why.push("floorFailure");
  if (!derivedSame) why.push("derived");
  for (const key of unexpectedLabel) why.push(`${key} label ${base.labels?.[key]} -> ${next.labels?.[key]}`);
  for (const key of unexpectedItems) why.push(`${key} items ${JSON.stringify(base.items?.[key])} -> ${JSON.stringify(next.items?.[key])}`);
  return { ok: false, reasons: why.length ? why : ["unexplained"] };
}

const basePath = process.argv[2];
const nextPath = process.argv[3];
const isDirect = process.argv[1] && process.argv[1].endsWith("diffReplay.mjs");
if (isDirect) {
  if (!basePath || !nextPath) {
    console.error("Usage: node scripts/diffReplay.mjs <base.json> <new.json>");
    process.exit(1);
  }
  const baseRows = JSON.parse(await readFile(basePath, "utf8"));
  const nextRows = JSON.parse(await readFile(nextPath, "utf8"));
  const baseById = new Map(baseRows.map((row) => [row.id, row]));
  const nextById = new Map(nextRows.map((row) => [row.id, row]));
  const ids = [...new Set([...baseById.keys(), ...nextById.keys()])].sort();
  let identical = 0;
  const allowed = [];
  const unexplained = [];
  for (const id of ids) {
    const base = baseById.get(id);
    const next = nextById.get(id);
    if (!base || !next) {
      unexplained.push({ id, reasons: [base ? "missing from new" : "missing from base"] });
      continue;
    }
    const change = explainReplayChange(base, next);
    if (change.ok && change.reasons.length === 0) identical += 1;
    else if (change.ok) allowed.push({ id, reasons: change.reasons });
    else unexplained.push({ id, reasons: change.reasons });
  }
  console.log(
    `replayed=${ids.length} identical=${identical} changed=${allowed.length + unexplained.length} unexplained=${unexplained.length}`
  );
  for (const row of allowed) console.log(`allowed ${row.id}: ${row.reasons.join("; ")}`);
  for (const row of unexplained) console.log(`UNEXPLAINED ${row.id}: ${row.reasons.join("; ")}`);
  if (unexplained.length) process.exit(1);
}

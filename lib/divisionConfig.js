import {
  createDivisionThresholdRow,
  listDivisionThresholdRows,
  updateDivisionThresholdRow,
} from "./db.js";
import {
  DIVISION_MIN_NET_MARGIN_PCT,
  LOCKED_DIVISION_NAMES,
  minNetMarginForDivision,
} from "./lockedConstants.js";

let cache = null;
let cachedAt = 0;
const TTL_MS = 60_000;

export async function getDivisionThresholds() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await listDivisionThresholdRows();
  // Surface locked floors for display; DB column is ignored for scoring.
  cache = rows.map((row) => ({
    ...row,
    locked_min_net_margin_pct: minNetMarginForDivision(row.division_name),
  }));
  cachedAt = Date.now();
  return cache;
}

export function invalidateDivisionCache() {
  cache = null;
  cachedAt = 0;
}

export async function getDivisionOptions() {
  const fromDb = (await getDivisionThresholds()).map((r) => r.division_name);
  if (fromDb.length) return fromDb;
  return [...LOCKED_DIVISION_NAMES];
}

/**
 * Scoring reader — lockedConstants only. Never reads min_net_margin_pct from the database.
 */
export async function getDivisionMarginFloor(divisionName) {
  return minNetMarginForDivision(divisionName);
}

export async function divisionExists(divisionName) {
  if (!divisionName) return false;
  if (Object.prototype.hasOwnProperty.call(DIVISION_MIN_NET_MARGIN_PCT, String(divisionName).trim())) {
    return true;
  }
  const options = await getDivisionOptions();
  return options.includes(divisionName);
}

export async function getDivisionRevenueTarget(divisionName) {
  const row = (await getDivisionThresholds()).find((r) => r.division_name === divisionName);
  return row
    ? {
        allChannels: row.revenue_target_all_channels_cr,
        ecomMtCosmetic: row.revenue_target_ecom_mt_cr,
        note: row.note || "",
      }
    : null;
}

function normMargin(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Compare DB rows to DIVISION_MIN_NET_MARGIN_PCT — report only, never apply. */
export async function computeDivisionFloorDrift() {
  let rows = [];
  try {
    rows = await listDivisionThresholdRows();
  } catch (e) {
    return { ok: false, error: String(e?.message || e), drift: [] };
  }
  const byName = new Map(rows.map((r) => [String(r.division_name || "").trim(), r]));
  const drift = [];
  for (const name of LOCKED_DIVISION_NAMES) {
    const locked = minNetMarginForDivision(name);
    const row = byName.get(name);
    if (!row) {
      drift.push({ division: name, stored: null, locked, reason: "missing-row" });
      continue;
    }
    const stored = normMargin(row.min_net_margin_pct);
    if (stored !== locked) {
      drift.push({ division: name, stored, locked, reason: "value-mismatch" });
    }
  }
  for (const [name, row] of byName) {
    if (!LOCKED_DIVISION_NAMES.includes(name)) {
      drift.push({
        division: name,
        stored: normMargin(row.min_net_margin_pct),
        locked: null,
        reason: "extra-row",
      });
    }
  }
  if (drift.length) {
    console.warn(
      `[primus/division-floor-drift] ${drift.length} difference(s) vs locked table (ignored for scoring): ` +
        drift.map((d) => `${d.division}: stored=${d.stored} locked=${d.locked}`).join("; ")
    );
  }
  return { ok: drift.length === 0, drift };
}

const MARGIN_LOCKED_MSG = "Minimum net margin is locked";

export async function saveDivisionThreshold(id, patch) {
  const body = { ...(patch || {}) };
  if (Object.prototype.hasOwnProperty.call(body, "min_net_margin_pct")) {
    const err = new Error(MARGIN_LOCKED_MSG);
    err.status = 400;
    throw err;
  }
  const row = await updateDivisionThresholdRow(id, body);
  invalidateDivisionCache();
  return row;
}

export async function addDivisionThreshold(payload) {
  const body = { ...(payload || {}) };
  if (Object.prototype.hasOwnProperty.call(body, "min_net_margin_pct") && body.min_net_margin_pct != null) {
    const err = new Error(MARGIN_LOCKED_MSG);
    err.status = 400;
    throw err;
  }
  // New rows get the locked floor when the name is known; otherwise null (ignored for scoring).
  if (!Object.prototype.hasOwnProperty.call(body, "min_net_margin_pct")) {
    body.min_net_margin_pct = minNetMarginForDivision(body.division_name);
  } else {
    body.min_net_margin_pct = null;
  }
  const row = await createDivisionThresholdRow(body);
  invalidateDivisionCache();
  return row;
}

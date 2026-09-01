import {
  createDivisionThresholdRow,
  listDivisionThresholdRows,
  updateDivisionThresholdRow,
} from "./db.js";

let cache = null;
let cachedAt = 0;
const TTL_MS = 60_000;

export async function getDivisionThresholds() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  const rows = await listDivisionThresholdRows();
  cache = rows;
  cachedAt = Date.now();
  return cache;
}

export function invalidateDivisionCache() {
  cache = null;
  cachedAt = 0;
}

export async function getDivisionOptions() {
  return (await getDivisionThresholds()).map((r) => r.division_name);
}

export async function getDivisionMarginFloor(divisionName) {
  const row = (await getDivisionThresholds()).find((r) => r.division_name === divisionName);
  return row?.min_net_margin_pct ?? null;
}

export async function divisionExists(divisionName) {
  if (!divisionName) return false;
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

export async function saveDivisionThreshold(id, patch) {
  const row = await updateDivisionThresholdRow(id, patch);
  invalidateDivisionCache();
  return row;
}

export async function addDivisionThreshold(payload) {
  const row = await createDivisionThresholdRow(payload);
  invalidateDivisionCache();
  return row;
}

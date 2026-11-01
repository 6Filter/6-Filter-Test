import { detectDivision } from "./npdMaster.js";
import { DIVISION_THRESHOLD_SEED } from "./divisionSeed.js";

/**
 * Division used for the margin floor. An explicit label wins. Otherwise the
 * same keyword match Submit uses. This never writes the stored division.
 */
export function divisionForScore(doc = {}) {
  const explicit = String(doc?.division || "").trim();
  if (explicit) return explicit;
  const text = [doc?.name, doc?.category, doc?.ideaDescription]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n");
  return detectDivision(text) || "";
}

/** Seed floor for the browser preview. The server check uses the saved table. */
export function seedMarginFloor(division) {
  const name = String(division || "").trim();
  if (!name) return null;
  const row = DIVISION_THRESHOLD_SEED.find((item) => item.division_name === name);
  const floor = Number(row?.min_net_margin_pct);
  return Number.isFinite(floor) ? floor : null;
}

/**
 * Compares division_thresholds.min_net_margin_pct to DIVISION_MIN_NET_MARGIN_PCT.
 * Drift is reported; scoring never applies DB values. Exit 1 on any difference.
 *
 * Daily logic-lock check: "Division minimum margins equal the locked table."
 */
import { computeDivisionFloorDrift } from "../lib/divisionConfig.js";
import { initDb } from "../lib/db.js";

await initDb();
const result = await computeDivisionFloorDrift();
if (!result.ok) {
  console.error("Division minimum margins do NOT equal the locked table:");
  for (const d of result.drift || []) {
    console.error(`  ${d.division}: stored=${d.stored} locked=${d.locked} (${d.reason})`);
  }
  if (result.error) console.error(result.error);
  process.exit(1);
}
console.log("Division minimum margins equal the locked table.");

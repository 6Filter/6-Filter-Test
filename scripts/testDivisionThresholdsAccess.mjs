/**
 * Part 121 + locked margins: Settings API rejects min_net_margin_pct edits;
 * revenue/note remain writable. Margin floor column is display-only from lockedConstants.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-div-access-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { initDb, listDivisionThresholdRows } = await import("../lib/db.js");
const { saveDivisionThreshold, getDivisionThresholds } = await import("../lib/divisionConfig.js");
const { minNetMarginForDivision } = await import("../lib/lockedConstants.js");

await initDb();
const rows = await getDivisionThresholds();
assert.ok(rows.length >= 11);
const foods = rows.find((r) => r.division_name === "Foods");
assert.equal(foods.locked_min_net_margin_pct, 35);
assert.equal(minNetMarginForDivision("Foods"), 35);

await assert.rejects(
  () => saveDivisionThreshold(foods.id, { min_net_margin_pct: 5 }),
  (e) => e.status === 400 && /Minimum net margin is locked/.test(e.message)
);

const saved = await saveDivisionThreshold(foods.id, {
  note: "locked-margins-test",
  revenue_target_all_channels_cr: foods.revenue_target_all_channels_cr,
});
assert.equal(saved.note, "locked-margins-test");

const settingsSrc = readFileSync(new URL("../src/DivisionSettings.jsx", import.meta.url), "utf8");
assert.match(settingsSrc, /locked in code/i);
assert.doesNotMatch(settingsSrc, /<thead>/);
assert.doesNotMatch(settingsSrc, /patchDraft\(row\.id, "min_net_margin_pct"/);

const listed = await listDivisionThresholdRows();
assert.ok(listed.find((r) => r.division_name === "Foods"));

console.log("PASS testDivisionThresholdsAccess — margin locked, revenue/note editable");

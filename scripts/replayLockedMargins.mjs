/**
 * Replay restored ideas: sealed Log class vs live locked-floor scoring.
 * Lists every classification difference with a reason.
 * Expected differences: ideas with no division (now WATCH) — and none other for floor logic alone.
 *
 * Usage (scratch Postgres):
 *   TEST_DATABASE_URL=... node scripts/replayLockedMargins.mjs
 */
import { initDb, listPropositions } from "../lib/db.js";
import { computeAllAdvisoryChecks, computeGoNoGo } from "../lib/propositionScoring.js";
import { scoreAdvisoryChecks } from "../lib/goNoGo.js";
import { unmatchedDivisionPending } from "../lib/divisionMargin.js";

await initDb();
const rows = await listPropositions({ limit: 5000 });
const diffs = [];
for (const doc of rows) {
  const live = await computeAllAdvisoryChecks(doc);
  const liveClass = computeGoNoGo(live);
  const sealed = doc.goNoGo?.classification || null;
  const noDivision = !String(doc.division || "").trim();
  if (sealed && sealed !== liveClass) {
    let reason = "classification-changed";
    if (noDivision && unmatchedDivisionPending() && liveClass === "WATCH") {
      reason = "expected: no division → Pending F2 caps at WATCH";
    } else if (noDivision) {
      reason = "no-division";
    } else {
      reason = `sealed=${sealed} live=${liveClass} division=${doc.division || "(none)"} margin=${doc.f2?.netMarginAtScale}`;
    }
    diffs.push({
      id: doc.id,
      name: doc.name || "",
      sealed,
      live: liveClass,
      pct: scoreAdvisoryChecks(live).pct,
      reason,
    });
  }
}

const unexpected = diffs.filter((d) => !d.reason.startsWith("expected:"));
console.log(
  `Replay ${rows.length} ideas → ${diffs.length} classification differences (${unexpected.length} unexpected)`
);
for (const d of diffs) {
  console.log(`  ${d.id}  ${d.sealed}→${d.live}  ${d.reason}`);
}
if (unexpected.length) {
  console.error("Unexpected replay differences — investigate before shipping.");
  process.exit(1);
}
console.log("PASS replayLockedMargins — only expected no-division→WATCH differences (or none)");

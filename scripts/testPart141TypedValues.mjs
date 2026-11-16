/**
 * Part 141 C (D75) — typed values own their markers.
 * markChangedF2AsUserOwned: a changed GST clears gstBasis, a changed margin becomes netMarginSource "user",
 * unchanged values keep the markers exactly as sent.
 */
import assert from "node:assert/strict";
import { markChangedF2AsUserOwned } from "../lib/propositionsApi.js";

let checks = 0;
const ok = (fn) => {
  fn();
  checks += 1;
};

const stored = {
  gstRatePct: 18,
  gstBasis: "ai-suggested",
  netMarginAtScale: 12,
  netMarginSource: "ai",
  cogsAtScale: 32,
  grammage: "100 ml",
  mrpInr: 99,
};

ok(() => {
  const out = markChangedF2AsUserOwned({ ...stored, gstRatePct: 12 }, stored);
  assert.equal(out.gstRatePct, 12);
  assert.equal(out.gstBasis, "", "changed GST clears gstBasis");
  assert.equal(out.netMarginSource, "ai", "margin untouched keeps its source");
});

ok(() => {
  const out = markChangedF2AsUserOwned({ ...stored, netMarginAtScale: 15 }, stored);
  assert.equal(out.netMarginAtScale, 15);
  assert.equal(out.netMarginSource, "user", "changed margin is user-owned");
  assert.equal(out.gstBasis, "ai-suggested", "GST untouched keeps its basis");
});

ok(() => {
  const out = markChangedF2AsUserOwned({ ...stored }, stored);
  assert.deepEqual(out, stored, "nothing changed → nothing re-marked");
  assert.equal(out.gstBasis, "ai-suggested");
  assert.equal(out.netMarginSource, "ai");
});

ok(() => {
  // Numeric vs string forms of the same number are not a change.
  const out = markChangedF2AsUserOwned({ ...stored, gstRatePct: "18", netMarginAtScale: "12.0" }, stored);
  assert.equal(out.gstBasis, "ai-suggested");
  assert.equal(out.netMarginSource, "ai");
});

ok(() => {
  // Both changed at once.
  const out = markChangedF2AsUserOwned({ ...stored, gstRatePct: 5, netMarginAtScale: 20 }, stored);
  assert.equal(out.gstBasis, "");
  assert.equal(out.netMarginSource, "user");
});

ok(() => {
  // Absent key in the incoming payload is not a change (partial saves keep markers).
  const { gstRatePct, netMarginAtScale, ...rest } = stored;
  const out = markChangedF2AsUserOwned(rest, stored);
  assert.equal(out.gstBasis, "ai-suggested");
  assert.equal(out.netMarginSource, "ai");
});

ok(() => {
  // Never mutates inputs.
  const incoming = { ...stored, gstRatePct: 28 };
  const snapshot = JSON.stringify(incoming);
  const storedSnapshot = JSON.stringify(stored);
  markChangedF2AsUserOwned(incoming, stored);
  assert.equal(JSON.stringify(incoming), snapshot);
  assert.equal(JSON.stringify(stored), storedSnapshot);
});

ok(() => {
  // First value typed where nothing was stored counts as a change.
  const out = markChangedF2AsUserOwned({ gstRatePct: 18, netMarginAtScale: 10, gstBasis: "x" }, {});
  assert.equal(out.gstBasis, "");
  assert.equal(out.netMarginSource, "user");
  // Non-object input passes through.
  assert.equal(markChangedF2AsUserOwned(null, stored), null);
});

console.log(`PASS testPart141TypedValues (${checks} checks)`);

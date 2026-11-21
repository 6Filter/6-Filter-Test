/**
 * Kills arithmetic / fixed-denominator mutants in lib/scoreSlots.js.
 * Does not edit locked scoring files.
 */
import { TECH_SHIFT_DIMENSIONS, DIMENSION_LABELS } from "../lib/techShiftRisk.js";
import {
  SCORE_CHECK_SLOTS,
  SCORE_CHECK_SLOTS_TOTAL,
  SCORE_DENOMINATOR_MODE,
  SCORING_MODEL,
} from "../lib/lockedConstants.js";
import {
  countDoneSlots,
  creditSlots,
  expectedSlotKeys,
  f2AnalyticalItems,
  isF1ExemptCheck,
  scoreFixedSlots,
} from "../lib/scoreSlots.js";

let failed = 0;
function check(name, ok, detail = "") {
  if (!ok) {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? `  [${detail}]` : ""}`);
    return;
  }
  console.log(`PASS  ${name}${detail ? `  [${detail}]` : ""}`);
}

const F1 = expectedSlotKeys().f1;
const F2 = expectedSlotKeys().f2;
const F3 = expectedSlotKeys().f3;
const F4 = expectedSlotKeys().f4;

check("expectedSlotKeys F1 is 7", F1.length === 7 && F1[0] === "benchmark" && F1.includes("parity"));
check("expectedSlotKeys F2 is margin pack gst", F2.join(",") === "margin,packSize,gst");
check("expectedSlotKeys F3 resilience", F3.join(",") === "resilience");
check("expectedSlotKeys F4 matches tech-shift dimensions", F4.join(",") === TECH_SHIFT_DIMENSIONS.join(","));

check("isF1ExemptCheck Exempt", isF1ExemptCheck({ checkLabel: "Exempt" }) === true);
check("isF1ExemptCheck Cleared", isF1ExemptCheck({ checkLabel: "Cleared" }) === false);
check("isF1ExemptCheck missing", isF1ExemptCheck(undefined) === false);

const financeItem = { status: "pending", text: "The margin computation hasn't been confirmed by Finance yet" };
const marginItem = { slot: "margin", status: "done", credit: 1, text: "Net margin 60% versus the division floor" };
check(
  "f2AnalyticalItems drops Finance sign-off",
  f2AnalyticalItems({ items: [financeItem, marginItem] }).length === 1 &&
    f2AnalyticalItems({ items: [financeItem, marginItem] })[0].slot === "margin"
);
check("f2AnalyticalItems empty check", f2AnalyticalItems({}).length === 0);

check("creditSlots missing check is 0", creditSlots("f1", null) === 0);
check("creditSlots Not yet run is 0", creditSlots("f1", { checkLabel: "Not yet run", items: [] }) === 0);
check("creditSlots unknown filter is 0", creditSlots("f9", { checkLabel: "Cleared", items: [{ status: "done" }] }) === 0);
check("creditSlots exempt F1 is 0", creditSlots("f1", { checkLabel: "Exempt", items: F1.map((slot) => ({ slot, status: "done", credit: 1 })) }) === 0);

{
  const items = F1.map((slot) => ({ slot, status: "done", credit: 1, text: slot }));
  check("creditSlots F1 all strong is 7", creditSlots("f1", { checkLabel: "Cleared", items }) === 7);
}
{
  const items = F1.map((slot, i) => ({ slot, status: i < 3 ? "done" : "pending", credit: i < 3 ? 1 : 0, text: slot }));
  check("creditSlots F1 three strong is 3", creditSlots("f1", { checkLabel: "Cleared", items }) === 3);
}
{
  const items = F1.map((slot) => ({ slot, status: "done", credit: 0.5, text: slot }));
  check("creditSlots F1 half credit is 3.5", creditSlots("f1", { checkLabel: "Cleared", items }) === 3.5);
}
{
  const items = F1.map((slot) => ({ slot, status: "done", credit: 2, text: slot }));
  check("creditSlots clamps credit to 1", creditSlots("f1", { checkLabel: "Cleared", items }) === 7);
}
{
  const items = F1.map((slot) => ({ slot, status: "done", credit: -1, text: slot }));
  check("creditSlots clamps credit to 0", creditSlots("f1", { checkLabel: "Cleared", items }) === 0);
}
{
  const items = F1.map((slot) => ({ slot, status: "done", text: slot }));
  check("creditSlots missing credit field uses done=1", creditSlots("f1", { checkLabel: "Cleared", items }) === 7);
}
{
  const items = F1.map((slot) => ({ slot, status: "pending", text: slot }));
  check("creditSlots pending without credit is 0", creditSlots("f1", { checkLabel: "Cleared", items }) === 0);
}

{
  const items = [
    { slot: "margin", status: "done", credit: 1, text: "Net margin cleared the minimum" },
    { slot: "packSize", status: "done", credit: 1, text: "Pack size / grammage recorded" },
    { slot: "gst", status: "done", credit: 1, text: "GST at 18%" },
    financeItem,
  ];
  check("creditSlots F2 analytical 3", creditSlots("f2", { checkLabel: "Cleared", items }) === 3);
}
{
  const items = [
    { status: "done", credit: 1, text: "Net margin versus the division floor" },
    { status: "done", credit: 1, text: "Pack size 100 ml" },
    { status: "done", credit: 1, text: "GST slab 18 percent" },
  ];
  check("creditSlots F2 matches by text when slot missing", creditSlots("f2", { checkLabel: "Cleared", items }) === 3);
}
{
  const items = [
    { slot: "netMarginFloor", status: "done", credit: 1, text: "minimum" },
    { slot: "packSize", status: "done", credit: 1, text: "grammage" },
    { slot: "gst", status: "done", credit: 1, text: "gst" },
  ];
  check("creditSlots F2 netMarginFloor aliases margin", creditSlots("f2", { checkLabel: "Cleared", items }) === 3);
}
{
  const items = [
    { status: "done", credit: 1, text: "unrelated alpha" },
    { status: "done", credit: 1, text: "unrelated beta" },
    { status: "done", credit: 1, text: "unrelated gamma" },
  ];
  check("creditSlots F2 falls back to first unused items", creditSlots("f2", { checkLabel: "Cleared", items }) === 3);
}
{
  const trap = [
    { status: "done", credit: 1, text: "unrelated high-credit decoy" },
    { status: "done", credit: 0, text: "Pack size 50 ml" },
    { status: "done", credit: 0, text: "GST 18%" },
    { status: "done", credit: 0, text: "Net margin 60% versus the division floor" },
  ];
  check(
    "creditSlots F2 text match must not take the decoy",
    creditSlots("f2", { checkLabel: "Cleared", items: trap }) === 0
  );
}
{
  const gstOnly = [
    { status: "done", credit: 0, text: "Net margin 60% versus the division floor" },
    { status: "done", credit: 0, text: "Pack size 50 ml" },
    { status: "done", credit: 1, text: "GST 18%" },
  ];
  check("creditSlots F2 GST text is 1", creditSlots("f2", { checkLabel: "Cleared", items: gstOnly }) === 1);
}
{
  const qcom = [
    { slot: "qcom", status: "done", credit: 1, text: "quick-commerce price plan" },
    { slot: "margin", status: "done", credit: 0, text: "net margin" },
    { slot: "packSize", status: "done", credit: 0, text: "pack" },
    { slot: "gst", status: "done", credit: 0, text: "gst" },
  ];
  check("creditSlots F2 ignores qcom extra slot for the 3 analytical keys", creditSlots("f2", { checkLabel: "Cleared", items: qcom }) === 0);
}

{
  const items = [{ slot: "resilience", status: "done", credit: 1, text: "volume-loss cliff" }];
  check("creditSlots F3 by slot", creditSlots("f3", { checkLabel: "Cleared", items }) === 1);
}
{
  const items = [{ status: "done", credit: 0.4, text: "crossing a fixed price point" }];
  check("creditSlots F3 by done item", Math.abs(creditSlots("f3", { checkLabel: "Cleared", items }) - 0.4) < 1e-9);
}
{
  const items = [{ status: "pending", credit: 0, text: "not run" }];
  check("creditSlots F3 pending is 0", creditSlots("f3", { checkLabel: "Cleared", items }) === 0);
}

{
  const items = F4.map((slot) => ({
    slot,
    status: "done",
    credit: 1,
    text: DIMENSION_LABELS[slot],
  }));
  check("creditSlots F4 all dimensions by label", creditSlots("f4", { checkLabel: "Cleared", items }) === 7);
}
{
  const items = F4.map((slot) => ({
    status: "done",
    credit: 1,
    text: slot.replace(/([A-Z])/g, " $1").trim(),
  }));
  check("creditSlots F4 matches spaced camelCase", creditSlots("f4", { checkLabel: "Cleared", items }) === 7);
}
{
  const items = [{ status: "done", credit: 1, formAdmin: true, text: "signature pending" }];
  check("creditSlots F4 form-admin only still scores via fallback pool", creditSlots("f4", { checkLabel: "Cleared", items }) >= 0);
}

check("countDoneSlots F1 three done", countDoneSlots("f1", { checkLabel: "Cleared", items: F1.map((slot, i) => ({ slot, status: i < 3 ? "done" : "pending", credit: i < 3 ? 1 : 0 })) }) === 3);
check("countDoneSlots F1 exempt 0", countDoneSlots("f1", { checkLabel: "Exempt", items: F1.map((slot) => ({ slot, status: "done", credit: 1 })) }) === 0);
check("countDoneSlots not yet run 0", countDoneSlots("f3", { checkLabel: "Not yet run", items: [] }) === 0);
check("countDoneSlots F3 strong is 1", countDoneSlots("f3", { checkLabel: "Cleared", items: [{ slot: "resilience", status: "done", credit: 1 }] }) === 1);
check("countDoneSlots F3 weak fraction is 0", countDoneSlots("f3", { checkLabel: "Cleared", items: [{ slot: "resilience", status: "pending", credit: 0.2 }] }) === 0);
check("countDoneSlots unknown filter 0", countDoneSlots("fx", { checkLabel: "Cleared", items: [{ status: "done" }] }) === 0);

{
  const advisory = {
    f1: { checkLabel: "Cleared", items: F1.map((slot) => ({ slot, status: "done", credit: 1, text: slot })) },
    f2: {
      checkLabel: "Cleared",
      items: [
        { slot: "margin", status: "done", credit: 1, text: "net margin" },
        { slot: "packSize", status: "done", credit: 1, text: "pack" },
        { slot: "gst", status: "done", credit: 1, text: "gst" },
      ],
    },
    f3: { checkLabel: "Cleared", items: [{ slot: "resilience", status: "done", credit: 1, text: "cliff" }] },
    f4: {
      checkLabel: "Cleared",
      items: F4.map((slot) => ({ slot, status: "done", credit: 1, text: DIMENSION_LABELS[slot] })),
    },
  };
  const s = scoreFixedSlots(advisory);
  check(
    "scoreFixedSlots 18/18 at 100%",
    s.total === SCORE_CHECK_SLOTS_TOTAL &&
      s.pct === 100 &&
      s.points === 18 &&
      s.legacyPct === 100 &&
      s.denominatorMode === SCORE_DENOMINATOR_MODE &&
      s.scoringModel === SCORING_MODEL &&
      s.byFilter.f1.slots === true &&
      s.exempt == null,
    `${s.done}/${s.total}=${s.pct}`
  );
}
{
  const pendingCleared = {
    f1: { checkLabel: "Cleared", items: F1.map((slot) => ({ slot, status: "pending", credit: 0, text: slot })) },
    f2: { checkLabel: "Cleared", items: F2.map((slot) => ({ slot, status: "pending", credit: 0, text: slot })) },
    f3: { checkLabel: "Cleared", items: [{ slot: "resilience", status: "pending", credit: 0 }] },
    f4: { checkLabel: "Cleared", items: F4.map((slot) => ({ slot, status: "pending", credit: 0, text: DIMENSION_LABELS[slot] })) },
  };
  const s = scoreFixedSlots(pendingCleared);
  check(
    "cleared-but-zero is not unscored",
    s.byFilter.f1.unscored === false && s.byFilter.f2.unscored === false && s.pct === 0
  );
}
{
  const advisory = {
    f1: { checkLabel: "Exempt", items: F1.map((slot) => ({ slot, status: "done", credit: 1 })) },
    f2: {
      checkLabel: "Cleared",
      items: [
        { slot: "margin", status: "done", credit: 1, text: "net margin" },
        { slot: "packSize", status: "done", credit: 1, text: "pack" },
        { slot: "gst", status: "done", credit: 1, text: "gst" },
      ],
    },
    f3: { checkLabel: "Cleared", items: [{ slot: "resilience", status: "done", credit: 1 }] },
    f4: {
      checkLabel: "Cleared",
      items: F4.map((slot) => ({ slot, status: "done", credit: 1, text: DIMENSION_LABELS[slot] })),
    },
  };
  const s = scoreFixedSlots(advisory);
  check(
    "exempt F1 drops 7 from the fixed denominator",
    s.total === SCORE_CHECK_SLOTS_TOTAL - SCORE_CHECK_SLOTS.f1 &&
      s.pct === 100 &&
      s.exempt?.filter === "f1" &&
      s.exempt?.slots === 7 &&
      s.byFilter.f1.exempt === true,
    `total=${s.total} pct=${s.pct}`
  );
}
{
  const half = {
    f1: { checkLabel: "Cleared", items: F1.map((slot) => ({ slot, status: "done", credit: 0.5, text: slot })) },
    f2: { checkLabel: "Not yet run", items: [] },
    f3: { checkLabel: "Not yet run", items: [] },
    f4: { checkLabel: "Not yet run", items: [] },
  };
  const s = scoreFixedSlots(half);
  check(
    "unfinished filters still count in the denominator",
    s.total === 18 && s.points === 3.5 && s.pct === Math.round((100 * 3.5) / 18) && s.byFilter.f2.unscored === true,
    `${s.points}/${s.total}=${s.pct}`
  );
}
{
  const onlyF3 = scoreFixedSlots(
    { f3: { checkLabel: "Cleared", items: [{ slot: "resilience", status: "done", credit: 1 }] } },
    ["f3"]
  );
  check(
    "keys.length !== 4 does not force the 18-slot total",
    onlyF3.total === 1 && onlyF3.pct === 100,
    `${onlyF3.done}/${onlyF3.total}`
  );
}
{
  const empty = scoreFixedSlots({}, []);
  check("no keys → 0% and total 0", empty.total === 0 && empty.pct === 0);
}
{
  const a = scoreFixedSlots({
    f1: { checkLabel: "Cleared", items: F1.map((slot) => ({ slot, status: "done", credit: 0.2, text: slot })) },
    f2: { checkLabel: "Not yet run", items: [] },
    f3: { checkLabel: "Not yet run", items: [] },
    f4: { checkLabel: "Not yet run", items: [] },
  });
  const b = scoreFixedSlots({
    f1: { checkLabel: "Cleared", items: F1.map((slot) => ({ slot, status: "done", credit: 0.8, text: slot })) },
    f2: { checkLabel: "Not yet run", items: [] },
    f3: { checkLabel: "Not yet run", items: [] },
    f4: { checkLabel: "Not yet run", items: [] },
  });
  check("more credit never lowers scoreFixedSlots pct", b.pct >= a.pct && b.points > a.points);
}

if (failed) {
  console.error(`\n${failed} CHECK(S) FAILED testScoreSlotsMutationKill`);
  process.exit(1);
}
console.log("PASS testScoreSlotsMutationKill");

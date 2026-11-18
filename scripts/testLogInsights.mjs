/**
 * Part 148 — lib/logInsights.js: India-time bucketing, submitted vs draft, team/month/person/date summaries,
 * monthly trend, fixed-rule insights, CSV.
 * NOTE: the owner's attached testLogInsights.mjs / logInsights.reference.mjs were not on disk when this was built,
 * so this file is the author's equivalent. Replace it with the attached file if you have it.
 */
import assert from "node:assert/strict";
import {
  THRESHOLDS,
  fyLabel,
  generateInsights,
  isSubmitted,
  istParts,
  monthlyTrend,
  periodRange,
  summarize,
  summaryToCsv,
} from "../lib/logInsights.js";
import { logStats, rowSubmittedMonthKey, uniqueMonthKeys, applyMonthFilter, rowDateIso } from "../lib/logStatus.js";

let n = 0;
function check(name, fn) {
  try {
    fn();
    n += 1;
    console.log(`  ok ${n} — ${name}`);
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

let seq = 0;
function idea({ at, team = "R&D", who = "Asha", email, verdict = "GO", state, submittedAt, researchAt, ai = true } = {}) {
  seq += 1;
  const st = state || (verdict === "" ? "not-evaluated" : verdict === "INCOMPLETE-STATE" ? "incomplete" : "evaluated");
  return {
    id: `r${seq}`,
    name: `Idea ${seq}`,
    createdAt: at,
    firstSubmittedAt: submittedAt || (st === "not-evaluated" ? null : at),
    researchRunAt: researchAt === undefined ? (st === "not-evaluated" || !ai ? null : at) : researchAt,
    submitterDepartment: team,
    submitterName: who,
    createdByEmail: email || `${who.toLowerCase()}@x.com`,
    evaluationState: st,
    classification: st === "evaluated" ? verdict : "",
  };
}
const many = (count, props) => Array.from({ length: count }, () => idea(props));

const NOW = Date.parse("2026-11-18T06:00:00.000Z"); // 18 Nov 2026, 11:30 IST

// ---- India time ----
check("IST bucketing: 31 Oct 19:00 UTC is 1 Nov in India", () => {
  assert.equal(istParts("2026-10-31T19:00:00.000Z").monthKey, "2026-11");
  assert.equal(istParts("2026-10-31T18:29:59.000Z").monthKey, "2026-10");
  assert.equal(istParts("2026-10-31T18:30:00.000Z").ymd, "2026-11-01");
  assert.equal(rowSubmittedMonthKey({ createdAt: "2026-10-31T19:00:00.000Z" }), "2026-11");
});
check("IST bucketing: the financial-year turn (31 Mar / 1 Apr, India time)", () => {
  assert.equal(fyLabel("2027-03-31T18:29:00.000Z"), "FY 2026-27");
  assert.equal(fyLabel("2027-03-31T18:30:00.000Z"), "FY 2027-28");
  assert.equal(fyLabel("2026-04-01T00:00:00.000Z"), "FY 2026-27");
  assert.equal(fyLabel("2026-03-31T20:00:00.000Z"), "FY 2026-27");
  assert.equal(fyLabel("2026-03-31T10:00:00.000Z"), "FY 2025-26");
});
check("istParts returns null for missing or invalid dates", () => {
  assert.equal(istParts(""), null);
  assert.equal(istParts(null), null);
  assert.equal(istParts("not a date"), null);
});
check("logStats: 'this month' is the India month, not the browser zone", () => {
  const rows = [idea({ at: "2026-10-31T19:00:00.000Z" }), idea({ at: "2026-10-31T10:00:00.000Z" })];
  const now = Date.parse("2026-11-15T00:00:00.000Z");
  assert.equal(logStats(rows, now).submittedThisMonth, 1);
});

// ---- submitted vs drafts ----
check("submitted = evaluated, legacy or incomplete; drafts are never counted as submitted", () => {
  assert.equal(isSubmitted({ evaluationState: "evaluated" }), true);
  assert.equal(isSubmitted({ evaluationState: "legacy" }), true);
  assert.equal(isSubmitted({ evaluationState: "incomplete" }), true);
  assert.equal(isSubmitted({ evaluationState: "not-evaluated" }), false);
  const rows = [...many(3, { at: "2026-11-02T05:00:00Z" }), ...many(2, { at: "2026-11-03T05:00:00Z", verdict: "" })];
  const s = summarize(rows, "team", { now: NOW });
  assert.equal(s.totals.submitted, 3);
  assert.equal(s.totals.drafts, 2);
  assert.equal(s.totals.started, 5);
  const stats = logStats(rows, NOW);
  assert.equal(stats.submitted + stats.drafts, stats.total);
});
check("the verdict split adds up to submitted (INCOMPLETE and incomplete state included)", () => {
  const rows = [
    idea({ at: "2026-11-02T05:00:00Z", verdict: "GO" }),
    idea({ at: "2026-11-02T05:00:00Z", verdict: "WATCH" }),
    idea({ at: "2026-11-02T05:00:00Z", verdict: "NO-GO" }),
    idea({ at: "2026-11-02T05:00:00Z", verdict: "INCOMPLETE" }),
    idea({ at: "2026-11-02T05:00:00Z", verdict: "INCOMPLETE-STATE" }),
    idea({ at: "2026-11-02T05:00:00Z", verdict: "" }),
  ];
  const t = summarize(rows, "team", { now: NOW }).totals;
  assert.equal(t.GO + t.WATCH + t["NO-GO"] + t.INCOMPLETE, t.submitted);
  assert.deepEqual([t.GO, t.WATCH, t["NO-GO"], t.INCOMPLETE, t.drafts], [1, 1, 1, 2, 1]);
  assert.equal(t.goRate, 33.3);
});

// ---- dates (D120) ----
check("a row counts on firstSubmittedAt, else researchRunAt, else createdAt", () => {
  assert.equal(rowDateIso({ firstSubmittedAt: "2026-10-05T00:00:00Z", researchRunAt: "2026-11-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" }), "2026-10-05T00:00:00Z");
  assert.equal(rowDateIso({ researchRunAt: "2026-11-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" }), "2026-11-01T00:00:00Z");
  assert.equal(rowDateIso({ createdAt: "2026-09-01T00:00:00Z" }), "2026-09-01T00:00:00Z");
  const row = idea({ at: "2026-09-10T05:00:00Z", submittedAt: "2026-10-20T05:00:00Z" });
  assert.equal(rowSubmittedMonthKey(row), "2026-10");
});
check("a draft counts on its creation date", () => {
  const d = idea({ at: "2026-08-12T05:00:00Z", verdict: "" });
  assert.equal(rowSubmittedMonthKey(d), "2026-08");
  const s = summarize([d], "month", { now: NOW });
  assert.equal(s.groups.find((g) => g.key === "2026-08").drafts, 1);
});

// ---- team ----
const base = [
  ...many(4, { at: "2026-11-02T05:00:00Z", team: "R&D", who: "Asha", verdict: "GO" }),
  ...many(2, { at: "2026-11-03T05:00:00Z", team: "R&D", who: "Ravi", verdict: "NO-GO" }),
  ...many(3, { at: "2026-11-04T05:00:00Z", team: "CIA", who: "Meena", verdict: "WATCH" }),
  ...many(1, { at: "2026-11-05T05:00:00Z", team: "CIA", who: "Meena", verdict: "" }),
];
check("team summary: counts per team, biggest first, totals row", () => {
  const s = summarize(base, "team", { now: NOW });
  assert.deepEqual(s.groups.map((g) => [g.label, g.submitted, g.drafts]), [["R&D", 6, 0], ["CIA", 3, 1]]);
  assert.equal(s.totals.submitted, 9);
  assert.equal(s.totals.drafts, 1);
  assert.equal(s.groups[0].filterValue, "R&D");
});
check("team summary: GO rate and AI used per team", () => {
  const rd = summarize(base, "team", { now: NOW }).groups.find((g) => g.label === "R&D");
  assert.equal(rd.goRate, 66.7);
  assert.equal(rd.aiUsed, 6);
  const cia = summarize(base, "team", { now: NOW }).groups.find((g) => g.label === "CIA");
  assert.equal(cia.goRate, 0);
  assert.equal(cia.goOrWatchRate, 100);
});
check("a team that is blank shows as 'No team' and cannot be used as a filter", () => {
  const g = summarize([idea({ at: "2026-11-02T05:00:00Z", team: "" })], "team", { now: NOW }).groups[0];
  assert.equal(g.label, "No team");
  assert.equal(g.filterValue, "");
});

// ---- month ----
check("month summary is zero-filled and chronological", () => {
  const rows = [idea({ at: "2026-08-10T05:00:00Z" }), idea({ at: "2026-11-02T05:00:00Z" })];
  const s = summarize(rows, "month", { now: NOW });
  assert.deepEqual(s.groups.map((g) => [g.key, g.submitted]), [["2026-08", 1], ["2026-09", 0], ["2026-10", 0], ["2026-11", 1]]);
  assert.equal(s.groups[0].label, "Aug 2026");
});
check("month summary respects the period and is zero-filled inside it", () => {
  const rows = [idea({ at: "2026-08-25T05:00:00Z" }), idea({ at: "2026-11-02T05:00:00Z" })];
  const s = summarize(rows, "month", { range: periodRange("last-90", NOW), now: NOW });
  assert.deepEqual(s.groups.map((g) => g.key), ["2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.equal(s.totals.submitted, 2);
  const one = summarize(rows, "month", { range: periodRange("this-month", NOW), now: NOW });
  assert.deepEqual(one.groups.map((g) => g.key), ["2026-11"]);
  assert.equal(one.totals.submitted, 1);
});

// ---- person ----
check("person summary tells two people with the same name apart by email", () => {
  const rows = [
    idea({ at: "2026-11-02T05:00:00Z", who: "Ravi", email: "ravi.a@x.com" }),
    idea({ at: "2026-11-02T05:00:00Z", who: "Ravi", email: "ravi.a@x.com" }),
    idea({ at: "2026-11-02T05:00:00Z", who: "Ravi", email: "ravi.b@x.com" }),
  ];
  const g = summarize(rows, "person", { now: NOW }).groups;
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => x.submitted), [2, 1]);
  assert.ok(g[0].label.includes("ravi.a@x.com") && g[1].label.includes("ravi.b@x.com"));
});
check("person summary: same person on different cases of email is one person", () => {
  const rows = [idea({ at: "2026-11-02T05:00:00Z", who: "Asha", email: "Asha@X.com" }), idea({ at: "2026-11-02T05:00:00Z", who: "Asha", email: "asha@x.com" })];
  assert.equal(summarize(rows, "person", { now: NOW }).groups.length, 1);
});

// ---- date ----
check("date summary is day by day, zero-filled, with drafts beside submitted", () => {
  const rows = [idea({ at: "2026-11-16T05:00:00Z" }), idea({ at: "2026-11-18T05:00:00Z" }), idea({ at: "2026-11-18T05:00:00Z", verdict: "" })];
  const s = summarize(rows, "date", { now: NOW });
  assert.deepEqual(s.groups.map((g) => [g.key, g.submitted, g.drafts]), [["2026-11-16", 1, 0], ["2026-11-17", 0, 0], ["2026-11-18", 1, 1]]);
});
check("date summary uses India days (late evening UTC is the next day)", () => {
  const s = summarize([idea({ at: "2026-11-16T20:00:00Z" })], "date", { now: NOW });
  assert.equal(s.groups[0].key, "2026-11-17");
});

// ---- periods ----
check("period ranges: this month, 30/90 days, financial years, all time, custom", () => {
  assert.deepEqual(periodRange("this-month", NOW), { id: "this-month", label: "This month", from: "2026-11-01", to: "2026-11-18" });
  assert.equal(periodRange("last-30", NOW).from, "2026-10-20");
  assert.equal(periodRange("last-90", NOW).from, "2026-08-21");
  const fy = periodRange("this-fy", NOW);
  assert.deepEqual([fy.label, fy.from, fy.to], ["FY 2026-27", "2026-04-01", "2026-11-18"]);
  const last = periodRange("last-fy", NOW);
  assert.deepEqual([last.label, last.from, last.to], ["FY 2025-26", "2025-04-01", "2026-03-31"]);
  assert.deepEqual(periodRange("all", NOW), { id: "all", label: "All time", from: null, to: null });
  const c = periodRange("custom", NOW, { from: "2026-11-10", to: "2026-11-01" });
  assert.deepEqual([c.from, c.to], ["2026-11-01", "2026-11-10"]);
});
check("this financial year in January is still FY ending that March", () => {
  const jan = Date.parse("2027-01-10T06:00:00Z");
  assert.equal(periodRange("this-fy", jan).label, "FY 2026-27");
  assert.equal(periodRange("last-fy", jan).label, "FY 2025-26");
  const apr = Date.parse("2027-04-01T00:00:00Z");
  assert.equal(periodRange("this-fy", apr).label, "FY 2027-28");
});
check("a period filters the rows: a financial year holds only its own ideas", () => {
  const rows = [idea({ at: "2026-03-31T10:00:00Z" }), idea({ at: "2026-03-31T20:00:00Z" }), idea({ at: "2026-04-02T10:00:00Z" })];
  assert.equal(summarize(rows, "team", { range: periodRange("this-fy", NOW), now: NOW }).totals.submitted, 2);
  assert.equal(summarize(rows, "team", { range: periodRange("last-fy", NOW), now: NOW }).totals.submitted, 1);
});

// ---- trend ----
check("monthly trend: change vs previous month, three-month average, partial month, no division by zero", () => {
  const rows = [
    ...many(10, { at: "2026-08-10T05:00:00Z" }),
    ...many(0, { at: "2026-09-10T05:00:00Z" }),
    ...many(5, { at: "2026-10-10T05:00:00Z" }),
    ...many(2, { at: "2026-11-10T05:00:00Z" }),
  ];
  const t = monthlyTrend(rows, { now: NOW });
  assert.deepEqual(t.map((m) => m.submitted), [10, 0, 5, 2]);
  assert.equal(t[0].change, null);
  assert.equal(t[1].change, -10);
  assert.equal(t[1].changePercent, -100);
  assert.equal(t[2].change, 5);
  assert.equal(t[2].changePercent, null, "previous month was zero: no percentage");
  assert.equal(t[3].inProgress, true);
  assert.equal(t[3].change, null, "month in progress shows no change");
  assert.equal(t[3].average, null);
  assert.equal(t[2].average, 5);
  assert.equal(t[1].average, 5);
});

// ---- insights ----
function seriesRows(counts, { team = "R&D" } = {}) {
  return counts.flatMap((c, i) => many(c, { at: `2026-${String(i + 6).padStart(2, "0")}-10T05:00:00Z`, team }));
}
check("insight: month-on-month fall carries its numbers", () => {
  const rows = [...many(20, { at: "2026-09-10T05:00:00Z", team: "A" }), ...many(14, { at: "2026-10-10T05:00:00Z", team: "A" })];
  const i = generateInsights(rows, { now: NOW }).find((x) => x.id === "month-change");
  assert.equal(i.text, "Ideas fell 30% in Oct 2026 (14 vs 20 in Sep 2026).");
  assert.equal(i.icon, "↓");
  assert.deepEqual([i.numbers.current, i.numbers.previous], [14, 20]);
});
check("insight: a rise, and no alarm when the previous month is below the minimum or the move is small", () => {
  const rise = generateInsights([...many(10, { at: "2026-09-10T05:00:00Z" }), ...many(15, { at: "2026-10-10T05:00:00Z" })], { now: NOW });
  assert.match(rise.find((x) => x.id === "month-change").text, /^Ideas rose 50% in Oct 2026 \(15 vs 10 in Sep 2026\)\.$/);
  const tiny = generateInsights([...many(4, { at: "2026-09-10T05:00:00Z" }), ...many(1, { at: "2026-10-10T05:00:00Z" })], { now: NOW });
  assert.equal(tiny.find((x) => x.id === "month-change"), undefined);
  const small = generateInsights([...many(20, { at: "2026-09-10T05:00:00Z" }), ...many(18, { at: "2026-10-10T05:00:00Z" })], { now: NOW });
  assert.equal(small.find((x) => x.id === "month-change"), undefined);
});
check("insight: three full months in a row", () => {
  const i = generateInsights(seriesRows([6, 8, 10, 12, 14]), { now: NOW }).find((x) => x.id === "streak");
  assert.match(i.text, /risen 3 months in a row \(8 → 10 → 12 → 14/);
  assert.equal(generateInsights(seriesRows([2, 3, 4, 5, 6]), { now: NOW }).find((x) => x.id === "streak"), undefined);
});
check("insight: NO-GO share jump needs enough verdicts", () => {
  const calm = [8, 9, 10].flatMap((_, i) => [
    ...many(8, { at: `2026-0${7 + i}-10T05:00:00Z`, verdict: "GO" }),
    ...many(2, { at: `2026-0${7 + i}-11T05:00:00Z`, verdict: "NO-GO" }),
  ]);
  const jump = [...many(5, { at: "2026-10-10T05:00:00Z", verdict: "GO" }), ...many(5, { at: "2026-10-11T05:00:00Z", verdict: "NO-GO" })];
  const found = generateInsights([...calm, ...jump], { now: NOW }).find((x) => x.id === "nogo-jump");
  assert.match(found.text, /NO-GO share rose to 50% in Oct 2026 \(5 of 10\), against 20% over the previous 3 months/);
  const few = [...calm, ...many(2, { at: "2026-10-10T05:00:00Z", verdict: "NO-GO" })];
  assert.equal(generateInsights(few, { now: NOW }).find((x) => x.id === "nogo-jump"), undefined);
});
check("insight: concentration, best GO-or-WATCH rate, quiet team, drafts, busiest team", () => {
  const rows = [
    ...many(18, { at: "2026-11-02T05:00:00Z", team: "R&D", verdict: "GO" }),
    ...many(9, { at: "2026-11-03T05:00:00Z", team: "R&D", verdict: "NO-GO" }),
    ...many(8, { at: "2026-11-04T05:00:00Z", team: "CIA", verdict: "GO" }),
    ...many(2, { at: "2026-11-04T05:00:00Z", team: "CIA", verdict: "WATCH" }),
    ...many(3, { at: "2026-10-01T05:00:00Z", team: "FD and Dairy", verdict: "GO" }),
    ...many(25, { at: "2026-11-05T05:00:00Z", team: "R&D", verdict: "" }),
    ...many(1, { at: "2026-11-05T05:00:00Z", team: "Other", verdict: "NO-GO" }),
  ];
  const ins = generateInsights(rows, { now: NOW });
  const ids = ins.map((x) => x.id);
  assert.ok(ids.includes("concentration") && ids.includes("best-rate") && ids.includes("quiet-team") && ids.includes("drafts") && ids.includes("busiest"));
  assert.match(ins.find((x) => x.id === "concentration").text, /^Submissions are concentrated: R&D accounts for 65.9% of ideas\.$/);
  assert.match(ins.find((x) => x.id === "best-rate").text, /^CIA: 100% of evaluated ideas read GO or WATCH, against 75\.6% overall\.$/);
  assert.equal(ins.find((x) => x.id === "quiet-team").text, "FD and Dairy has not submitted since 2026-10-01.");
  assert.match(ins.find((x) => x.id === "drafts").text, /^37\.9% of started ideas were never submitted \(25 drafts\)\.$/);
  assert.equal(ins.find((x) => x.id === "busiest").text, "R&D submitted 27 of 41 ideas (65.9%).");
});
check("insights: every insight has numbers and there are at most six", () => {
  const rows = [
    ...many(20, { at: "2026-09-10T05:00:00Z", team: "R&D", verdict: "NO-GO" }),
    ...many(14, { at: "2026-10-10T05:00:00Z", team: "R&D", verdict: "GO" }),
    ...many(6, { at: "2026-07-10T05:00:00Z", team: "Old", verdict: "GO" }),
    ...many(6, { at: "2026-06-10T05:00:00Z", team: "Older", verdict: "GO" }),
    ...many(20, { at: "2026-10-12T05:00:00Z", team: "R&D", verdict: "" }),
  ];
  const ins = generateInsights(rows, { now: NOW });
  assert.ok(ins.length > 0 && ins.length <= THRESHOLDS.maxInsights);
  for (const i of ins) {
    assert.match(i.text, /\d/, `no numbers in: ${i.text}`);
    assert.ok(i.numbers && Object.keys(i.numbers).length > 0);
  }
});
check("small samples raise no alarm", () => {
  const rows = [...many(2, { at: "2026-10-10T05:00:00Z", team: "A", verdict: "NO-GO" }), ...many(1, { at: "2026-09-10T05:00:00Z", team: "B", verdict: "GO" }), ...many(1, { at: "2026-10-10T05:00:00Z", team: "A", verdict: "" })];
  assert.deepEqual(generateInsights(rows, { now: NOW }), []);
  assert.deepEqual(generateInsights([], { now: NOW }), []);
});
check("insights are reproducible in any row order", () => {
  const rows = [
    ...many(20, { at: "2026-09-10T05:00:00Z", team: "R&D", verdict: "GO" }),
    ...many(14, { at: "2026-10-10T05:00:00Z", team: "CIA", verdict: "WATCH" }),
    ...many(3, { at: "2026-08-10T05:00:00Z", team: "FD", verdict: "NO-GO" }),
  ];
  const a = JSON.stringify(generateInsights(rows, { now: NOW }));
  const b = JSON.stringify(generateInsights([...rows].reverse(), { now: NOW }));
  const c = JSON.stringify(generateInsights([...rows].sort((x, y) => String(x.id).localeCompare(String(y.id))), { now: NOW }));
  assert.equal(a, b);
  assert.equal(a, c);
});

// ---- CSV ----
check("CSV: byte-order mark, header, quoted commas, CRLF, All row", () => {
  const rows = [idea({ at: "2026-11-02T05:00:00Z", team: 'Foods, "Snacks"', verdict: "GO" }), idea({ at: "2026-11-02T05:00:00Z", team: "CIA", verdict: "" })];
  const csv = summaryToCsv(summarize(rows, "team", { now: NOW }), { column: "Team" });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], "Team,Submitted,Drafts,GO,WATCH,NO-GO,INCOMPLETE,AI used,GO rate");
  assert.equal(lines[1], '"Foods, ""Snacks""",1,0,1,0,0,0,1,100%');
  assert.ok(lines[3].startsWith("All,1,1,1,"));
  assert.ok(csv.endsWith("\r\n"));
  assert.ok(!csv.slice(1).replace(/\r\n/g, "").includes("\n"));
});

// ---- only the rows given ----
check("only the rows given appear (a person or team not in the rows cannot show up)", () => {
  const rows = [idea({ at: "2026-11-02T05:00:00Z", team: "CIA", who: "Meena" })];
  for (const by of ["team", "person", "month", "date"]) {
    const s = summarize(rows, by, { now: NOW });
    assert.ok(!JSON.stringify(s).includes("R&D"));
    assert.ok(!JSON.stringify(s).includes("Asha"));
  }
  assert.ok(!JSON.stringify(generateInsights(rows, { now: NOW })).includes("Asha"));
});
check("month filter and month list use the same India key", () => {
  const rows = [idea({ at: "2026-10-31T19:00:00Z" }), idea({ at: "2026-10-31T10:00:00Z" })];
  assert.deepEqual(uniqueMonthKeys(rows), ["2026-11", "2026-10"]);
  assert.equal(applyMonthFilter(rows, "2026-11").length, 1);
  assert.equal(summarize(rows, "month", { now: NOW }).groups.find((g) => g.key === "2026-11").submitted, 1);
});

console.log(`PASS Part 148 log insights (${n} checks)`);

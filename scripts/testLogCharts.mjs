/**
 * Part 148 — src/LogCharts.jsx mounted for real in jsdom: proportional bars, verdict segments, tooltips, hidden
 * table and spoken summary, click and keyboard drill-down, month trend labels, empty states, colours from CSS
 * variables only, insights list, no chart library.
 * NOTE: the owner's attached testLogCharts.mjs / LogCharts.reference.jsx were not on disk when this was built, so
 * this file is the author's equivalent. Replace it with the attached file if you have it.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
async function check(name, fn) {
  try {
    await fn();
    n += 1;
    console.log(`  ok ${n} — ${name}`);
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });

const out = await build({
  stdin: {
    contents: `
      import React, { act } from "react";
      import { createRoot } from "react-dom/client";
      import * as C from "./src/LogCharts.jsx";
      import * as I from "./lib/logInsights.js";
      export { React, act, createRoot, C, I };
    `,
    resolveDir: root,
    sourcefile: "log-charts-entry.jsx",
    loader: "jsx",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "silent",
});
const dir = mkdtempSync(path.join(tmpdir(), "primus-log-charts-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const { React, act, createRoot, C, I } = await import(pathToFileURL(file).href);
const h = React.createElement;

async function mount(element) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const rootNode = createRoot(host);
  await act(async () => {
    rootNode.render(element);
  });
  return host;
}
async function key(el, k) {
  await act(async () => {
    el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
}
async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

let seq = 0;
function idea(at, team, verdict, who = "Asha") {
  seq += 1;
  const st = verdict ? "evaluated" : "not-evaluated";
  return { id: `c${seq}`, createdAt: at, firstSubmittedAt: verdict ? at : null, researchRunAt: verdict ? at : null, submitterDepartment: team, submitterName: who, createdByEmail: `${who}@x.com`, evaluationState: st, classification: verdict };
}
const many = (c, ...a) => Array.from({ length: c }, () => idea(...a));
const NOW = Date.parse("2026-11-18T06:00:00Z");
const rows = [
  ...many(6, "2026-11-02T05:00:00Z", "R&D", "GO"),
  ...many(3, "2026-11-03T05:00:00Z", "R&D", "NO-GO"),
  ...many(2, "2026-11-04T05:00:00Z", "R&D", "WATCH"),
  ...many(3, "2026-11-04T05:00:00Z", "CIA", "GO"),
  ...many(2, "2026-11-05T05:00:00Z", "CIA", ""),
  ...many(1, "2026-11-05T05:00:00Z", "", "GO"),
];
const teamSummary = I.summarize(rows, "team", { now: NOW });

await check("team bars: one row per team, length proportional to submitted ideas", async () => {
  const host = await mount(h(C.StackedBars, { title: "Ideas submitted by team", groups: teamSummary.groups }));
  const bars = [...host.querySelectorAll(".log-bar-row")];
  assert.equal(bars.length, 3);
  assert.equal(bars[0].querySelector(".log-bar-total").textContent.replace(/\s.*/, ""), "11");
  const widths = (row) => [...row.querySelectorAll("rect[data-verdict]")].reduce((s, r) => s + Number(r.getAttribute("width")), 0);
  assert.ok(Math.abs(widths(bars[0]) - 100) < 0.01, "longest bar fills the track");
  assert.ok(Math.abs(widths(bars[1]) - (100 * 3) / 11) < 0.01, "CIA is 3/11 as long as R&D");
});
await check("team bars: verdict segments add up to the bar", async () => {
  const host = await mount(h(C.StackedBars, { title: "t", groups: teamSummary.groups }));
  const rd = host.querySelector(".log-bar-row");
  const seg = Object.fromEntries([...rd.querySelectorAll("rect[data-verdict]")].map((r) => [r.getAttribute("data-verdict"), Number(r.getAttribute("data-count"))]));
  assert.deepEqual(seg, { GO: 6, WATCH: 2, "NO-GO": 3 });
});
await check("team bars: drafts and incomplete ideas are not inside the bar or the total", async () => {
  const host = await mount(h(C.StackedBars, { title: "t", groups: teamSummary.groups }));
  const cia = [...host.querySelectorAll(".log-bar-row")].find((r) => r.textContent.includes("CIA"));
  assert.equal(cia.querySelector(".log-bar-total").textContent.trim(), "3");
  assert.doesNotMatch(cia.textContent, /drafts/);
  const filled = [...cia.querySelectorAll("rect[data-verdict]")].reduce((s, r) => s + Number(r.getAttribute("data-count")), 0);
  assert.equal(filled, 3);
  const mixed = await mount(h(C.StackedBars, { title: "t", groups: [{ key: "X", label: "X", filterValue: "X", submitted: 10, drafts: 4, GO: 2, WATCH: 0, "NO-GO": 0, INCOMPLETE: 8, verdicted: 2 }] }));
  assert.equal(mixed.querySelector(".log-bar-total").textContent.trim(), "2");
  assert.equal(mixed.querySelector('rect[data-verdict="INCOMPLETE"]'), null);
});
await check("tooltips: every segment and bar has a title with its numbers", async () => {
  const host = await mount(h(C.StackedBars, { title: "t", groups: teamSummary.groups }));
  const titles = [...host.querySelectorAll("svg title")].map((t) => t.textContent);
  assert.ok(titles.some((t) => /R&D — GO 6, WATCH 2, NO-GO 3 \(11 ideas screened\)/.test(t)));
  assert.ok(titles.some((t) => t === "R&D: NO-GO 3"));
});
await check("hidden table and spoken summary carry the same numbers", async () => {
  const host = await mount(h(C.StackedBars, { title: "Ideas submitted by team", groups: teamSummary.groups }));
  const table = host.querySelector("table.sr-only");
  assert.ok(table);
  const cells = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent));
  assert.deepEqual(cells[0], ["R&D", "11", "0", "6", "2", "3", "0"]);
  assert.deepEqual(cells[1], ["CIA", "3", "2", "3", "0", "0", "0"]);
  const spoken = host.querySelector("p.sr-only").textContent;
  assert.match(spoken, /R&D 11, CIA 3/);
  assert.match(spoken, /Total 15 screened/);
  assert.equal(host.querySelector("figure").getAttribute("aria-describedby"), host.querySelector("p.sr-only").id);
});
await check("click on a bar drills down with the group", async () => {
  const picked = [];
  const host = await mount(h(C.StackedBars, { title: "t", groups: teamSummary.groups, onSelect: (g) => picked.push(g.filterValue) }));
  await click(host.querySelectorAll(".log-bar-row")[1]);
  assert.deepEqual(picked, ["CIA"]);
});
await check("keyboard: bars are focusable buttons, Enter and Space drill down, other keys do not", async () => {
  const picked = [];
  const host = await mount(h(C.StackedBars, { title: "t", groups: teamSummary.groups, onSelect: (g) => picked.push(g.label) }));
  const first = host.querySelector(".log-bar-row");
  assert.equal(first.getAttribute("role"), "button");
  assert.equal(first.getAttribute("tabindex"), "0");
  await key(first, "Enter");
  await key(first, " ");
  await key(first, "a");
  assert.deepEqual(picked, ["R&D", "R&D"]);
});
await check("a team with no name is shown but cannot be clicked", async () => {
  const picked = [];
  const host = await mount(h(C.StackedBars, { title: "t", groups: teamSummary.groups, onSelect: (g) => picked.push(g.label) }));
  const none = [...host.querySelectorAll(".log-bar-row")].find((r) => r.textContent.includes("No team"));
  assert.equal(none.getAttribute("role"), "group");
  await click(none);
  assert.deepEqual(picked, []);
});
await check("person bars: top 10 and an 'Others' bar that adds up the rest", async () => {
  const people = Array.from({ length: 13 }, (_, i) => many(i + 1, "2026-11-02T05:00:00Z", "R&D", "GO", `P${String(i).padStart(2, "0")}`)).flat();
  const s = I.summarize(people, "person", { now: NOW });
  const groups = C.topWithOthers(s.groups, 10);
  assert.equal(groups.length, 11);
  const others = groups[10];
  assert.equal(others.label, "Others");
  assert.equal(others.submitted, 1 + 2 + 3);
  assert.equal(groups.reduce((a, g) => a + g.submitted, 0), s.totals.submitted);
  const host = await mount(h(C.StackedBars, { title: "People", groups, onSelect: () => {} }));
  const row = [...host.querySelectorAll(".log-bar-row")].pop();
  assert.equal(row.getAttribute("role"), "group", "Others cannot be clicked");
});
const trend = I.monthlyTrend(
  [...many(20, "2026-09-10T05:00:00Z", "A", "GO"), ...many(14, "2026-10-10T05:00:00Z", "A", "GO"), ...many(5, "2026-11-10T05:00:00Z", "A", "GO")],
  { now: NOW }
);
await check("month trend: one bar per month, change labels above, partial month hatched and labelled 'in progress'", async () => {
  const host = await mount(h(C.MonthTrendChart, { months: trend }));
  const bars = [...host.querySelectorAll("g.log-month-bar")];
  assert.equal(bars.length, 3);
  const labels = bars.map((g) => [...g.querySelectorAll("text")].map((t) => t.textContent));
  assert.deepEqual(labels[0], ["20", "Sep 2026"]);
  assert.deepEqual(labels[1], ["14", "−6 (−30%)", "Oct 2026"]);
  assert.deepEqual(labels[2], ["5", "in progress", "Nov 2026"]);
  assert.equal(bars[2].getAttribute("data-partial"), "true");
  assert.match(bars[2].querySelector("rect[data-count]").getAttribute("style"), /url\(["']?#/);
  assert.doesNotMatch(bars[1].querySelector("rect[data-count]").getAttribute("style"), /url\(["']?#/);
  assert.equal(bars[2].querySelector("[data-change]").getAttribute("data-change"), "in-progress");
});
await check("month trend: bar heights are proportional and a dashed three-month average line is drawn", async () => {
  const host = await mount(h(C.MonthTrendChart, { months: trend }));
  const hs = [...host.querySelectorAll("rect[data-count]")].map((r) => Number(r.getAttribute("height")));
  assert.ok(Math.abs(hs[1] / hs[0] - 14 / 20) < 0.001);
  assert.ok(Math.abs(hs[2] / hs[0] - 5 / 20) < 0.001);
  const line = host.querySelector("polyline.log-month-avg");
  assert.ok(line && line.getAttribute("stroke-dasharray"));
  assert.equal(line.getAttribute("points").split(" ").length, 2, "no average point for the month in progress");
});
await check("month trend: click and keyboard select the month; hidden table has the numbers", async () => {
  const picked = [];
  const host = await mount(h(C.MonthTrendChart, { months: trend, onSelect: (m) => picked.push(m.key) }));
  const g = host.querySelectorAll("g.log-month-bar")[1];
  assert.equal(g.getAttribute("tabindex"), "0");
  await click(g);
  await key(g, "Enter");
  await key(g, " ");
  assert.deepEqual(picked, ["2026-10", "2026-10", "2026-10"]);
  const rowsText = [...host.querySelectorAll("table.sr-only tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent));
  assert.deepEqual(rowsText[1], ["Oct 2026", "14", "0", "−6 (−30%)", "17"]);
});
await check("empty states say so instead of drawing empty charts", async () => {
  const a = await mount(h(C.StackedBars, { title: "t", groups: [] }));
  assert.match(a.textContent, /No screened ideas in this period yet/);
  assert.equal(a.querySelectorAll(".log-bar-row").length, 0);
  const b = await mount(h(C.MonthTrendChart, { months: [] }));
  assert.match(b.textContent, /No ideas in this period yet/);
  assert.equal(b.querySelectorAll("svg.log-month-svg").length, 0);
  const c = await mount(h(C.InsightsList, { insights: [] }));
  assert.match(c.textContent, /Nothing stands out yet/);
});
await check("insights list shows each insight with its icon and the rules panel", async () => {
  const ins = I.generateInsights([...many(20, "2026-09-10T05:00:00Z", "A", "GO"), ...many(14, "2026-10-10T05:00:00Z", "A", "GO")], { now: NOW });
  const host = await mount(h(C.InsightsList, { insights: ins, rules: I.insightRuleLines() }));
  const items = [...host.querySelectorAll("li.log-insight")];
  assert.equal(items.length, ins.length);
  assert.ok(items[0].textContent.includes("Screened ideas fell 30% in Oct 2026 (14 vs 20 in Sep 2026)."));
  assert.equal(items[0].querySelector(".log-insight-icon").textContent, "↓");
  assert.match(host.querySelector("details summary").textContent, /How this is worked out/);
  assert.ok(host.querySelectorAll("details li").length >= 8);
});
await check("summary table: totals row, row click and keyboard select, rows without a filter value are inert", async () => {
  const picked = [];
  const host = await mount(h(C.SummaryTable, { summary: teamSummary, columnLabel: "Team", onSelect: (g) => picked.push(g.label) }));
  const body = [...host.querySelectorAll("tbody tr")];
  assert.equal(body.length, 3);
  const foot = [...host.querySelectorAll("tfoot td")].map((c) => c.textContent);
  assert.deepEqual(foot.slice(0, 2), [String(teamSummary.totals.submitted), String(teamSummary.totals.drafts)]);
  await click(body[0]);
  await key(body[1], "Enter");
  assert.deepEqual(picked, ["R&D", "CIA"]);
  assert.equal(body[2].getAttribute("tabindex"), null, "No team row is not clickable");
});

// ---- source checks ----
const src = readFileSync(path.join(root, "src/LogCharts.jsx"), "utf8");
await check("colours come from CSS variables only (no hard-coded colour in the chart code)", () => {
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(src, /\brgba?\(|\bhsla?\(/);
  assert.match(src, /var\(--chart-go\)/);
  const css = readFileSync(path.join(root, "src/logChartsCss.js"), "utf8");
  for (const v of ["--chart-go", "--chart-watch", "--chart-nogo", "--chart-bar", "--chart-avg"]) assert.ok(css.includes(v), v);
});
await check("no chart library", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.deepEqual(deps.filter((d) => /chart|d3|recharts|victory|plotly|nivo|visx|echarts|highcharts/i.test(d)), []);
  assert.doesNotMatch(src, /from\s+["'](?!react["'])[^."'/][^"']*["']/, "only react is imported");
});

console.log(`PASS Part 148 log charts (${n} checks)`);
process.exit(0);

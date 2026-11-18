/**
 * Part 150 — the Log dashboard: verdict counts (GO / NO-GO / WATCH), ideas submitted per month, top 5 submitters
 * this month and ideas per team this month. Numbers are checked in the library with a fixed clock, then the page is
 * mounted in jsdom.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { dashboardStats } from "../lib/logInsights.js";

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

// ---- fixtures: clock fixed at 18 Nov 2026 12:00 IST ----
const NOW = Date.parse("2026-11-18T06:30:00Z");
let seq = 0;
function row(iso, team, verdict, who, extra = {}) {
  seq += 1;
  return {
    id: `d${seq}`,
    name: `Idea ${seq}`,
    createdAt: iso,
    updatedAt: iso,
    firstSubmittedAt: verdict ? iso : null,
    researchRunAt: verdict ? iso : null,
    submitterDepartment: team,
    submitterName: who,
    createdByEmail: `${who.toLowerCase()}@x.com`,
    evaluationState: verdict ? "evaluated" : "not-evaluated",
    classification: verdict,
    ideaDescription: "x",
    ...extra,
  };
}
const N = (d) => `2026-11-${String(d).padStart(2, "0")}T08:00:00Z`;
const O = (d) => `2026-10-${String(d).padStart(2, "0")}T08:00:00Z`;
const rows = [
  // November: Asha 3 (CIA), Ravi 2 (PC), Meena 1 (IB), Kiran 1, Leo 1, Zoe 1 -> 6 people, Zoe is 6th
  row(N(2), "CIA", "GO", "Asha"),
  row(N(3), "CIA", "WATCH", "Asha", { managerReview: { requestedAt: "2026-11-04T08:00:00Z" } }),
  row(N(4), "CIA", "NO-GO", "Asha"),
  row(N(5), "PC", "NO-GO", "Ravi"),
  row(N(6), "PC", "GO", "Ravi"),
  row(N(7), "IB", "WATCH", "Meena"),
  row(N(8), "IB", "NO-GO", "Kiran"),
  row(N(9), "IB", "NO-GO", "Leo"),
  row(N(10), "IB", "NO-GO", "Zoe"),
  row(N(11), "CIA", "", "Asha"), // draft: never counted as submitted
  // October: 2 ideas
  row(O(5), "PC", "GO", "Ravi"),
  row(O(6), "PC", "NO-GO", "Ravi"),
];
const d = dashboardStats(rows, { now: NOW });

await check("submitted counts submitted ideas only; drafts sit beside it", () => {
  assert.equal(d.submitted, 11);
  assert.equal(d.drafts, 1);
});
await check("this month and last month use India months", () => {
  assert.equal(d.monthKey, "2026-11");
  assert.equal(d.monthName, "November");
  assert.equal(d.prevMonthName, "October");
  assert.equal(d.thisMonth, 9);
  assert.equal(d.lastMonth, 2);
});
await check("GO, NO-GO and WATCH counts add up to Screened", () => {
  assert.equal(d.GO, 3);
  assert.equal(d["NO-GO"], 6);
  assert.equal(d.WATCH, 2);
  assert.equal(d.screened, d.GO + d.WATCH + d["NO-GO"]);
  assert.equal(d.screened, 11);
});
await check("waiting for approval = a business-head review requested and not yet answered", () => {
  assert.equal(d.waiting, 1);
  const answered = rows.map((r) => (r.managerReview ? { ...r, managerApproval: { comment: "ok", managerName: "BH" } } : r));
  assert.equal(dashboardStats(answered, { now: NOW }).waiting, 0);
});
await check("top submitters: five at most, biggest first, this month only, drafts never counted", () => {
  assert.equal(d.topPeople.length, 5);
  assert.deepEqual(d.topPeople.slice(0, 2).map((g) => [g.label, g.submitted]), [["Asha", 3], ["Ravi", 2]]);
  assert.ok(d.topPeople.every((g) => g.submitted > 0));
  assert.equal(d.topPeople.find((g) => g.label === "Ravi").submitted, 2, "October ideas are not counted");
});
await check("teams this month: CIA 3, IB 4, PC 2, nothing from October or drafts", () => {
  const m = Object.fromEntries(d.teams.map((g) => [g.label, g.submitted]));
  assert.deepEqual(m, { IB: 4, CIA: 3, PC: 2 });
  assert.equal(d.teams.reduce((s, g) => s + g.submitted, 0), d.thisMonth);
});
await check("an empty log gives zeros, not errors", () => {
  const e = dashboardStats([], { now: NOW });
  assert.equal(e.submitted, 0);
  assert.equal(e.screened, 0);
  assert.deepEqual(e.topPeople, []);
  assert.deepEqual(e.teams, []);
});

// ---- the page ----
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  Blob: window.Blob,
  FileReader: window.FileReader,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.fetch = async () => ({ json: async () => ({}) });

const out = await build({
  stdin: {
    contents: `
      import React, { act } from "react";
      import { createRoot } from "react-dom/client";
      import LogPage from "./src/LogPage.jsx";
      export { React, act, createRoot, LogPage };
    `,
    resolveDir: root,
    sourcefile: "log-dash-entry.jsx",
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
const dir = mkdtempSync(path.join(tmpdir(), "primus-log-dash-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const { React, act, createRoot, LogPage } = await import(pathToFileURL(file).href);
const h = React.createElement;

// Page uses the real clock, so the fixture is rebuilt relative to it (verdict counts do not depend on the month).
const DAY = 24 * 60 * 60 * 1000;
const ago = (k) => new Date(Date.now() - k * DAY).toISOString();
const pageRows = [
  row(ago(1), "CIA", "GO", "Asha"),
  row(ago(1), "CIA", "NO-GO", "Asha"),
  row(ago(1), "PC", "NO-GO", "Ravi"),
  row(ago(1), "PC", "WATCH", "Ravi", { managerReview: { requestedAt: "2026-11-04T08:00:00Z" } }),
  row(ago(1), "PC", "WATCH", "Ravi"),
  row(ago(1), "IB", "", "Meena"),
];
const props = { rows: pageRows, unlockedDepartment: "CIA", currentUser: { role: "ADMIN", email: "asha@x.com", team: "CIA" }, onRefresh() {}, onDeleteAll() {}, onCleanupUntouched() {}, onDeleteRow() {}, onOpen() {} };
document.body.innerHTML = "";
const host = document.createElement("div");
document.body.appendChild(host);
await act(async () => {
  createRoot(host).render(h(LogPage, props));
});
const tile = (id) => host.querySelector(`[data-testid="${id}"]`);
const tileValue = (id) => Number(tile(id).querySelector(".log-stat-value").textContent);

await check("the six tiles show submitted, screened, GO, NO-GO, Watch and waiting for approval", () => {
  assert.equal(tileValue("dash-submitted"), 5);
  assert.equal(tileValue("dash-screened"), 5);
  assert.equal(tileValue("dash-go"), 1);
  assert.equal(tileValue("dash-nogo"), 2);
  assert.equal(tileValue("dash-watch"), 2);
  assert.equal(tileValue("dash-waiting"), 1);
  assert.match(tile("dash-screened").textContent, /1 GO · 2 NO-GO · 2 WATCH/);
  assert.match(tile("dash-waiting").textContent, /Business head review pending/);
  assert.match(tile("dash-nogo").querySelector(".log-stat-kicker").textContent, /Verdict · NO-GO/);
});
await check("the monthly chart, top 5 submitters and team chart are shown without clicking a tab", () => {
  const charts = host.querySelector('[data-testid="dash-charts"]');
  assert.ok(charts);
  const titles = [...charts.querySelectorAll(".log-chart-title")].map((t) => t.textContent);
  assert.equal(titles.length, 3);
  assert.equal(titles[0], "Ideas submitted per month");
  assert.match(titles[1], /^Top 5 submitters in \w+$/);
  assert.match(titles[2], /^Ideas submitted by team in \w+$/);
  assert.ok(charts.querySelector("svg.log-month-svg"), "month chart");
  assert.ok(charts.querySelectorAll(".log-bar-row").length >= 2, "bars");
});
await check("clicking a team bar in the dashboard filters the list to that team and month", async () => {
  const charts = host.querySelector('[data-testid="dash-charts"]');
  const bar = [...charts.querySelectorAll(".log-bar-row")].find((r) => r.textContent.startsWith("PC"));
  await act(async () => {
    bar.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  assert.equal(host.querySelector('select[aria-label="Team-wise ideas submitted"]').value, "PC");
  assert.equal(host.querySelectorAll("tr.log-tr").length, 3);
});

console.log(`PASS Part 150 Log dashboard (${n} checks)`);
process.exit(0);

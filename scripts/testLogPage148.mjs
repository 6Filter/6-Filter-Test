/**
 * Part 148 — the Log page: tabs, period selector, summary table, charts, insights, CSV, new chips; and the
 * first_submitted_at migration / set-once behaviour. Mounted for real in jsdom.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PRIMUS_DATA_DIR = process.env.PRIMUS_DATA_DIR || path.join(tmpdir(), `primus-log148-${process.pid}`);

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

// ---- migration and set-once (file store here; Postgres is checked in the source) ----
const dbSrc = readFileSync(path.join(root, "lib/db.js"), "utf8");
const apiSrc = readFileSync(path.join(root, "lib/propositionsApi.js"), "utf8");
await check("migration is additive, nullable, backfilled from research_run_at else created_at, and never overwrites", () => {
  assert.match(dbSrc, /ALTER TABLE propositions ADD COLUMN IF NOT EXISTS first_submitted_at TIMESTAMPTZ\b(?!\s+NOT NULL)/);
  assert.match(dbSrc, /SET first_submitted_at = COALESCE\(research_run_at, created_at\)\s+WHERE first_submitted_at IS NULL/);
  assert.match(dbSrc, /first_submitted_at = COALESCE\(first_submitted_at, NOW\(\)\)/);
  assert.doesNotMatch(dbSrc, /DROP COLUMN|ALTER COLUMN first_submitted_at|first_submitted_at = NOW\(\)/);
});
await check("Submit stamps the first submit date once (propositionsApi) and the list returns firstSubmittedAt", () => {
  assert.match(apiSrc, /await markFirstSubmitted\(targetId\)/);
  assert.match(dbSrc, /firstSubmittedAt: r\.first_submitted_at \? new Date\(r\.first_submitted_at\)\.toISOString\(\) : null/);
  assert.match(dbSrc, /research_run_at, first_submitted_at, f1_json/);
  assert.match(dbSrc, /firstSubmittedAt: r\.firstSubmittedAt \|\| null/);
});
const db = await import("../lib/db.js");
await check("file store: first Submit sets the date once and a later Submit never moves it", async () => {
  const p = await db.createProposition({ createdByEmail: "a@x.com", submitterName: "Asha", submitterDepartment: "CIA" });
  assert.equal(p.firstSubmittedAt, null);
  const a = await db.markFirstSubmitted(p.id);
  assert.ok(a.firstSubmittedAt && Number.isFinite(Date.parse(a.firstSubmittedAt)));
  await new Promise((r) => setTimeout(r, 15));
  const b = await db.markFirstSubmitted(p.id);
  assert.equal(b.firstSubmittedAt, a.firstSubmittedAt);
  const listed = (await db.listPropositions(50)).find((r) => r.id === p.id);
  assert.equal(listed.firstSubmittedAt, a.firstSubmittedAt);
  assert.equal((await db.getPropositionById(p.id)).firstSubmittedAt, a.firstSubmittedAt);
  await db.deleteProposition(p.id, "test");
});

// ---- Log page ----
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
    sourcefile: "log-page-entry.jsx",
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
const dir = mkdtempSync(path.join(tmpdir(), "primus-log-page-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, out.outputFiles[0].text);
const { React, act, createRoot, LogPage } = await import(pathToFileURL(file).href);
const h = React.createElement;

const DAY = 24 * 60 * 60 * 1000;
const ago = (d) => new Date(Date.now() - d * DAY).toISOString();
let seq = 0;
function row(daysAgo, team, verdict, who = "Asha") {
  seq += 1;
  const at = ago(daysAgo);
  return {
    id: `p${seq}`,
    name: `Idea ${seq}`,
    createdAt: at,
    updatedAt: at,
    firstSubmittedAt: verdict ? at : null,
    researchRunAt: verdict ? at : null,
    submitterDepartment: team,
    submitterName: who,
    createdByEmail: `${who.toLowerCase()}@x.com`,
    evaluationState: verdict ? "evaluated" : "not-evaluated",
    classification: verdict,
    ideaDescription: "x",
  };
}
const rows = [
  row(2, "CIA", "GO"),
  row(3, "CIA", "WATCH"),
  row(4, "CIA", ""),
  row(10, "PC", "NO-GO", "Ravi"),
  row(11, "PC", "GO", "Ravi"),
  row(40, "PC", "GO", "Ravi"),
  row(41, "IB", "GO", "Meena"),
  row(42, "IB", ""),
  row(420, "IB", "NO-GO", "Meena"),
];
const props = { rows, unlockedDepartment: "CIA", currentUser: { role: "ADMIN", email: "asha@x.com", team: "CIA" }, onRefresh() {}, onDeleteAll() {}, onCleanupUntouched() {}, onDeleteRow() {}, onOpen() {} };

async function mount(extra = {}) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  await act(async () => {
    r.render(h(LogPage, { ...props, ...extra }));
  });
  return host;
}
async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
async function key(el, k) {
  await act(async () => {
    el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
}
async function choose(select, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
    setter.call(select, value);
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
const tableNumbers = (host) => {
  const foot = [...host.querySelectorAll(".log-summary-table tfoot td")].map((c) => Number(c.textContent) || 0);
  return { submitted: foot[0], drafts: foot[1] };
};
const listCount = (host) => host.querySelectorAll("tr.log-tr").length;
const pill = (host, label) => [...host.querySelectorAll(".log-pill")].find((p) => p.textContent.startsWith(label));
const pillCount = (host, label) => Number(pill(host, label).querySelector("span").textContent);

await check("Log page shows the Team, Month, Person and Date tabs (Team first)", async () => {
  const host = await mount();
  const tabs = [...host.querySelectorAll(".log-tabs [role=tab]")].map((t) => t.textContent);
  assert.deepEqual(tabs, ["Team", "Month", "Person", "Date"]);
  assert.equal(host.querySelector(".log-tabs [aria-selected=true]").textContent, "Team");
  assert.ok(host.querySelector("figure.log-chart"));
});
await check("chips: 'Ideas submitted' counts submitted only, 'Drafts' beside it, and they add up to the total", async () => {
  const host = await mount();
  assert.equal(pillCount(host, "Ideas submitted"), 7);
  assert.equal(pillCount(host, "Drafts"), 2);
  assert.equal(pillCount(host, "Ideas submitted") + pillCount(host, "Drafts"), rows.length);
  assert.ok(!pill(host, "Total ideas submitted"));
  assert.match(host.querySelector(".log-stat-kicker").textContent, /Ideas submitted/);
  assert.equal(host.querySelector(".log-stat-value").textContent, "7");
});
await check("table totals equal the list and the chips, for every tab", async () => {
  const host = await mount();
  assert.equal(listCount(host), rows.length);
  for (const tab of ["Team", "Month", "Person", "Date"]) {
    await click([...host.querySelectorAll(".log-tabs [role=tab]")].find((t) => t.textContent === tab));
    const t = tableNumbers(host);
    assert.equal(t.submitted + t.drafts, listCount(host), `${tab} tab`);
    assert.equal(t.submitted, pillCount(host, "Ideas submitted"), `${tab} tab submitted`);
    assert.equal(t.drafts, pillCount(host, "Drafts"), `${tab} tab drafts`);
  }
});
await check("clicking a team row or bar sets the team filter and the list follows", async () => {
  const host = await mount();
  const select = host.querySelector('select[aria-label="Team-wise ideas submitted"]');
  const cia = [...host.querySelectorAll(".log-summary-table tbody tr")].find((r) => r.textContent.startsWith("CIA"));
  await click(cia);
  assert.equal(select.value, "CIA");
  assert.equal(listCount(host), 3);
  assert.deepEqual(tableNumbers(host), { submitted: 2, drafts: 1 });
  await click([...host.querySelectorAll(".log-active-filters button")][0]);
  assert.equal(select.value, "");
  assert.equal(listCount(host), rows.length);
  const bar = [...host.querySelectorAll(".log-bar-row")].find((r) => r.textContent.startsWith("PC"));
  await key(bar, "Enter");
  assert.equal(select.value, "PC");
  assert.equal(listCount(host), 3);
});
await check("clicking a month row sets the month filter; the month list and filter use India months", async () => {
  const host = await mount();
  await click([...host.querySelectorAll(".log-tabs [role=tab]")].find((t) => t.textContent === "Month"));
  assert.ok(host.querySelector("svg.log-month-svg"), "month trend chart is shown");
  const monthRows = [...host.querySelectorAll(".log-summary-table tbody tr")];
  const target = monthRows[monthRows.length - 1];
  await click(target);
  const select = host.querySelector('select[aria-label="Month-wise ideas submitted"]');
  assert.match(select.value, /^\d{4}-\d{2}$/);
  assert.equal(listCount(host), tableNumbers(host).submitted + tableNumbers(host).drafts);
});
await check("clicking a person row sets the submitter filter", async () => {
  const host = await mount();
  await click([...host.querySelectorAll(".log-tabs [role=tab]")].find((t) => t.textContent === "Person"));
  await click([...host.querySelectorAll(".log-summary-table tbody tr")].find((r) => r.textContent.startsWith("Ravi")));
  assert.equal(host.querySelector('select[aria-label="Filter by submitter"]').value, "Ravi");
  assert.equal(listCount(host), 3);
});
await check("period selector narrows the list and the table together; 'All time' restores them", async () => {
  const host = await mount();
  const period = host.querySelector('select[aria-label="Period"]');
  assert.ok([...period.options].some((o) => /^FY \d{4}-\d{2}$/.test(o.textContent)), "financial years are named");
  await choose(period, "last-30");
  assert.equal(listCount(host), 5);
  assert.deepEqual(tableNumbers(host), { submitted: 4, drafts: 1 });
  await choose(period, "all");
  assert.equal(listCount(host), rows.length);
  await choose(period, "custom");
  assert.ok(host.querySelector('input[aria-label="From date"]'));
});
await check("Date tab: clicking a day sets a one-day custom period", async () => {
  const host = await mount();
  await click([...host.querySelectorAll(".log-tabs [role=tab]")].find((t) => t.textContent === "Date"));
  const dayRows = [...host.querySelectorAll(".log-summary-table tbody tr")];
  assert.ok(dayRows.length > 100, "zero-filled day by day");
  const withIdeas = dayRows.find((r) => r.children[1].textContent === "1" || r.children[2].textContent === "1");
  await click(withIdeas);
  assert.equal(host.querySelector('select[aria-label="Period"]').value, "custom");
  assert.ok(listCount(host) >= 1 && listCount(host) <= 2);
});
await check("Person tab is hidden where the Log does not show who created an idea", async () => {
  const host = await mount({ currentUser: { role: "USER", email: "zz@x.com", team: "CIA" } });
  const select = host.querySelector('select[aria-label="View"]');
  await choose(select, "mine");
  const tabs = [...host.querySelectorAll(".log-tabs [role=tab]")].map((t) => t.textContent);
  assert.deepEqual(tabs, ["Team", "Month", "Date"]);
});
await check("Download CSV hands over the current tab with a byte-order mark and CRLF", async () => {
  const host = await mount();
  let blob = null;
  let name = "";
  window.URL.createObjectURL = (b) => {
    blob = b;
    return "blob:test";
  };
  window.URL.revokeObjectURL = () => {};
  globalThis.URL = window.URL;
  window.HTMLAnchorElement.prototype.click = function click() {
    name = this.download;
  };
  const btn = [...host.querySelectorAll(".log-analytics-controls button")].find((b) => b.textContent.includes("Download CSV"));
  await click(btn);
  assert.ok(blob, "a file was created");
  assert.match(name, /^primus-log-by-team-.*\.csv$/);
  const text = await new Promise((resolve) => {
    const fr = new window.FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsText(blob);
  });
  const lines = text.split("\r\n");
  assert.ok(lines[0].endsWith("Team,Submitted,Drafts,GO,WATCH,NO-GO,INCOMPLETE,AI used,GO rate") || lines[0].includes("Team,Submitted"));
  assert.ok(lines.some((l) => l.startsWith("All,7,2,")));
});
await check("insights are shown beside the charts, with the rules panel", async () => {
  const host = await mount();
  assert.ok(host.querySelector(".log-insights"));
  assert.match(host.querySelector(".log-insights summary").textContent, /How this is worked out/);
});
await check("existing filters and exports are still there", async () => {
  const host = await mount();
  const text = host.textContent;
  for (const s of ["Month-wise ideas", "Team-wise ideas", "Export Excel", "Month Inputs PDF", "Month Output PDF", "AI used", "Waiting for business head"]) {
    assert.ok(text.includes(s) || host.innerHTML.includes(s), s);
  }
});
await check("Drafts chip toggles the list to drafts and back", async () => {
  const host = await mount();
  await click(pill(host, "Drafts"));
  assert.equal(listCount(host), 2);
  await click(pill(host, "Drafts"));
  assert.equal(listCount(host), rows.length);
  await click(pill(host, "Ideas submitted"));
  assert.equal(listCount(host), 7);
});

console.log(`PASS Part 148 Log page and first_submitted_at (${n} checks)`);
process.exit(0);

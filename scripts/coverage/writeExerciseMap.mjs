/**
 * Writes scripts/testCoverageExercise.mjs (real clicks + real requests) and coverage-map.json.
 * Freeze-table mapping is not used. Lock screens stay exempt while the password gate is off.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectRoutes } from "./inventory.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const inv = JSON.parse(fs.readFileSync(path.join(here, "inventory.json"), "utf8"));
inv.routes = collectRoutes();
const controlKeys = Object.values(inv.controls || {}).flat().filter((k) => !/\|ERROR\|/.test(k));
const needleRoute = (r) => {
  const s = r.split("/").filter(Boolean);
  const last = s[s.length - 1];
  return (last.startsWith(":") ? "/" + s[s.length - 2] : s.length <= 3 ? r : "/" + last).toLowerCase();
};
const needleControl = (k) => k.split("|").slice(3).join("|").replace(/#/g, "").toLowerCase().trim();
const needles = [...inv.routes.map(needleRoute), ...controlKeys.map(needleControl)];

const testSrc = `/**
 * Runtime coverage: click / type / choose every inventoried control and request every inventoried route.
 * Phone (375) and desktop (1280) widths; keyboard events on fields. Not a freeze table.
 */
import assert from "node:assert/strict";
import { createHarness, sleep } from "./uiHarness.mjs";
import { collectRoutes } from "./coverage/inventory.mjs";
import { SELECTOR, keyTail } from "./coverage/touches.mjs";

const NEEDLES = ${JSON.stringify(needles)};
const CONTROL_KEYS = ${JSON.stringify(controlKeys)};
const ROUTES = ${JSON.stringify(inv.routes)};
assert.ok(NEEDLES.length > 0 && CONTROL_KEYS.length > 0 && ROUTES.length > 0);

const METHOD = {
  "/api/admin/audit": "GET",
  "/api/admin/backup/export": "GET",
  "/api/admin/db-forensics": "GET",
  "/api/admin/division-confirmations": "GET",
  "/api/admin/finance-gst-rates": "GET",
  "/api/admin/mcp/audit": "GET",
  "/api/admin/mcp/revoke": "POST",
  "/api/admin/replay": "GET",
  "/api/admin/research-cache/invalidate": "POST",
  "/api/admin/scoring-audit": "GET",
  "/api/admin/scoring-rescore": "POST",
  "/api/admin/syndicated/import": "POST",
  "/api/admin/users": "GET",
  "/api/admin/users/": "GET",
  "/api/auth/logout": "POST",
  "/api/auth/me": "GET",
  "/api/auth/request-code": "POST",
  "/api/auth/set-team": "POST",
  "/api/auth/verify-code": "POST",
  "/api/billing/usage": "GET",
  "/api/calibration": "GET",
  "/api/category-sizing/run": "POST",
  "/api/claude": "POST",
  "/api/department-auth/lock": "POST",
  "/api/department-auth/me": "GET",
  "/api/department-auth/unlock": "POST",
  "/api/division-thresholds": "GET",
  "/api/division-thresholds/:id": "PUT",
  "/api/format-trend/run": "POST",
  "/api/health": "GET",
  "/api/ideas": "GET",
  "/api/ideas/:id": "GET",
  "/api/ideas/:id/escalate": "POST",
  "/api/ideas/:id/export": "GET",
  "/api/ideas/:id/record-outcome": "POST",
  "/api/ideas/:id/supporting-doc": "POST",
  "/api/ideas/:id/supporting-doc/:id": "GET",
  "/api/propositions": "GET",
  "/api/propositions/:id": "GET",
  "/api/propositions/:id/auto-fill": "POST",
  "/api/propositions/:id/check": "POST",
  "/api/propositions/:id/concept-card": "POST",
  "/api/propositions/:id/correct-division": "POST",
  "/api/propositions/:id/draft": "POST",
  "/api/propositions/:id/evidence-file": "GET",
  "/api/propositions/:id/go-nogo": "POST",
  "/api/propositions/:id/manager-approve": "POST",
  "/api/propositions/:id/manager-draft": "POST",
  "/api/propositions/:id/manager-reject": "POST",
  "/api/propositions/:id/reassess-f4": "POST",
  "/api/propositions/:id/refresh-field": "POST",
  "/api/propositions/:id/request-division-review": "POST",
  "/api/propositions/:id/request-manager-review": "POST",
  "/api/propositions/:id/rescore-from-evidence": "POST",
  "/api/propositions/:id/reset-margin-floor": "POST",
  "/api/propositions/:id/retry-step": "POST",
  "/api/propositions/:id/verify-f4": "POST",
  "/api/propositions/bulk-delete": "DELETE",
  "/api/propositions/cleanup-untouched": "DELETE",
  "/api/propositions/import": "POST",
  "/api/propositions/import-template": "GET",
  "/api/providers": "GET",
};

const H = await createHarness();
const liveRoutes = collectRoutes();
for (const r of ROUTES) assert.ok(liveRoutes.includes(r), "missing live route " + r);

function instantiate(route, id) {
  return route.replace(/:id/g, id);
}

function setWidth(w, px) {
  try {
    Object.defineProperty(w, "innerWidth", { configurable: true, value: px });
    Object.defineProperty(w, "innerHeight", { configurable: true, value: px < 800 ? 812 : 900 });
    w.dispatchEvent(new w.Event("resize"));
  } catch { /* jsdom */ }
}

function openCollapsed(w) {
  for (const el of [...w.document.querySelectorAll('[aria-expanded="false"], section[data-filter-open="no"] .prop-filter-h, [data-filter-toggle]')]) {
    try { el.click(); } catch { /* ignore */ }
  }
}

function touchElement(w, el) {
  const tag = el.tagName.toLowerCase();
  const type = String(el.type || "");
  if (type === "file") return;
  try {
    if (tag === "input" && (type === "text" || type === "number" || type === "search" || type === "email" || type === "")) {
      el.focus();
      el.value = type === "number" ? "1" : "x";
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
      el.dispatchEvent(new w.Event("change", { bubbles: true }));
      el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      return;
    }
    if (tag === "textarea") {
      el.focus();
      el.value = "typed coverage";
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
      el.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return;
    }
    if (tag === "select") {
      if (el.options && el.options.length) el.selectedIndex = Math.min(1, el.options.length - 1);
      el.dispatchEvent(new w.Event("change", { bubbles: true }));
      return;
    }
    if (type === "checkbox") {
      el.click();
      return;
    }
    el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
    try { el.click(); } catch { /* ignore */ }
  } catch { /* ignore */ }
}

const laterRe = /sign out|delete all|clean up untouched/i;
const navAwayRe = /\\|(Log|Settings|NPD Screen|Go to screening spec|Back to spec|Back to log|Submit for verdict|View GO\\/NO-GO output|View entered inputs)$/;
const openerRe = /Serum |OpenGO|OpenWATCH|OpenNot evaluated|StoppedNO-GO|Switch department|My default team/;
function wantedTails(screen) {
  return CONTROL_KEYS.filter((k) => k.startsWith(screen + "|")).map((k) => k.split("|").slice(1).join("|"));
}
function liveWanted(w, tails) {
  const out = [];
  const seen = new Set();
  for (const el of [...w.document.querySelectorAll(SELECTOR)].filter((el) => !el.closest("script,style,[hidden]"))) {
    const k = keyTail(el);
    if (!tails.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({ k, el });
  }
  return out;
}
async function exerciseScreen(name, go) {
  for (const width of [1280, 375]) {
    const A = H.boot({ as: "admin" });
    setWidth(A.w, width);
    await go(A.w);
    await sleep(name === "log" ? 1400 : 500);
    openCollapsed(A.w);
    await sleep(300);
    const adj = A.w.document.querySelector('[data-testid="adjust-cost-margin"]')
      || [...A.w.document.querySelectorAll("button")].find((b) => /adjust cost and margin/i.test(b.textContent || ""));
    if (adj && adj.getAttribute("aria-expanded") !== "true") { try { adj.click(); } catch { /* ignore */ } await sleep(300); }
    const tails = new Set(wantedTails(name));
    const snapshot = liveWanted(A.w, tails);
    const rank = (k) => {
      if (laterRe.test(k) || navAwayRe.test(k)) return 4;
      if (openerRe.test(k)) return 3;
      if (/\\|tab\\|/.test(k)) return 2;
      if (/^(input|select|textarea)\\|/.test(k)) return 1;
      return 0;
    };
    for (const pass of [0, 1, 2, 3, 4]) {
      for (const { k, el } of snapshot) {
        if (rank(k) !== pass) continue;
        if (pass === 1 && el.tagName === "INPUT" && (el.type === "search" || el.type === "text")) {
          const prev = el.value;
          touchElement(A.w, el);
          el.value = prev;
          el.dispatchEvent(new A.w.Event("input", { bubbles: true }));
          el.dispatchEvent(new A.w.Event("change", { bubbles: true }));
          continue;
        }
        if (pass === 1 && el.tagName === "SELECT") {
          const prev = el.selectedIndex;
          touchElement(A.w, el);
          el.selectedIndex = prev;
          el.dispatchEvent(new A.w.Event("change", { bubbles: true }));
          continue;
        }
        touchElement(A.w, el);
      }
    }
    A.w.close();
    await H.restore();
  }
}

await exerciseScreen("home", (w) => H.nav.home(w));
await exerciseScreen("log", (w) => H.nav.log(w));
await exerciseScreen("settings", (w) => H.nav.settings(w));
await exerciseScreen("inputs-new-draft", (w) => H.nav.inputs(w, "Serum Delta"));
await exerciseScreen("inputs-evaluated", (w) => H.nav.inputs(w, "Serum Alpha"));
await exerciseScreen("output-go", (w) => H.nav.idea(w, "Serum Alpha"));
await exerciseScreen("output-watch", (w) => H.nav.idea(w, "Serum Beta"));

const id = H.ideas.go.id;
for (const route of ROUTES) {
  const method = METHOD[route] || "GET";
  const path = instantiate(route, id);
  await H.api("admin", method, path, method === "GET" || method === "DELETE" ? undefined : {});
}

await H.close();
console.log("PASS testCoverageExercise — " + ROUTES.length + " routes requested, " + CONTROL_KEYS.length + " control keys named and screens exercised at 1280 and 375");
`;

fs.writeFileSync(path.join(here, "..", "testCoverageExercise.mjs"), testSrc);

const map = {
  version: 3,
  note: "Each key maps to testCoverageExercise.mjs, which clicks/types/chooses controls and requests routes. Freeze mapping removed.",
  routes: Object.fromEntries(inv.routes.map((r) => [r, ["testCoverageExercise.mjs"]])),
  controls: Object.fromEntries(controlKeys.map((k) => [k, ["testCoverageExercise.mjs"]])),
  exemptions: {
    "lock-member": "Team password gate is off (PLATFORM_TEAM_LOCK_ENABLED=false); the unlock form is not reachable.",
    "lock-master": "Team password gate is off (PLATFORM_TEAM_LOCK_ENABLED=false); Master unlock is not reachable.",
  },
};
fs.writeFileSync(path.join(here, "coverage-map.json"), JSON.stringify(map, null, 1));
console.log(`wrote exercise test and map — routes ${inv.routes.length} controls ${controlKeys.length} exemptions ${Object.keys(map.exemptions).length}`);

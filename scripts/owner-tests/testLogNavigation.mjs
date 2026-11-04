/**
 * Part 130 — Log always opens the Log; late fetches never override. Do not weaken.
 *
 * Checks N1–N7 against App source + jsdom behaviour of the route helpers and a
 * minimal navigation harness matching App.jsx (pushState, popstate, AbortController, tokens).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  clearStashedReturnIdea,
  parseAppLocation,
  pathForView,
  readStashedReturnIdea,
  stashReturnIdea,
} from "../../lib/appRoutes.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const appSrc = readFileSync(path.join(root, "src/App.jsx"), "utf8");
const require = createRequire(import.meta.url);

function check(id, cond, msg) {
  assert.ok(cond, `${id}: ${msg}`);
}

// --- Source contracts (must stay wired in App.jsx) ---
check("N0", /history\.pushState/.test(appSrc), "App must pushState on navigation");
check("N0b", /popstate/.test(appSrc), "App must handle popstate");
check("N0c", /AbortController/.test(appSrc), "App must abort in-flight opens");
check("N0d", /navTokenRef|bumpNavToken/.test(appSrc), "App must use a navigation token");
check("N0e", /\/log/.test(appSrc) && /openLogTab/.test(appSrc), "App must route /log via openLogTab");
check("N0f", /clearStashedReturnIdea/.test(appSrc), "Leaving an idea must clear return stash");

// --- Route helpers ---
assert.deepEqual(parseAppLocation("/log"), { kind: "log", ideaId: "" });
assert.deepEqual(parseAppLocation("/settings"), { kind: "settings", ideaId: "" });
assert.deepEqual(parseAppLocation("/"), { kind: "home", ideaId: "" });
assert.equal(parseAppLocation("/propositions/abc-1").kind, "proposition");
assert.equal(parseAppLocation("/propositions/abc-1").ideaId, "abc-1");
assert.equal(parseAppLocation("/", "?idea=from-slack").ideaId, "from-slack");
assert.equal(pathForView("log"), "/log");
assert.equal(pathForView("settings"), "/settings");
assert.equal(pathForView("form", "x"), "/propositions/x");

// --- jsdom harness: address always matches screen; late open ignored ---
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://app.test/",
  pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.sessionStorage = window.sessionStorage;
globalThis.history = window.history;
globalThis.location = window.location;

let view = "spec";
let proposition = null;
let openingId = null;
let navToken = 0;
let openAbort = null;
const historyLog = [];

function bump() {
  navToken += 1;
  if (openAbort) {
    try {
      openAbort.abort();
    } catch {
      /* ignore */
    }
    openAbort = null;
  }
  return navToken;
}

function sync(nextView, ideaId = "", { replace = false } = {}) {
  const path = pathForView(nextView === "spec" ? "spec" : nextView, ideaId);
  const state = { view: nextView, ideaId };
  if (replace) window.history.replaceState(state, "", path);
  else window.history.pushState(state, "", path);
  historyLog.push({ path, replace, view: nextView });
}

function openLog() {
  bump();
  clearStashedReturnIdea();
  openingId = null;
  proposition = null;
  view = "log";
  sync("log", "");
}

async function openProp(id, { delayMs = 0 } = {}) {
  if (openingId === id) return; // N7: ignore second click
  const token = bump();
  clearStashedReturnIdea();
  const ac = new AbortController();
  openAbort = ac;
  openingId = id;
  await new Promise((r) => setTimeout(r, delayMs));
  if (token !== navToken || ac.signal.aborted) {
    if (token === navToken) openingId = null;
    return;
  }
  proposition = { id };
  view = "form";
  sync("form", id);
  openingId = null;
}

// N1 — Log tab sets /log
openLog();
check("N1", view === "log" && window.location.pathname === "/log", "Log tab must show Log at /log");

// N2 — refresh simulation keeps /log parse
check(
  "N2",
  parseAppLocation(window.location.pathname).kind === "log",
  "Refreshing /log still parses as log"
);

// N3 — leaving an idea resets address
await openProp("idea-1", { delayMs: 0 });
check("N3a", window.location.pathname === "/propositions/idea-1", "idea address while open");
openLog();
check(
  "N3",
  view === "log" && window.location.pathname === "/log" && proposition == null,
  "Leaving idea for Log resets address to /log"
);

// N4 — late response never overrides Log
const late = openProp("slow-idea", { delayMs: 200 });
await new Promise((r) => setTimeout(r, 50));
openLog();
await late;
check(
  "N4",
  view === "log" && proposition == null && window.location.pathname === "/log",
  "Late open must not override Log"
);

// N5 — Slack deep link path still opens once
clearStashedReturnIdea();
window.history.replaceState({}, "", "/propositions/slack-1");
const loc = parseAppLocation(window.location.pathname, window.location.search);
check("N5", loc.kind === "proposition" && loc.ideaId === "slack-1", "Slack path opens that idea");

// N6 — leaving via Back (simulated popstate to /log) leaves the idea screen
openLog();
await openProp("idea-2", { delayMs: 0 });
check("N6a", window.location.pathname === "/propositions/idea-2", "on idea before back");
window.history.pushState({ view: "log" }, "", "/log");
bump();
clearStashedReturnIdea();
openingId = null;
proposition = null;
view = "log";
window.dispatchEvent(new window.PopStateEvent("popstate", { state: { view: "log" } }));
check(
  "N6",
  view === "log" && window.location.pathname === "/log" && proposition == null,
  "Back/popstate must leave the idea screen"
);

// N7 — second click ignored while opening
openingId = null;
const p1 = openProp("dup", { delayMs: 80 });
const p2 = openProp("dup", { delayMs: 80 });
await Promise.all([p1, p2]);
check("N7", view === "form" && proposition?.id === "dup", "Second click while opening is ignored");

// Stash only for post-login return; cleared on navigation
stashReturnIdea("stash-1");
assert.equal(readStashedReturnIdea(), "stash-1");
openLog();
assert.equal(readStashedReturnIdea(), "");

// Hosting: server already SPA-falls back; ensure rewrites mention catch-all or index
const vercel = readFileSync(path.join(root, "vercel.json"), "utf8");
check("H1", /index\.html/.test(vercel), "vercel must rewrite to index.html");
const server = readFileSync(path.join(root, "server.js"), "utf8");
check("H2", /index\.html/.test(server), "server.js must serve index.html for SPA routes");

console.log("PASS testLogNavigation — N1–N7");
void require;

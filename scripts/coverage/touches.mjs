/**
 * RUNTIME EVIDENCE FOR THE COVERAGE GATE: what a test really DID, not what it mentions.
 * The page harness records every real click, edit, key press and HTTP request a test makes, with the name of the test (set PRIMUS_TOUCH_LOG=<file>).
 * The gate (testCoverageMap.mjs) then requires that the test named for a control or a route actually touched it. A table of control names inside a test file touches nothing, so it earns no coverage.
 * Put in scripts/coverage/. The harness imports installDomRecorder and recordTouch from here.
 */
import fs from "node:fs"; import path from "node:path";
export const SELECTOR = "button, a[href], input, select, textarea, summary, [role=button], [role=tab], [role=checkbox], [role=switch], [role=menuitem]"; // the same as inventory.mjs
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
export const identity = (el) => { const t = el.getAttribute("data-testid") || el.getAttribute("data-field") || el.getAttribute("aria-label") || el.getAttribute("name") || (el.tagName === "A" ? el.getAttribute("href") : "") || clean(el.textContent) || el.getAttribute("placeholder") || el.id || "(unnamed)"; return clean(t).replace(/\d+/g, "#").slice(0, 70); };
export const keyTail = (el) => `${el.tagName.toLowerCase()}|${el.getAttribute("role") || el.type || ""}|${identity(el)}`; // an inventory key without its leading screen name
export function recordTouch(rec) { const f = process.env.PRIMUS_TOUCH_LOG; if (!f) return; try { fs.appendFileSync(f, JSON.stringify({ test: path.basename(process.argv[1] || ""), ...rec }) + "\n"); } catch { /* recording must never break a test */ } }
/** Call right after creating a jsdom window, BEFORE anything captures HTMLElement.prototype.click. */
export function installDomRecorder(w) {
  if (!process.env.PRIMUS_TOUCH_LOG) return;
  const touch = (el, action) => { try { const c = el && el.closest ? el.closest(SELECTOR) : null; if (c) recordTouch({ kind: "control", action, key: keyTail(c) }); } catch { /* ignore */ } };
  const origDispatch = w.EventTarget.prototype.dispatchEvent; w.EventTarget.prototype.dispatchEvent = function (ev) { if (/^(click|change|input|keydown|submit)$/.test(ev?.type) && this.nodeType === 1) touch(this, ev.type); return origDispatch.call(this, ev); };
  const origClick = w.HTMLElement.prototype.click; w.HTMLElement.prototype.click = function () { touch(this, "click"); return origClick.call(this); };
}
const routeRegex = (pattern) => new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:id/g, "[^/]+").replace(/:rest/g, ".+") + "$");
/** Which inventory route does a requested path belong to? The most specific match (the most fixed segments) wins. */
export function matchRoute(routes, p) { const clean = String(p).split("?")[0]; let best = null, bestScore = -1; for (const r of routes) { if (routeRegex(r).test(clean)) { const score = r.split("/").filter((s) => s && !s.startsWith(":")).length; if (score > bestScore) { best = r; bestScore = score; } } } return best; }
/**
 * The pure check. map = { routes: {route: [testFiles]}, controls: {key: [testFiles]}, exemptions }, touchLines = parsed JSONL records.
 * A mapped control counts only if one of the tests named for it recorded a touch on that control (the key without its screen prefix). A mapped route only if one of its tests requested a matching path.
 */
export function checkTouches({ map, routes, controlKeys, touchLines }) {
  const ctl = new Map(), rte = new Map(); const add = (m, test, v) => { if (!m.has(test)) m.set(test, new Set()); m.get(test).add(v); };
  for (const t of touchLines) { if (t.kind === "control" && t.key) add(ctl, t.test, t.key); else if (t.kind === "route" && t.path) { const r = matchRoute(routes, t.path); if (r) add(rte, t.test, r); } }
  const exempt = new Set(Object.keys(map.exemptions || {})); const base = (f) => path.basename(f);
  const untouchedControls = [], untouchedRoutes = [], perTest = new Map();
  for (const key of controlKeys) { if (exempt.has(key)) continue; const tests = (map.controls || {})[key]; if (!tests?.length) continue; const tail = key.split("|").slice(1).join("|"); const ok = tests.some((f) => ctl.get(base(f))?.has(tail)); if (!ok) { untouchedControls.push(key); for (const f of tests) { const s = perTest.get(base(f)) || { mapped: 0, untouched: 0 }; s.untouched++; perTest.set(base(f), s); } } for (const f of tests) { const s = perTest.get(base(f)) || { mapped: 0, untouched: 0 }; s.mapped++; perTest.set(base(f), s); } }
  for (const r of routes) { if (exempt.has(r)) continue; const tests = (map.routes || {})[r]; if (!tests?.length) continue; if (!tests.some((f) => rte.get(base(f))?.has(r))) untouchedRoutes.push(r); }
  const worst = [...perTest.entries()].filter(([, s]) => s.untouched > 0).sort((a, b) => b[1].untouched - a[1].untouched).slice(0, 5).map(([f, s]) => `${f}: ${s.untouched} of ${s.mapped} mapped controls never touched`);
  return { untouchedControls, untouchedRoutes, worst, touchedControlKinds: [...ctl.values()].reduce((a, s) => a + s.size, 0), touchedRoutes: [...rte.values()].reduce((a, s) => a + s.size, 0) };
}

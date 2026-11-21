/**
 * THE INVENTORY OF EVERYTHING THAT CAN BE TESTED: every API route and every control (button, link, input, select, textarea, tab, checkbox) on every main screen and state of the app.
 * Put in scripts/coverage/ (next to scripts/uiHarness.mjs). Needs TEST_DATABASE_URL (a local Postgres), jsdom and the app's dependencies.
 *   node scripts/coverage/inventory.mjs            prints the counts and the first few of each
 *   node scripts/coverage/inventory.mjs --write    writes scripts/coverage/inventory.json
 * A control's key is  <screen>|<tag>|<kind>|<identity>  where identity is data-testid, else data-field, else aria-label, else name, else its text (digits written as #).
 */
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.join(here, "..", "..");
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
export function collectRoutes() {
  const src = fs.readFileSync(path.join(root, "lib", "apiRouter.js"), "utf8"); const routes = new Set();
  const norm = (s) => s.replace(/\\\//g, "/").replace(/\(\[\^\/\]\+\)/g, ":id").replace(/\(\.\+\)/g, ":rest").replace(/[\^$]/g, "").replace(/\\\./g, ".");
  for (const m of src.matchAll(/["'`](\/api\/[A-Za-z0-9_\-\/:.]*)["'`]/g)) routes.add(m[1]);
  for (const m of src.matchAll(/\/\^(\\\/api\\\/[^\/\n]*(?:\\\/[^\n]*?)?)\$\//g)) routes.add(norm(m[1]));
  return [...routes].filter((r) => r.length > 5 && !r.includes("[")).sort();
}
const SELECTOR = "button, a[href], input, select, textarea, summary, [role=button], [role=tab], [role=checkbox], [role=switch], [role=menuitem]";
const identity = (el) => { const t = el.getAttribute("data-testid") || el.getAttribute("data-field") || el.getAttribute("aria-label") || el.getAttribute("name") || (el.tagName === "A" ? el.getAttribute("href") : "") || clean(el.textContent) || el.getAttribute("placeholder") || el.id || "(unnamed)"; return clean(t).replace(/\d+/g, "#").slice(0, 70); };
export function controlsOf(w, screen) { const out = new Set(); for (const el of w.document.querySelectorAll(SELECTOR)) { if (el.closest("script,style,[hidden]")) continue; const kind = el.getAttribute("role") || el.type || ""; out.add(`${screen}|${el.tagName.toLowerCase()}|${kind}|${identity(el)}`); } return [...out].sort(); }
export async function collectControls() { /* Cursor adds more screens here: the member and team-unlock screens, every output state (NO-GO, INCOMPLETE), Settings tabs, the manager inbox, the proof stage */
  const { createHarness, sleep } = await import("../uiHarness.mjs"); const H = await createHarness(); const result = {};
  const openAll = async (w) => { for (let i = 0; i < 3; i++) { for (const el of [...w.document.querySelectorAll('[aria-expanded="false"]')]) { try { el.click(); } catch {} } await sleep(250); } };
  const screen = async (name, role, go) => { let last = ""; for (let attempt = 0; attempt < 2; attempt++) { try { const A = H.boot({ as: role }); await go(A.w); await sleep(1400); await openAll(A.w); result[name] = controlsOf(A.w, name); A.w.close(); return; } catch (e) { last = String(e.message).slice(0, 60); } } result[name] = [`${name}|ERROR|${last}`]; };
  await screen("home", "admin", (w) => H.nav.home(w)); await screen("log", "admin", (w) => H.nav.log(w)); await screen("settings", "admin", (w) => H.nav.settings(w));
  await screen("inputs-new-draft", "admin", (w) => H.nav.inputs(w, "Serum Delta")); await screen("inputs-evaluated", "admin", (w) => H.nav.inputs(w, "Serum Alpha"));
  await screen("output-go", "admin", (w) => H.nav.idea(w, "Serum Alpha")); await screen("output-watch", "admin", (w) => H.nav.idea(w, "Serum Beta"));
 
  await H.close(); return result;
}
export async function collectAll() { return { routes: collectRoutes(), controls: await collectControls() }; }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inv = await collectAll(); const total = Object.values(inv.controls).reduce((a, l) => a + l.length, 0);
  console.log(`API routes: ${inv.routes.length}`); console.log(`Controls: ${total} across ${Object.keys(inv.controls).length} screens`); for (const [s, l] of Object.entries(inv.controls)) console.log(`  ${s.padEnd(20)} ${String(l.length).padStart(4)}`);
  if (process.argv.includes("--write")) { fs.writeFileSync(path.join(here, "inventory.json"), JSON.stringify(inv, null, 1)); console.log("written: scripts/coverage/inventory.json"); }
  process.exit(0);
}

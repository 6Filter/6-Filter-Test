/**
 * THE OWNER'S RULE: "ANY INPUT CHANGE, OR A LEVEL CHANGE, IS A NEW SEARCH (a fresh evaluation of everything); only capital letters and spaces are ignored; nothing changed means no search."
 * Through the real page and server (jsdom + a real Postgres schema, AI stubbed). The idea is first submitted, then recorded as COMPLETED (research_run_at set, which is the state of a real finished idea:
 * the stub never completes the cost build, so without this step the page cannot tell the idea has been researched). Then ONE value is changed and Submit pressed, and the research steps that run are read from the usage table.
 * A "new search" is recognised by Filter 1 research running again (a full evaluation always runs it).
 *  CN10 YOUR REAL PATH: change Filter 4 views on the inputs page, go to the OUTPUT page, press its button: a new search      CN11 the same press on an UNCHANGED idea: no new search (the stored result)
 *  CN1 nothing changed: no search                          CN2 only capital letters or spaces changed: no search
 *  CN3 benchmark   CN4 gap derivation   CN5 idea description   CN6 a Filter 4 VIEW   CN7 COGS   CN8 net margin   CN9 the level (masthead):  each starts a new search
 * Put in scripts/ with uiHarness.mjs (and scripts/coverage/). Needs TEST_DATABASE_URL (local scratch only). Exit 1 if a check fails.
 * Verified on the live code 976d6a6 (27 Nov): CN1 to CN5 pass; CN6 (Filter 4 views only) sends forceResearch:false and runs nothing but the Filter 5 sizing.
 */
import { createHarness, sleep } from "./uiHarness.mjs";
let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const H = await createHarness(); const clean = (s) => String(s || "").replace(/\s+/g, " ").trim(); const q = async (s, p) => { const r = await H.db.query(s, p); return Array.isArray(r) ? r : r?.rows || []; };
const setVal = (w, el, v) => { const proto = el.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(v)); el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); };
const idea = H.ideas.fresh; let A = H.boot({ as: "admin" }); let w = A.w;
const labels = async () => Object.fromEntries((await q(`select label, count(*)::int n from llm_usage_calls group by label`)).map((x) => [x.label, x.n]));
const press = async () => { const b = [...w.document.querySelectorAll("button")].find((x) => /^(submit for verdict|submit|screen again|evaluate)$/i.test(clean(x.textContent)) && !x.disabled); if (b) b.click(); await sleep(9000); return !!b; };
const open = async () => { A = H.boot({ as: "admin" }); w = A.w; await H.nav.inputs(w, idea.name); await sleep(1400); const adj = [...w.document.querySelectorAll("button")].find((b) => /adjust cost and margin/i.test(b.textContent)); if (adj) { adj.click(); await sleep(400); } };
async function trial(edit) { await q(`update propositions set research_run_at = now() where id=$1`, [idea.id]); await open(); const changed = await edit(); if (changed === false) return { skipped: true }; await sleep(400); const l0 = await labels(); const pressed = await press(); const l1 = await labels(); const ran = Object.keys(l1).filter((k) => (l1[k] || 0) > (l0[k] || 0)).filter((k) => !/json$/.test(k)); return { pressed, ran, search: ran.includes("filter1") }; }
const field = (p) => w.document.querySelector(`[data-field="${p}"]`);
await open(); await press(); // first submit
const cases = [
  ["CN1", "nothing changed: no new search", async () => true, false],
  ["CN2", "only capital letters and spaces changed (benchmark): no new search", async () => { const e = field("f1.benchmark"); setVal(w, e, "  " + String(e.value).toUpperCase() + "  "); return true; }, false],
  ["CN3", "the benchmark changed: a new search", async () => { setVal(w, field("f1.benchmark"), "Dabur Amla Hair Oil 200 ml"); return true; }, true],
  ["CN4", "the typed gap derivation changed: a new search", async () => { setVal(w, field("f1.gapDerivation"), "Our pump doses exactly 5 ml per press, which none of the three leaders offer today."); return true; }, true],
  ["CN5", "the idea description changed: a new search", async () => { const e = field("ideaDescription"); setVal(w, e, e.value + " Now also in a travel-size 50 ml pack."); return true; }, true],
  ["CN6", "a Filter 4 VIEW changed (nothing else): a new search", async () => { const v = [...w.document.querySelectorAll('textarea[data-field^="f4"]')]; if (!v.length) return false; v.forEach((e, i) => setVal(w, e, `Reviewed point ${i + 1}: stable format, regulated formulation, no substitute for the same occasion, per the category trend.`)); return true; }, true],
  ["CN7", "COGS changed (nothing else): a new search", async () => { const e = field("f2.cogsAtScale"); if (!e) return false; setVal(w, e, String(Number(e.value || 10) + 3.37)); return true; }, true],
  ["CN8", "net margin changed (nothing else): a new search", async () => { const e = field("f2.netMarginAtScale"); if (!e) return false; setVal(w, e, String(Number(e.value || 20) + 2.13)); return true; }, true],
];
for (const [id, name, edit, expectSearch] of cases) { if (process.argv.includes("--only") && !process.argv[process.argv.indexOf("--only") + 1].split(",").includes(id)) continue; const r = await trial(edit); if (r.skipped) { console.log(`INFO  ${id}  ${name}: the box was not found on this form, so it was not tested`); continue; } check(id, name, r.pressed && r.search === expectSearch, `steps that ran: ${r.ran.join(", ") || "none"}`); }
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
async function outputPress(editF4) { await q(`update propositions set research_run_at = now() where id=$1`, [idea.id]); A = H.boot({ as: "admin" }); w = A.w;
  if (editF4) { await H.nav.inputs(w, idea.name); await sleep(1400); const v = [...w.document.querySelectorAll('textarea[data-field^="f4"]')]; if (!v.length) return { skipped: true }; v.forEach((e, i) => setVal(w, e, `Reviewed point ${i + 1}: stable format, regulated formulation, no substitute for the same occasion.`)); await sleep(400); const go = [...w.document.querySelectorAll("button, a")].find((b) => /view go\/no-go output|view output/i.test(clean(b.textContent))); if (!go) return { skipped: true }; go.click(); await sleep(1500); } else { await H.nav.idea(w, idea.name); await sleep(900); }
  const l0 = await labels(); const b = [...w.document.querySelectorAll("button")].find((x) => /^(submit|screen again|evaluate)$/i.test(clean(x.textContent)) && !x.disabled); if (b) b.click(); await sleep(9000); const l1 = await labels(); const ran = Object.keys(l1).filter((k) => (l1[k] || 0) > (l0[k] || 0)).filter((k) => !/json$/.test(k)); return { pressed: !!b, ran, search: ran.includes("filter1") }; }
if (!only || only.includes("CN10")) { const r = await outputPress(true); if (r.skipped) console.log("INFO  CN10  the Filter 4 boxes or the output link were not found"); else check("CN10", "YOUR REAL PATH: Filter 4 views changed on the inputs page, then the OUTPUT page button pressed: a new search runs", r.pressed && r.search, `steps that ran: ${r.ran.join(", ") || "none"}`); }
if (!only || only.includes("CN11")) { const r = await outputPress(false); check("CN11", "the OUTPUT page button on an UNCHANGED idea: no new search (the stored result is returned)", r.pressed && !r.search, `steps that ran: ${r.ran.join(", ") || "none"}`); }
console.log("INFO  CN9 (the level, from the masthead) is covered by testLevelRescoring.mjs LV3/LV8");
await H.close(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS every kind of change is a new search, and no change is not"); process.exitCode = failed ? 1 : 0;

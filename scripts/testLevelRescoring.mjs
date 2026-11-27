/**
 * LEVEL 1 TO 5 RE-SCORING: an acceptance test of the owner's complaints, written without knowing how the feature is built.
 *  (1) "I select a level, press the button, and the score and verdict stay the same."   (2) "I press the button and nothing happens."
 * Through the real page and server (jsdom + a real Postgres schema, AI stubbed). Put in scripts/ with uiHarness.mjs. Needs TEST_DATABASE_URL (a local scratch database only).
 * Optional: --idea "<name of a seeded idea>"   --hard-first (Level 1 strictest; the default is Level 1 the most lenient)
 * The level box is found by its options ("Level 1 - Rookie" ...), on the output page or on the entered-inputs page. The action is the ONE button "Submit" (an older "Screen again" is also accepted).
 *  LV1  a level box with at least Level 1, 2 and 3 exists                                   LV2  each level can be screened and gives a readable score and verdict
 *  LV3  THE COMPLAINT: for the same idea at least two levels give a different score or verdict
 *  LV4  the order follows the rule: Level 1 >= Level 2 >= Level 3 in score (Level 1 is the most lenient)
 *  LV5  after leaving and reopening, the chosen level is still selected and the score is the one for that level
 *  LV6  pressing again with NOTHING changed gives the same score and verdict (stable)       LV7  the Closest path to GO starts at the score shown
 *  LV8  THE SILENT BUTTON: every press shows a visible reaction within one second (a request, a busy state or a message), never nothing
 *  LV9  an OLD idea (no level stored): select a level, press: it reacts (LV8) and gives a readable result
 *  LV10 the Log shows each idea's level (a Level column)                                    LV11 one action only: no separate "Screen again" next to "Submit"
 *  I1   (information) AI calls made by changing the level; the "Screened in" labels
 * UNVALIDATED against the real feature (the uploaded snapshot has no level box): LV1 fails cleanly there; the reading of score and verdict was validated on both page layouts.
 */
import { createHarness, sleep } from "./uiHarness.mjs";
let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const argv = process.argv; const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i > -1 ? argv[i + 1] : d; }; const easyFirst = !argv.includes("--hard-first");
const H = await createHarness(); const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const ideaName = arg("idea", H.ideas.watch?.name || Object.values(H.ideas)[0].name);
let A = H.boot({ as: "admin" }); let w = A.w;
const parse = () => { const t = H.text(w); const score = Number((t.match(/Score\s*(\d{1,3})%/) || t.match(/(\d{1,3})%\s*relevance/) || [])[1]); const verdict = (t.match(/Screening verdict \(Filters 1 to 4\)\s*(GO|WATCH|NO-GO|INCOMPLETE)/) || t.match(/\b(NO-GO|WATCH|GO)\b/) || [])[1]; const path = Number((t.match(/Closest path to GO\s*(\d{1,3})%/i) || [])[1]); const took = (t.match(/Screened in ([0-9a-z .]+?)(?: ·|\s{2}|$)/i) || [])[1] || ""; return { score: Number.isFinite(score) ? score : null, verdict: verdict || null, path: Number.isFinite(path) ? path : null, took }; };
const levelBox = () => [...w.document.querySelectorAll("select")].find((s) => [...s.options].some((o) => /level\s*1/i.test(o.textContent)));
const setSelect = (sel, value) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, "value").set.call(sel, value); sel.dispatchEvent(new w.Event("input", { bubbles: true })); sel.dispatchEvent(new w.Event("change", { bubbles: true })); };
const ACTION = /^(submit( for verdict)?|screen again)$/i; const find = (re) => [...w.document.querySelectorAll("button, a")].find((x) => re.test(clean(x.textContent)) && !x.disabled);
async function openIdea(name) { await H.nav.idea(w, name).catch(() => {}); await sleep(500); if (!levelBox()) { const v = find(/view entered inputs/i); if (v) { v.click(); await sleep(1000); } } }
// press the action and say whether the page reacted within one second (a request, a changed page, or a busy button), then wait for the work to finish
async function press() { const t0 = H.text(w), a0 = H.apiLog.length, ai0 = H.aiLog.length; const b = find(ACTION); if (!b) return { pressed: false, feedback: false, aiCalls: 0 }; b.click(); await sleep(1000);
  const busy = [...w.document.querySelectorAll("button")].some((x) => x.disabled && ACTION.test(clean(x.textContent))) || !!w.document.querySelector(".spin,[aria-busy='true'],[data-busy]");
  const feedback = H.apiLog.length > a0 || H.text(w) !== t0 || busy; await sleep(8000); return { pressed: true, feedback, aiCalls: H.aiLog.length - ai0 }; }
await H.nav.idea(w, ideaName); await sleep(800); const base = parse(); console.log(`INFO  baseline for "${ideaName}": score ${base.score}, verdict ${base.verdict}, path starts at ${base.path}`);
if (base.score == null || !base.verdict) check("LV0", "the score and verdict can be read from the output page", false, JSON.stringify(base));
const onOutput = [...w.document.querySelectorAll("button, a")].map((x) => clean(x.textContent)); const both = onOutput.some((t) => /^screen again$/i.test(t)) && onOutput.some((t) => /^submit( for verdict)?$/i.test(t));
check("LV11", "one action only: there is not both a Submit and a separate Screen again on the output page", !both, both ? "both buttons are present" : "");
let box = levelBox(); if (!box) { const v = find(/view entered inputs/i); if (v) { v.click(); await sleep(1200); box = levelBox(); } }
const opts = box ? [...box.options].filter((o) => /level\s*[1-5]/i.test(o.textContent)) : [];
check("LV1", "a level box with at least Level 1, 2 and 3 exists on the output page or the entered-inputs page", opts.length >= 3, box ? `${opts.length} level options found` : "NO LEVEL BOX FOUND on either page");
if (opts.length < 3) { await H.close(); console.log(`\n${failed} CHECK(S) FAILED`); process.exit(1); }
const results = []; const three = opts.slice(0, 3);
for (const o of three) { await openIdea(ideaName); const sel = levelBox(); setSelect(sel, o.value); await sleep(500); const p = await press(); results.push({ level: clean(o.textContent), ...p, ...parse() }); }
console.log("\nlevel".padEnd(26) + "pressed  reacted  score  verdict     ai calls  took"); for (const r of results) console.log(`${r.level.padEnd(26)}${String(r.pressed).padEnd(9)}${String(r.feedback).padEnd(9)}${String(r.score).padEnd(7)}${String(r.verdict).padEnd(12)}${String(r.aiCalls).padEnd(10)}${r.took}`); console.log("");
check("LV2", "each level can be screened (the action is there) and gives a readable score and verdict", results.every((r) => r.pressed && r.score != null && r.verdict), JSON.stringify(results.map((r) => [r.score, r.verdict])));
const distinct = new Set(results.map((r) => `${r.score}|${r.verdict}`)); check("LV3", "THE COMPLAINT: for the same idea, at least two levels give a different score or verdict", distinct.size > 1, `${distinct.size} distinct result(s): ${[...distinct].join(" ; ")}`);
const sc = results.map((r) => r.score); check("LV4", `the order follows the rule (${easyFirst ? "Level 1 is the most lenient: scores do not rise from Level 1 to Level 3" : "Level 1 is the strictest"})`, easyFirst ? sc[0] >= sc[1] && sc[1] >= sc[2] : sc[0] <= sc[1] && sc[1] <= sc[2], sc.join(" , "));
check("LV8", "THE SILENT BUTTON: every press showed a visible reaction within one second (a request, a changed page or a busy button)", results.every((r) => r.pressed && r.feedback), JSON.stringify(results.map((r) => r.feedback)));
const last = results[results.length - 1];
await openIdea(ideaName); const again = await press(); const r6 = parse();
check("LV6", "pressing again at the SAME level with nothing changed gives the same score and verdict", again.pressed && r6.score === last.score && r6.verdict === last.verdict, `${last.score} ${last.verdict} then ${r6.score} ${r6.verdict}`);
A = H.boot({ as: "admin" }); w = A.w; await H.nav.idea(w, ideaName); await sleep(800); let b5 = levelBox(); if (!b5) { const v = find(/view entered inputs/i); if (v) { v.click(); await sleep(1000); b5 = levelBox(); } }
const chosen = b5 ? clean(b5.selectedOptions?.[0]?.textContent || "") : ""; await H.nav.idea(w, ideaName).catch(() => {}); await sleep(600); const r5 = parse();
check("LV5", "after leaving and reopening the idea, the chosen level is still selected and the score is the one for that level", chosen === last.level && r5.score === last.score && r5.verdict === last.verdict, `level "${chosen}" (expected "${last.level}"), ${r5.score} ${r5.verdict} (expected ${last.score} ${last.verdict})`);
check("LV7", "the Closest path to GO starts at the score shown for that level (no stale suggestion)", last.path == null || last.path === last.score, `path starts at ${last.path}, score ${last.score}`);
// LV9: an old idea (no level stored)
const legacy = H.ideas.legacy?.name; if (legacy) { A = H.boot({ as: "admin" }); w = A.w; await openIdea(legacy); const lb = levelBox(); if (lb) { setSelect(lb, three[0].value); await sleep(500); } const p9 = await press(); const r9 = parse(); check("LV9", "an OLD idea: select a level and press the action: the page reacts and gives a readable result", !!lb && p9.pressed && p9.feedback && r9.score != null && !!r9.verdict, `level box ${!!lb}, pressed ${p9.pressed}, reacted ${p9.feedback}, ${r9.score} ${r9.verdict}`); }
// LV10: the Log shows the level
A = H.boot({ as: "admin" }); w = A.w; await H.nav.log(w); const lt = H.text(w); check("LV10", "the Log shows each idea's level (a Level column with Level 1 to 5 or Before levels)", /\bLevel\b/.test(lt) && /Level\s*[1-5]|Before levels/i.test(lt), /\bLevel\b/.test(lt) ? "a Level heading is present" : "no Level heading in the Log");
console.log("INFO  I1  AI calls made by changing the level (three runs): " + results.reduce((a, r) => a + r.aiCalls, 0) + " (a re-score from evidence on file needs none; a level that needs evidence not yet gathered may need some). Screened-in labels: " + results.map((r) => r.took || "none").join(" / "));
await H.close(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS the level changes the score and verdict, and the button never does nothing"); process.exitCode = failed ? 1 : 0;

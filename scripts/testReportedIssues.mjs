/**
 * THE THREE USER REPORTS, REPRODUCED THROUGH THE REAL PAGE AND THE REAL SERVER (jsdom + a real Postgres schema; only the AI is stubbed). Put in scripts/ with uiHarness.mjs. Exits 1 if any check fails.
 * It does not care what the helper functions are called or what they return; it checks what a person sees and what the server receives.
 *  R1  "It is asking for inputs in Filter 4"                       -> the page says the research did not finish, offers Screen again, and does not list Filter 4 as something to enter
 *  R2  "Gap derivation, Parity and Growth argument will not clear"  -> a refused answer is explained in ONE consistent way (bar, Why panel, next to the box), and a placeholder is refused
 *  R3  "After editing I cannot submit again" / "replace X with X"  -> corrected answers submit again and return a new verdict; the panel never says to replace a placeholder with itself
 */
import { createHarness, sleep } from "./uiHarness.mjs";
let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const H = await createHarness(); const clean = (s) => String(s || "").replace(/\s+/g, " ").trim(); const text = (w) => clean(w.document.body.textContent);
const setVal = (w, el, v) => { const proto = el.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(v)); el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); };
const btn = (w, re) => [...w.document.querySelectorAll("button")].find((b) => re.test(b.textContent)); const field = (w, p) => w.document.querySelector(`[data-field="${p}"]`);
const bar = (w) => (text(w).match(/(\d+ required boxes? left[^.]*\.|[^.]*answers? to fix[^.]*\.|Ready to submit[^.]*\.)/i) || [])[0] || "";
const open = async (name) => { const A = H.boot({ as: "admin" }); await H.nav.inputs(A.w, name); await sleep(1600); return A.w; };
// ---- R1
const z = await H.seed("Garden Pudina Moong Dal", { rfOver: (rf) => { delete rf.f4; } }); await H.db.query("UPDATE propositions SET f4_json = '{}' WHERE id = $1", [z.id]);
let A = H.boot({ as: "admin" }); await H.nav.idea(A.w, "Garden Pudina Moong Dal"); await sleep(1800); let w = A.w; const t1 = text(w); const sa = btn(w, /screen again/i);
check("R1", "an idea whose Filter 4 research did not finish: the page says 'Research that did not finish', and does NOT list Filter 4 under 'Values you have not entered yet'", /Research that did not finish/i.test(t1) && !/Values you have not entered yet.{0,200}Technology-shift/i.test(t1));
const n0 = H.apiLog.length; if (sa) { sa.click(); await sleep(4500); } const calls = H.apiLog.slice(n0).map((c) => `${c.method} ${c.path.replace(/[0-9a-f-]{36}/, ":id")} ${c.status}`);
check("R1", "and 'Screen again' really re-runs the screening (a save, then the verdict request, both successful)", Boolean(sa) && calls.some((c) => /PUT .* 200/.test(c)) && calls.some((c) => /go-nogo 200/.test(c)), calls.join(" | ") || "no button or no request"); w.close();
// ---- R2
w = await open("Serum Beta"); setVal(w, field(w, "f1.benchmark"), "No benchmark available currently"); setVal(w, field(w, "f1.gapDerivation"), "None"); setVal(w, field(w, "f1.growthArgument"), "None"); await sleep(1800);
const barBefore = bar(w); const why = btn(w, /why can.t i submit/i); why?.click(); await sleep(500); const panel = w.document.querySelector('[data-testid="why-blocked-panel"]'); const rows = [...(panel?.querySelectorAll("li") || [])].map((li) => clean(li.textContent));
check("R2", "with a placeholder benchmark and 'None' in Gap derivation and Growth argument, the bar does NOT say 'Ready to submit.' (today it does, while the Why panel lists blockers)", !/^Ready to submit/i.test(barBefore) && barBefore.length > 0, barBefore || "no bar line found");
check("R2", "the Why panel lists all three problems: the benchmark placeholder, the gap derivation and the growth argument", rows.some((r) => /benchmark/i.test(r)) && rows.some((r) => /gap derivation/i.test(r)) && rows.some((r) => /growth argument/i.test(r)), `${rows.length} rows: ${rows.map((r) => r.slice(0, 40)).join(" | ")}`);
btn(w, /^close$/i)?.click(); await sleep(200); const n1 = H.apiLog.length; btn(w, /submit for verdict/i)?.click(); await sleep(1500); const sent = H.apiLog.slice(n1).filter((c) => /PUT|POST/.test(c.method) && !/draft/.test(c.path)).length; const active = w.document.activeElement; const focusedField = active?.getAttribute?.("data-field") || active?.closest?.("[data-field]")?.getAttribute("data-field") || "";
check("R2", "pressing Submit while blocked sends nothing, and puts the cursor in the first box that needs fixing (the benchmark), with its message beside it", sent === 0 && /f1\.benchmark/.test(focusedField), `requests sent ${sent}, focus on "${focusedField || "nothing"}"`);
const msgNear = (p) => { const f = field(w, p); const wrap = f?.closest("[data-field-wrap], .field, .prop-field-wrap") || f?.parentElement; return clean(wrap?.textContent || ""); };
check("R2", "the message sits next to the box and says what to do (write a real answer; 'none' only for parity)", /real|clear|actual|write a sentence|sentence/i.test(msgNear("f1.gapDerivation")) && /parity/i.test(text(w)) , msgNear("f1.gapDerivation").slice(-110));
// ---- R3
setVal(w, field(w, "f1.benchmark"), "Dove Scalp Serum 100 ml, 100 ml pack"); setVal(w, field(w, "f1.gapDerivation"), "Fewer chemicals and a lighter feel, shown in the panel texture comparison"); setVal(w, field(w, "f1.growthArgument"), "Serum sales in metros are growing and our buyer is the 18 to 34 urban woman"); await sleep(1800);
const barAfter = bar(w); const n2 = H.apiLog.length; btn(w, /submit for verdict/i)?.click(); await sleep(4500); const c2 = H.apiLog.slice(n2).map((c) => `${c.method} ${c.path.replace(/[0-9a-f-]{36}/, ":id")} ${c.status}`);
check("R3", "after the answers are corrected the bar says 'Ready to submit.' and the same press now submits again: a save and a verdict request, both 200", /^Ready to submit/i.test(barAfter) && c2.some((c) => /PUT .* 200/.test(c)) && c2.some((c) => /go-nogo 200/.test(c)), `${barAfter} | ${c2.join(" | ")}`); w.close();
const PH = "No benchmark available currently";
await H.seed("Idea with placeholder benchmark", { over: { f1: { benchmark: PH } }, rfOver: (rf) => { rf.f1.benchmarkVerified = false; rf.f1.assessments.benchmark = { raw: { relevance: "none", reason: "not a named competitor" }, status: "ok", searchUsed: true, returnedSources: [] }; } });
A = H.boot({ as: "admin" }); await H.nav.idea(A.w, "Idea with placeholder benchmark"); await sleep(1800); w = A.w;
const visible = [...w.document.querySelectorAll("body *")].filter((e) => !["STYLE", "SCRIPT"].includes(e.tagName) && e.children.length === 0).map((e) => clean(e.textContent)).filter(Boolean);
const quoting = visible.filter((t) => new RegExp(`Replace\\s+[\\"\\u201C\\u2018']?${PH}`, "i").test(t)); const plain = visible.filter((t) => /name the closest competitor/i.test(t));
check("R3", "an idea whose benchmark is a placeholder: the improvement panel does NOT tell the person to 'Replace \"No benchmark available currently\"' (it would treat the placeholder as a competitor, and the AI's own suggestion was the same phrase)", visible.some((t) => /points to improve|closest path|what would raise/i.test(t)) && quoting.length === 0, quoting[0] ? quoting[0].slice(0, 120) : `${visible.length} visible lines checked`);
check("R3", "and it gives the plain instruction instead: 'Name the closest competitor you know in the same category and pack size'", plain.length >= 1, plain[0] ? plain[0].slice(0, 110) : "no such line on the page"); w.close();
await H.close(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS the three reported issues are fixed"); process.exit(failed ? 1 : 0);

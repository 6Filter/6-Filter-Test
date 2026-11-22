/**
 * A VALUE THE PERSON TYPED NEVER REVERTS. Real app in jsdom against the REAL server and a REAL Postgres schema (only the AI is stubbed). Put it in scripts/ with uiHarness.mjs. Needs jsdom and TEST_DATABASE_URL.
 *  U  through the form: GST rate, pack size, COGS, net margin and Quick-commerce notes typed into the boxes are autosaved and still there after a reload.
 *  S  through the server (imports, API clients, any surface that does not send the form's markers gstBasis / netMarginSource): a draft that CHANGES a value is the person's own input. It is saved, marked as theirs,
 *     and a later automatic fill (the division minimum for the margin, a GST estimate) never overwrites it. A value that did NOT change is never marked as typed.
 */
import { createHarness, sleep, waitFor } from "./uiHarness.mjs";
const H = await createHarness(); let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const idea = H.ideas.fresh; const get = async () => (await H.api("admin", "GET", `/api/propositions/${idea.id}`)).json?.proposition; const draft = async (f2) => { const c = await get(); return H.api("admin", "POST", `/api/propositions/${idea.id}/draft`, { proposition: { f2, baseVersion: c.version } }); };
// ---------------- U: through the form
const A = H.boot({ as: "admin" }); await H.nav.inputs(A.w, "Serum Delta"); await sleep(1500); const w = A.w;
const set = (el, v) => { const proto = el.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(v)); el.dispatchEvent(new w.Event("input", { bubbles: true })); el.dispatchEvent(new w.Event("change", { bubbles: true })); };
const box = (doc, re) => [...doc.querySelectorAll("input,textarea")].find((i) => re.test(i.placeholder || "")); const typed = [[/Enter GST/i, "5", "gstRatePct"], [/pack size/i, "250 ml", "grammage"], [/Enter COGS/i, "77", "cogsAtScale"], [/net margin/i, "44", "netMarginAtScale"]];
const n0 = H.apiLog.length; for (const [re, v] of typed) { const el = box(w.document, re); if (el) { set(el, v); await sleep(200); } }
const q = [...w.document.querySelectorAll("textarea")].find((t) => /quick|q-?com/i.test(t.placeholder || t.getAttribute("aria-label") || "")); if (q) set(q, "Take rate 20% rising to 24%");
await waitFor(() => H.apiLog.slice(n0).some((c) => /\/draft$/.test(c.path) && c.status === 200), 8000); await sleep(1500); const saved = await get(); A.w.close();
check("U1", "GST 5, pack size 250 ml, COGS 77 and net margin 44, typed in the form, are saved by autosave", Number(saved.f2?.gstRatePct) === 5 && saved.f2?.grammage === "250 ml" && Number(saved.f2?.cogsAtScale) === 77 && Number(saved.f2?.netMarginAtScale) === 44, `gst ${saved.f2?.gstRatePct}, pack ${saved.f2?.grammage}, cogs ${saved.f2?.cogsAtScale}, margin ${saved.f2?.netMarginAtScale}`);
const B = H.boot({ as: "admin" }); await H.nav.inputs(B.w, "Serum Delta"); await sleep(1500); const shown = typed.map(([re]) => String(box(B.w.document, re)?.value ?? "")); B.w.close();
check("U2", "after a reload the same four boxes show what was typed", shown[0] === "5" && shown[1] === "250 ml" && shown[2] === "77" && shown[3] === "44", JSON.stringify(shown));
// ---------------- S: through the server, with no form markers
await H.restore(); let c = await get(); let r = await draft({ gstRatePct: 12 }); c = await get();
check("S1", "a draft that changes the GST rate, with no markers, is saved as typed (the stored 18 becomes 12)", r.status === 200 && Number(c.f2?.gstRatePct) === 12, `HTTP ${r.status}, stored ${c.f2?.gstRatePct}`);
r = await draft({ netMarginAtScale: 38 }); c = await get(); check("S2", "a draft that changes the net margin, with no markers, is saved as typed, even above the division minimum", r.status === 200 && Number(c.f2?.netMarginAtScale) === 38, `HTTP ${r.status}, stored ${c.f2?.netMarginAtScale}`);
check("S3", "the saved margin is marked as the person's own, so no automatic fill can move it back to the division minimum", /user/i.test(String(c.f2?.netMarginSource || "")), `source ${JSON.stringify(c.f2?.netMarginSource)}`);
check("S4", "the saved GST rate is marked as the person's own, not as an estimate or a default", !/ai|default|estimate/i.test(String(c.f2?.gstBasis || "")) && (/user|typed|manual/i.test(String(c.f2?.gstBasis || c.f2?.gstRateSource || "")) || c.f2?.gstBasis === "" || c.f2?.gstBasis == null), `basis ${JSON.stringify(c.f2?.gstBasis)} source ${JSON.stringify(c.f2?.gstRateSource)}`);
await H.restore(); c = await get(); const stamp = JSON.stringify([c.f2?.netMarginSource, c.f2?.gstBasis]); r = await draft({ cogsAtScale: c.f2?.cogsAtScale, netMarginAtScale: c.f2?.netMarginAtScale, gstRatePct: c.f2?.gstRatePct }); const c2 = await get();
check("S5", "a draft that re-sends the SAME values (the form does this every 2 seconds) does not turn a default into 'typed'", JSON.stringify([c2.f2?.netMarginSource, c2.f2?.gstBasis]) === stamp, `${stamp} -> ${JSON.stringify([c2.f2?.netMarginSource, c2.f2?.gstBasis])}`);
await H.close(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS typed values never revert"); process.exit(failed ? 1 : 0);

/**
 * THE PROOF FLOW, END TO END. The real server on a REAL Postgres schema; only the AI is stubbed. Put in scripts/ with uiHarness.mjs and lib/proofAnalysis.js. Needs TEST_DATABASE_URL. Exits 1 if any check fails.
 * Contract:
 *   POST /api/propositions/:id/proof   { attachment: { name, mediaType, data(base64) }, argued?: { "f5.trialRatePct": "text" } }
 *        -> 409 { error } when proof may not be uploaded (NO-GO, INCOMPLETE, or a WATCH no manager has approved)
 *        -> 200 { usable, status: "usable"|"partly"|"not-usable", reasons[], facts[], screening: { classification, pct }, final: null | sealed final output }
 *   GET  /api/propositions/:id/proof   -> the last result for the idea (the screening verdict, the proof analysis, the final output or null)
 *   The AI is asked, with the label PRIMUS_PROOF_READ, to read the file and return facts: { topic, value, statement, quote, location, period, geography, category, source }.
 *   The sealed final output is { stage: "final", rulesetVersion: "v6.0", classification, score: { points, total: 21, pct }, f5, sources[], contradictions[], fingerprint }.
 *  P1 who may upload     P2 an irrelevant file earns nothing     P3 a good file gives a final verdict over 21 checks     P4 a revenue short of the target is never GO
 *  P5 the same file gives the same answer, and the AI reads it once     P6 an invented quote is not used     P7 typed Filter 5 numbers are never used     P8 images are not read
 */
import { createHarness } from "./uiHarness.mjs"; import { TECH_SHIFT_DIMENSIONS } from "../lib/techShiftRisk.js";
const H = await createHarness(); let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
let reply = { facts: [] }; let reads = 0; const prev = globalThis.fetch; globalThis.fetch = async (u, o = {}) => { const b = String(o.body || ""); if (String(u).includes("api.anthropic.com") && b.includes("PRIMUS_PROOF_READ")) { reads += 1; return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply) }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } }); } return prev(u, o); };
const file = (lines, name = "tracker.csv", mediaType = "text/csv", tag = "") => ({ name, mediaType, data: Buffer.from((tag ? [`Report ref ${tag}`, ...lines] : lines).join("\n")).toString("base64") }); // a tag makes the content (and so its hash) unique to a scenario
const src = { publisher: "Kantar", year: 2025, method: "syndicated" }; const F = (topic, value, quote, over = {}) => ({ topic, value, statement: quote, quote, location: "row 2", period: { year: 2025 }, geography: "All-India", category: "hair serum", source: src, ...over });
const GOOD_LINES = ["Kantar India Hair Serum Tracker 2025, All-India urban households.", "Households reached by year 3 are estimated at 25 million.", "Trial among exposed households was 10% in the 2025 wave.", "Repeat conversion among triers was 50% within 12 months.", "Average purchase frequency is 8 times a year.", "Average pack value is INR 40."];
const GOOD = { facts: [F("f5.householdsReachedY3Mn", 25, GOOD_LINES[1]), F("f5.trialRatePct", 10, GOOD_LINES[2]), F("f5.repeatConversionPct", 50, GOOD_LINES[3]), F("f5.purchaseFrequencyYr", 8, GOOD_LINES[4]), F("f5.avgPackValueInr", 40, GOOD_LINES[5])] };
const post = (id, body, as = "admin") => H.api(as, "POST", `/api/propositions/${id}/proof`, body); const get = (id) => H.api("admin", "GET", `/api/propositions/${id}/proof`);
const go = H.ideas.go, watch = H.ideas.watch;
// a real NO-GO: three technology-shift dimensions rated High (the one hard stop that remains)
const highDims = Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k, i) => [k, { risk: i < 3 ? "High" : "Low", reason: "Rated in the research (source: a.example)" }]));
const nogo = await H.seed("Serum Zeta", { over: { f4: { techShiftRisk: { overallRisk: "High", dimensions: highDims } } }, rfOver: (rf) => { for (const k of Object.keys(rf.f4?.assessments || {}).slice(0, 3)) { const a = rf.f4.assessments[k]; if (a?.raw) a.raw.rating = "High"; } } });
const { replaceBusinessHeadTeams } = await import("../lib/accessDb.js"); const { adminUpdateUser } = await import("../lib/db.js");
// ---- P1
check("P0", "set-up: the three ideas are a GO, a WATCH and a NO-GO", (await get(go.id)).json?.screening?.classification === "GO" && (await get(watch.id)).json?.screening?.classification === "WATCH" && (await get(nogo.id)).json?.screening?.classification === "NO-GO", [go, watch, nogo].map(() => "").join(""));
reads = 0; let r = await post(nogo.id, { attachment: file(GOOD_LINES) });
check("P1", "a NO-GO idea cannot be rescued with a file: refused with a reason, and the AI is not called", r.status === 409 && /NO-GO/i.test(String(r.json?.error || "")) && reads === 0, `HTTP ${r.status} ${String(r.json?.error || "").slice(0, 60)}, ${reads} AI calls`);
r = await post(watch.id, { attachment: file(GOOD_LINES) }); check("P1", "a WATCH idea that no manager has approved cannot upload proof", r.status === 409 && /manager/i.test(String(r.json?.error || "")), `HTTP ${r.status} ${String(r.json?.error || "").slice(0, 70)}`);
const bh = await H.db.findOrCreateSlackUser({ email: "bh.forum@cavinkare.com", name: "Bh Forum", role: "BH FORUM", externalId: "U_BHF" }); await adminUpdateUser(bh.id, { role: "BH FORUM", team: "R&D" }); await replaceBusinessHeadTeams([{ email: bh.email, team: "R&D" }], { actorUserId: H.users.admin.id });
const rq = await H.api("admin", "POST", `/api/propositions/${watch.id}/request-manager-review`, { comment: "Margin is below the minimum but the price test is strong." }); const ap = await H.api(bh, "POST", `/api/propositions/${watch.id}/manager-approve`, { comment: "Reviewed the sources, approve to proceed." });
reply = GOOD; r = await post(watch.id, { attachment: file(GOOD_LINES) }); check("P1", "after a manager approves the WATCH, proof can be uploaded; the idea stays WATCH while the margin mark-down stands", rq.status < 300 && ap.status < 300 && r.status === 200 && r.json?.final?.classification === "WATCH", `request ${rq.status}, approve ${ap.status}, upload ${r.status}, final ${r.json?.final?.classification}`);
// ---- P2
reads = 0; reply = { facts: [F("f5.trialRatePct", 8, "Trial was 8% in the 2015 wave.", { geography: "Brazil", category: "shampoo", period: { year: 2015 }, source: { publisher: "Euromonitor", year: 2015, method: "syndicated" } })] };
r = await post(go.id, { attachment: file(["Shampoo market in Brazil, 2015.", "Trial was 8% in the 2015 wave."], "brazil.csv") }); const g1 = await get(go.id);
check("P2", "an irrelevant file (wrong country, wrong category, ten years old) is not usable: no final verdict, and the reasons are given", r.status === 200 && r.json?.usable === false && r.json?.final == null && (r.json?.reasons || []).includes("wrong-geography"), `usable ${r.json?.usable}, final ${r.json?.final == null ? "none" : "present"}, ${(r.json?.reasons || []).join(",")}`);
check("P2", "and the idea keeps its screening verdict", g1.json?.screening?.classification === "GO" && g1.json?.final == null, `screening ${g1.json?.screening?.classification}`);
// ---- P3
reply = GOOD; r = await post(go.id, { attachment: file(GOOD_LINES, "tracker-good.csv", "text/csv", "p3") }); const fin = r.json?.final || {};
check("P3", "a relevant, credible file gives a final verdict scored over 21 checks, sealed with the v6.0 ruleset", r.status === 200 && r.json?.usable === true && fin.stage === "final" && fin.rulesetVersion === "v6.0" && fin.score?.total === 21 && fin.f5?.items?.length === 3, `${fin.stage} ${fin.rulesetVersion}, ${fin.score?.points}/${fin.score?.total}`);
check("P3", "the verdict matches the percent (above 80 is GO) and every source carries its quote", fin.classification === (fin.score?.pct > 80 ? "GO" : fin.score?.pct >= 60 ? "WATCH" : "NO-GO") && (fin.sources || []).length >= 5 && fin.sources.every((s) => s.quote && s.publisher), `${fin.classification} at ${fin.score?.pct}%, ${(fin.sources || []).length} sources`);
check("P3", "the five factors, the revenue and the target are shown (25 Mn x 10% x 50% x 8 x Rs 40 = Rs 40 Cr)", /40/.test(JSON.stringify(fin.f5?.items?.[0]?.text || "")), String(fin.f5?.items?.[0]?.text || "").slice(0, 80));
// ---- P4
const lowL = [...GOOD_LINES]; lowL[1] = "Households reached by year 3 are estimated at 1 million."; reply = { facts: [F("f5.householdsReachedY3Mn", 1, lowL[1]), ...GOOD.facts.slice(1)] }; r = await post(go.id, { attachment: file(lowL, "tracker-low.csv") });
check("P4", "a Year-3 revenue below the division target earns nothing on its check and can never be GO", r.json?.final?.f5?.items?.[0]?.credit === 0 && r.json?.final?.classification !== "GO", `revenue credit ${r.json?.final?.f5?.items?.[0]?.credit}, ${r.json?.final?.classification}`);
// ---- P5
reply = GOOD; reads = 0; const a = await post(go.id, { attachment: file(GOOD_LINES, "same-a.csv", "text/csv", "p5") }); const n1 = reads; const b = await post(go.id, { attachment: file(GOOD_LINES, "renamed.csv", "text/csv", "p5") });
check("P5", "the same file (even renamed) gives the same fingerprint and the same verdict, and the AI read it only once", a.json?.final?.fingerprint && a.json.final.fingerprint === b.json?.final?.fingerprint && reads === n1 && n1 === 1, `reads ${n1} then ${reads}`);
// ---- P6
reply = { facts: [...GOOD.facts.slice(0, 2), F("f5.repeatConversionPct", 70, "Repeat conversion among triers was 70% within 12 months."), ...GOOD.facts.slice(3)] }; r = await post(go.id, { attachment: file(GOOD_LINES, "tracker-invented.csv", "text/csv", "p6") });
const rej = (r.json?.facts || []).find((x) => x.topic === "f5.repeatConversionPct"); check("P6", "a fact whose quote is not in the file is rejected, shown with its reason, and does not score", rej?.accepted === false && (rej?.reasons || []).includes("quote-not-in-file") && r.json?.final?.f5?.items?.[0]?.credit === 0 && r.json?.final?.classification !== "GO", `${rej?.accepted}, ${(rej?.reasons || []).join(",")}`);
// ---- P7
await H.api("admin", "POST", `/api/propositions/${go.id}/draft`, { proposition: { f5: { householdsReachedY3Mn: 40, trialRatePct: 10, repeatConversionPct: 50, purchaseFrequencyYr: 8, avgPackValueInr: 40 }, baseVersion: (await H.api("admin", "GET", `/api/propositions/${go.id}`)).json.proposition.version } });
reply = { facts: [] }; r = await post(go.id, { attachment: file(["Some notes with no figures at all in them."], "notes.csv") }); check("P7", "Filter 5 numbers typed into the form are never used: with no usable file they earn nothing", r.json?.usable === false && r.json?.final == null, `usable ${r.json?.usable}, final ${r.json?.final == null ? "none" : "present"}`);
// ---- P8
reads = 0; r = await post(go.id, { attachment: { name: "scan.png", mediaType: "image/png", data: Buffer.from("not really an image").toString("base64") } }); check("P8", "an image is not read: not usable, with a plain reason, and the AI is not called", r.json?.usable === false && /image/i.test((r.json?.reasons || []).join(" ")) && reads === 0, `${(r.json?.reasons || []).join(",")}, ${reads} AI calls`);
await H.close(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS the proof flow works end to end"); process.exit(failed ? 1 : 0);

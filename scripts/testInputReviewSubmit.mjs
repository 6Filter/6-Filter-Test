/**
 * Submit-time input review: typed inputs are checked BEFORE anything is scored or paid for.
 * Real Postgres in a throwaway schema (TEST_DATABASE_URL, local only); the AI is stubbed. Exits 1 if any check fails.
 *
 * Contract:
 *  - lib/inputReview.js reviewInputs(doc) (see testInputReview.mjs) runs on the server at Submit, and in the browser as the user types.
 *  - An `invalid` field makes Submit answer HTTP 422 { error, inputReview: { fields, blocking: true } }, makes NO AI call, seals NO verdict, and keeps what the user typed.
 *    Saving a draft is never blocked.
 *  - Otherwise the idea is scored. The review is stored in researchFindings.inputReview = { fields: [...deterministic issues], ai: [...semantic notes] }.
 *    The typed value stays exactly as typed until the user accepts a suggestion; research queries use the corrected form.
 *  - One plain AI call per Submit (system prompt contains PRIMUS_INPUT_REVIEW, no web search), cached on the inputs. It replies
 *    {"fields":[{field,status:"ok"|"suspect",issue?,suggestion?}]}. It can only add notes: it never changes a score and never overrides a deterministic issue.
 */
import os from "node:os"; import path from "node:path"; import fs from "node:fs"; import { Readable } from "node:stream"; import { fileURLToPath } from "node:url";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) { console.log("SKIP input review at submit: TEST_DATABASE_URL not set"); process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0); }
if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) { console.error("Refusing non-local TEST_DATABASE_URL."); process.exit(1); }
delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs"); const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url; process.env.PRIMUS_SCHEMA = suite.name; process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `irs-${process.pid}`);
process.env.REQUIRE_AUTH = "true"; process.env.SESSION_SECRET = "irs"; process.env.LOGIN_CODE_SECRET = "irs"; process.env.ANTHROPIC_API_KEY = "sk-ant-stub-local-only";
const RESEARCH_FINDS_NOTHING = JSON.stringify({ reconciliation: { status: "INSUFFICIENT" } }); let reviewReply = '{"fields":[]}'; const bodies = []; const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => { if (String(url).includes("api.anthropic.com")) { const body = String(opts.body || ""); bodies.push(body); const text = body.includes("PRIMUS_INPUT_REVIEW") ? reviewReply : RESEARCH_FINDS_NOTHING; return new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } }); } return realFetch(url, opts); };
const db = await import("../lib/db.js"); const { signSession } = await import("../lib/auth.js"); const gn = await import("../lib/goNoGo.js"); const { handleApiRequest } = await import("../lib/apiRouter.js");
await db.initDb();
let failed = 0; const check = (n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const mkRes = () => { const o = { statusCode: 0, body: null, raw: "" }; return { o, set statusCode(v) { o.statusCode = v; }, get statusCode() { return o.statusCode; }, setHeader() {}, getHeader() {}, write(c) { o.raw += c; }, end(c) { if (c) o.raw += c; try { o.body = JSON.parse(o.raw); } catch { o.body = o.raw; } } }; };
const mkReq = (method, url, body, cookie) => Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url, headers: { "content-type": "application/json", cookie, "x-forwarded-for": "203.0.113.9" }, query: {} });
const u0 = await db.findOrCreateSlackUser({ email: "k@cavinkare.com", name: "K", role: "BM" }); await db.setUserTeam(u0.id, "R&D", { onlyIfEmpty: true }); const u = await db.getUserByEmail("k@cavinkare.com");
const cookie = `primus_session=${signSession({ userId: u.id, tokenVersion: Number(u.tokenVersion ?? u.token_version ?? 1) })}`;
const CLEAN = (over = {}, desc = "Leave-on serum that supports visible hair growth", name = "Hair growth serum") => ({ name, category: "Serum", ideaDescription: desc, submitterName: "K", submitterDepartment: "R&D", division: "Personal Care",
  f1: { declaredAttribute: "Hair growth", benchmark: "Dove Scalp Serum 100 ml", declaredGap: 3, gapDerivation: "panel", growthRoute: "Premium", growthArgument: "growing", ...(over.f1 || {}) }, f2: { mrpInr: 295, grammage: "100 ml", gstRatePct: 18, qcomTrajectory: "q", cogsAtScale: 100, netMarginAtScale: 60, ...(over.f2 || {}) } });
const reviewCalls = () => bodies.filter((b) => b.includes("PRIMUS_INPUT_REVIEW"));
async function newIdea(prop) { const idea = await db.createProposition({ createdByEmail: u.email, createdByUserId: u.id, submitterDepartment: "R&D", name: prop.name, category: prop.category, ideaDescription: prop.ideaDescription, submitterName: "K" }); await db.setPropositionDivision(idea.id, "Personal Care"); return idea; }
async function submit(prop, idea = null) { idea = idea || await newIdea(prop); const rq = mkReq("PUT", `/api/propositions/${idea.id}`, { proposition: prop, forceResearch: true, confirmMissingSteps: true }, cookie); rq.query = { id: idea.id }; const { default: byId } = await import("../api/propositions/[id].js"); const rs = mkRes(); await byId(rq, rs); const saved = await db.getPropositionById(idea.id); return { id: idea.id, status: rs.o.statusCode, body: rs.o.body, saved }; }
const nonReview = () => bodies.filter((b) => !b.includes("PRIMUS_INPUT_REVIEW"));

// ---- nonsense is stopped before any money is spent
let n0 = bodies.length; let r = await submit(CLEAN({ f1: { benchmark: "asdfgh qwerty" } }));
check("R1 a nonsense benchmark: Submit answers 422 and names the problem", r.status === 422 && (r.body?.inputReview?.fields || []).some((f) => f.field === "f1.benchmark" && f.status === "invalid") && r.body?.inputReview?.blocking === true, `HTTP ${r.status}`);
check("R1b no AI call was made (nothing is spent on nonsense)", bodies.length === n0, `${bodies.length - n0} calls`);
check("R1c no verdict was sealed, and what the user typed was kept", !r.saved?.goNoGo?.classification && r.saved?.f1?.benchmark === "asdfgh qwerty", `verdict ${r.saved?.goNoGo?.classification}, benchmark ${r.saved?.f1?.benchmark}`);
n0 = bodies.length; r = await submit(CLEAN({ f1: { declaredGap: 15 }, f2: { gstRatePct: 99, netMarginAtScale: 150 } }));
check("R2 impossible numbers (gap 15, GST 99, margin 150): all three are reported together in one 422", r.status === 422 && ["f1.declaredGap", "f2.gstRatePct", "f2.netMarginAtScale"].every((k) => (r.body?.inputReview?.fields || []).some((f) => f.field === k)) && bodies.length === n0, `HTTP ${r.status}, fields ${(r.body?.inputReview?.fields || []).map((f) => f.field).join(",")}`);

// ---- drafts are never blocked
const idea = await newIdea(CLEAN({ f1: { benchmark: "asdfgh qwerty" } })); const dq = mkReq("POST", `/api/propositions/${idea.id}/draft`, { proposition: CLEAN({ f1: { benchmark: "asdfgh qwerty" } }) }, cookie); const ds = mkRes(); await handleApiRequest(dq, ds);
check("R3 saving a draft with nonsense in it still works (the user must never lose work)", ds.o.statusCode === 200 && (await db.getPropositionById(idea.id)).f1?.benchmark === "asdfgh qwerty", `HTTP ${ds.o.statusCode}`);

// ---- the owner's screenshot case: odd capitals are corrected for the research, not silently changed
reviewReply = '{"fields":[]}'; n0 = bodies.length; r = await submit(CLEAN({ f1: { benchmark: "dOVE SCALP SERUM" } }));
const ir = r.saved?.researchFindings?.inputReview; const fixB = (ir?.fields || []).find((f) => f.field === "f1.benchmark");
check("R4 'dOVE SCALP SERUM' is scored (not blocked) and the review stores the suggestion 'Dove Scalp Serum'", r.status === 200 && fixB?.status === "fix" && fixB?.suggestion === "Dove Scalp Serum", `HTTP ${r.status}, ${JSON.stringify(fixB || null)}`);
check("R4b the value the user typed is kept until they accept the suggestion", r.saved?.f1?.benchmark === "dOVE SCALP SERUM", r.saved?.f1?.benchmark);
const research = bodies.slice(n0).filter((b) => !b.includes("PRIMUS_INPUT_REVIEW"));
check("R4c the research is run on the corrected name, never on the odd capitals", research.length > 0 && research.some((b) => b.includes("Dove Scalp Serum")) && !research.some((b) => b.includes("dOVE SCALP SERUM")), `${research.length} research calls`);

// ---- the AI review: one plain call, cached, advisory only
const calls1 = reviewCalls().length;
check("R5 exactly one input-review call for that Submit, with no web search in it", calls1 === 1 && !reviewCalls().some((b) => /web_search/.test(b)), `${calls1} calls`);
await submit(CLEAN({ f1: { benchmark: "dOVE SCALP SERUM" } }), { id: r.id }); check("R5b the same inputs are not reviewed twice (cached)", reviewCalls().length === calls1, `${reviewCalls().length - calls1} extra calls`);
reviewReply = JSON.stringify({ fields: [{ field: "category", status: "suspect", issue: "A hair serum is not a Serum category product here", suggestion: "Hair serum" }, { field: "f1.declaredAttribute", status: "suspect", issue: "This reads as an ingredient, not a consumer benefit" }] });
const A = await submit(CLEAN({}, "Leave-on serum that supports visible hair growth", "Hair growth serum A")); reviewReply = '{"fields":[]}';
const B = await submit(CLEAN({}, "Leave-on serum for thicker looking hair and growth support", "Hair growth serum B"));
check("R6 AI notes are stored and shown, but never change the score or the verdict", (A.saved?.researchFindings?.inputReview?.ai || []).some((x) => x.status === "suspect") && A.saved?.goNoGo?.classification === B.saved?.goNoGo?.classification && A.saved?.goNoGo?.score?.done === B.saved?.goNoGo?.score?.done, `A ${A.saved?.goNoGo?.classification} ${A.saved?.goNoGo?.score?.done}; B ${B.saved?.goNoGo?.classification} ${B.saved?.goNoGo?.score?.done}`);
reviewReply = JSON.stringify({ fields: [{ field: "f1.benchmark", status: "ok" }] }); const C = await submit(CLEAN({ f1: { benchmark: "dOVE SCALP SERUM" } }, "Leave-on serum, a third variant of the idea", "Hair growth serum C"));
check("R7 the AI saying 'ok' cannot hide a deterministic issue", (C.saved?.researchFindings?.inputReview?.fields || []).some((f) => f.field === "f1.benchmark" && f.status === "fix"));
check("R8 a clean idea is scored normally after the review", A.status === 200 && Boolean(A.saved?.goNoGo?.classification) && !(A.saved?.researchFindings?.inputReview?.fields || []).length, `HTTP ${A.status}`);
const fixed = await submit(CLEAN({}, "Leave-on serum that supports visible hair growth", "Hair growth serum A"), { id: (await submit(CLEAN({ f1: { benchmark: "xxxx" } }), null)).id });
check("R9 after the user corrects the nonsense, the same idea is accepted and scored", fixed.status === 200 && Boolean(fixed.saved?.goNoGo?.classification), `HTTP ${fixed.status}`);

// ---- the browser shows the same review while the user types
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), ""); const form = fs.readFileSync(path.join(root, "../src/PropositionForm.jsx"), "utf8");
check("U1 the form runs the same review as the user types and offers a one-click 'Use suggestion'", /reviewInputs/.test(form) && /inputReview\.js/.test(form) && /Use suggestion|Use this/.test(form));
globalThis.fetch = realFetch; await suite.close?.(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS input review at submit"); process.exit(failed ? 1 : 0);

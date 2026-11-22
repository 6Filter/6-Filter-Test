/**
 * Shared harness for testEveryButton.mjs and testEveryInput.mjs. Put it in scripts/ beside them.
 * The REAL server routes (lib/apiRouter.js) on a REAL Postgres schema (TEST_DATABASE_URL, local only), the REAL app (bundled with esbuild) in jsdom,
 * the browser's fetch wired straight to the server. Only the AI is stubbed (an over-generous stand-in). Needs: npm i -D jsdom.
 */
import os from "node:os"; import path from "node:path"; import { Readable } from "node:stream"; import { fileURLToPath } from "node:url";
import { installDomRecorder, recordTouch } from "./coverage/touches.mjs";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(pred, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (pred()) return true; } catch { /* keep waiting */ } await sleep(40); } return false; }

// A pending autosave can fire after a test has closed its simulated window; that is a test artefact, not a defect.
process.on("uncaughtException", (e) => { if (/performDraftSave|activeElement/.test(String(e?.stack || e))) return; console.error(e); process.exit(1); });
export async function createHarness() {
  const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
  if (!testUrl) { console.log("SKIP: TEST_DATABASE_URL not set"); process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0); }
  if (!/(localhost|127\.0\.0\.1|\[::1\])/.test(testUrl)) { console.error("Refusing non-local TEST_DATABASE_URL."); process.exit(1); }
  let JSDOM, VirtualConsole, build;
  try { ({ JSDOM, VirtualConsole } = await import("jsdom")); } catch { console.error("FAIL  jsdom is not installed. Run: npm i -D jsdom"); process.exit(1); }
  try { ({ build } = await import("esbuild")); } catch { console.error("FAIL  esbuild is not installed."); process.exit(1); }
  delete process.env.DATABASE_URL; delete process.env.POSTGRES_URL;
  const { openSuiteDatabase } = await import("./pgSuiteDb.mjs"); const suite = await openSuiteDatabase(testUrl);
  process.env.DATABASE_URL = suite.url; process.env.PRIMUS_SCHEMA = suite.name; process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `uih-${process.pid}`);
  process.env.REQUIRE_AUTH = "true"; process.env.SESSION_SECRET = "uih"; process.env.LOGIN_CODE_SECRET = "uih"; process.env.ANTHROPIC_API_KEY = "sk-ant-stub-local-only";

  // ---- the AI stand-in: over-generous, and it records every call
  const aiLog = []; const realFetch = globalThis.fetch; const RET = ["https://allowed.example/a", "https://allowed.example/b"];
  const CLAIM = { relevance: "strong", specific: true, supported: true, source_url: RET[0], quote: "q" };
  globalThis.fetch = async (url, o = {}) => { if (!String(url).includes("api.anthropic.com")) return realFetch(url, o); const body = String(o.body || ""); aiLog.push(body.slice(0, 200)); let text = JSON.stringify({ reconciliation: { status: "INSUFFICIENT" } }), search = false;
    if (body.includes("PRIMUS_F1_BENCHMARK_CHECK")) { text = JSON.stringify({ relevance: "strong", source_url: RET[0] }); search = true; } else if (body.includes("PRIMUS_F1_CLAIM_CHECK")) { text = JSON.stringify({ derivation: CLAIM, parity: CLAIM, argument: CLAIM }); search = true; }
    else if (body.includes("PRIMUS_PLAN_CHECK")) text = JSON.stringify({ attributes: { relevance: "strong", specific: true }, route: { matches: "yes", confidence: "high" } }); else if (body.includes("PRIMUS_INPUT_REVIEW")) text = JSON.stringify({ fields: [] });
    else if (body.includes("PRIMUS_F3_PRICE_EVENTS")) { text = JSON.stringify({ annualIncreasePct: 5, inflation_source_url: RET[1], inflation_quote: "costs rose 5%", events: [] }); search = true; }
    const content = [...(search ? [{ type: "web_search_tool_result", content: RET.map((u) => ({ type: "web_search_result", url: u, title: u })) }] : []), { type: "text", text }];
    return new Response(JSON.stringify({ content, stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } }); };

  const db = await import("../lib/db.js"); const auth = await import("../lib/auth.js"); const { handleApiRequest } = await import("../lib/apiRouter.js");
  const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js"); const gn = await import("../lib/goNoGo.js"); const { sealGoNoGoOutput } = await import("../lib/sealOutput.js");
  const { evaluationStatus } = await import("../lib/evaluationStatus.js"); const { TECH_SHIFT_DIMENSIONS } = await import("../lib/techShiftRisk.js"); const { scoreInputKey } = await import("../lib/scoringRuleset.js").catch(() => ({}));
  await db.initDb();

  // ---- users
  const mkUser = async (email, name, role, team) => { const u0 = await db.findOrCreateSlackUser({ email, name, role, externalId: `U_${name}` }); if (team) await db.setUserTeam(u0.id, team, { onlyIfEmpty: true }); return db.getUserByEmail(email); };
  const users = { admin: await mkUser("tanmay.v@cavinkare.com", "Tanmay Bapat", "ADMIN", "CIA"), bm: await mkUser("bm.one@cavinkare.com", "Bm One", "BM", "R&D") };
  const cookieFor = (u) => (u ? `primus_session=${auth.signSession({ userId: u.id, tokenVersion: Number(u.tokenVersion ?? u.token_version ?? 1) })}` : "");

  // ---- the server as the browser sees it
  let ipN = 0; const apiLog = [];
  async function serve(method, url, bodyText, headers, cookie) {
    const u = new URL(url, "http://localhost"); ipN += 1; const chunks = []; let status = 200; const hdr = {};
    const req = Object.assign(Readable.from(bodyText ? [Buffer.from(bodyText)] : []), { method, url: u.pathname + u.search, headers: { "content-type": "application/json", ...headers, cookie, "x-forwarded-for": `10.9.${(ipN >> 8) & 255}.${ipN & 255}` }, query: Object.fromEntries(u.searchParams), socket: { remoteAddress: "127.0.0.1" } });
    const res = { statusCode: 200, headersSent: false, setHeader(k, v) { hdr[String(k).toLowerCase()] = v; }, getHeader(k) { return hdr[String(k).toLowerCase()]; }, removeHeader(k) { delete hdr[String(k).toLowerCase()]; }, writeHead(s, h) { status = s; res.statusCode = s; if (h) for (const [k, v] of Object.entries(h)) hdr[k.toLowerCase()] = v; return res; }, write(c) { if (c != null) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))); return true; }, end(c) { if (c != null) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))); res.done = true; }, on() { return res; }, once() { return res; }, emit() { return true; } };
    let handled = true; try { handled = await handleApiRequest(req, res); } catch (e) { status = 500; chunks.push(Buffer.from(JSON.stringify({ error: String(e?.message || e) }))); }
    if (handled === false && !res.done) { status = 404; chunks.push(Buffer.from(JSON.stringify({ error: "not found" }))); }
    status = res.statusCode || status; recordTouch({ kind: "route", method, path: u.pathname }); apiLog.push({ method, path: u.pathname, status, body: bodyText ? String(bodyText).slice(0, 8000) : "" }); return { status, hdr, buf: Buffer.concat(chunks) };
  }
  const api = async (as, method, p, body) => { const r = await serve(method, p, body == null ? null : JSON.stringify(body), {}, cookieFor(users[as] || as)); let j = null; try { j = JSON.parse(r.buf.toString("utf8")); } catch { /* binary */ } return { status: r.status, json: j, buf: r.buf, headers: r.hdr }; };

  // ---- seeding: ideas in every state, through the real code
  const dims = Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, { risk: "Low", reason: "Format is stable (source: allowed.example)" }]));
  const A = (raw) => ({ raw, status: "ok", searchUsed: true, returnedSources: [RET[0]] });
  const fullFindings = () => ({ f3: { priceEvents: { annualIncreasePct: 5, events: [] } }, evidenceRead: { status: "read", facts: [{ topic: "attribute", verified: true, quote: "q" }, { topic: "benchmark", verified: true, quote: "q" }] }, f2: { assessments: { gst: A({ ratePct: 18, supported: true, source_url: RET[0], quote: "q" }) } }, f4: { assessments: Object.fromEntries(TECH_SHIFT_DIMENSIONS.map((k) => [k, A({ rating: "Low", supported: true, source_url: RET[0], quote: "q" })])) }, f1: { benchmarkVerified: true, assessments: { benchmark: A({ relevance: "strong", source_url: RET[0] }), derivation: A(CLAIM), parity: A(CLAIM), argument: A(CLAIM), attributes: A({ relevance: "strong", specific: true }), route: A({ matches: "yes", confidence: "high" }) } } });
  const baseDoc = (name, over = {}) => ({ name, category: "Serum", ideaDescription: `${name}: a leave-on serum that visibly reduces hair fall in eight weeks`, submitterName: "K", submitterDepartment: "R&D", division: "Personal Care",
    f1: { declaredAttribute: "Visible hair fall reduction in 8 weeks", declaredAttribute2: "Light non-greasy feel", benchmark: "Dove Scalp Serum 100 ml", declaredGap: 3, gapDerivation: "2% caffeine and a peptide blend versus none", parityExceptions: "No fragrance", targetConsumer: "Urban women 25 to 40", growthRoute: "frequency", growthArgument: "Scalp care is growing faster than hair oil in metros", evidenceSourceDate: "https://example.com/study", ...(over.f1 || {}) },
    f2: { cogsAtScale: 100, gstRatePct: 18, netMarginAtScale: 60, grammage: "100 ml", mrpInr: 295, qcomTrajectory: "Take rate rising", ...(over.f2 || {}) }, f4: { techShiftRisk: { overallRisk: "Low", dimensions: dims }, ...(over.f4 || {}) }, f5: over.f5 || {}, f6: over.f6 || {} });
  async function seed(name, { owner = "admin", over = {}, findings = true, seal = true, legacy = false, rfOver = null } = {}) {
    const u = users[owner]; const d = baseDoc(name, over); const created = await db.createProposition({ createdByEmail: u.email, createdByUserId: u.id, submitterDepartment: d.submitterDepartment, name: d.name, category: d.category, ideaDescription: d.ideaDescription, submitterName: "K" });
    await db.setPropositionDivision(created.id, d.division); const rf = findings ? fullFindings() : {}; if (rfOver) rfOver(rf);
    await db.updateProposition(created.id, { ...d }, { handler: "seed", writer: "server" });
    await db.query(`UPDATE propositions SET research_findings_json = $2 WHERE id = $1`, [created.id, JSON.stringify(rf)]);
    let doc = await db.getPropositionById(created.id);
    if (seal && findings) { const advisory = await computeAllAdvisoryChecks(doc); const score = gn.scoreAdvisoryChecks(advisory); const classification = gn.computeGoNoGo(advisory); const goNoGo = sealGoNoGoOutput({ classification, score, rationale: `${name} is ${classification} at ${score.pct}%.`, rulesetVersion: undefined }, { advisoryChecks: advisory, doc }); await db.updateProposition(created.id, { goNoGo }, { handler: "seed", writer: "server" }); }
    if (legacy) await db.updateProposition(created.id, { goNoGo: { classification: "NO-GO", score: { pct: 40, done: 4, total: 10 }, rationale: `${name} is NO-GO at 40%.` } }, { handler: "seed", writer: "server" });
    return { id: created.id, name, state: evaluationStatus(await db.getPropositionById(created.id)).state };
  }
  const ideas = {}; ideas.go = await seed("Serum Alpha"); ideas.watch = await seed("Serum Beta", { over: { f2: { netMarginAtScale: 40 } } }); ideas.nogo = await seed("Serum Gamma", { over: { f1: { declaredAttribute: "", benchmark: "", gapDerivation: "", growthArgument: "" } } });
  ideas.fresh = await seed("Serum Delta", { findings: false, seal: false }); ideas.legacy = await seed("Serum Epsilon", { findings: false, seal: false, legacy: true }); ideas.bms = await seed("Serum Zeta", { owner: "bm" });

  // ---- snapshot / restore the database between clicks
  const q = (s, p) => db.query(s, p); const rowsOf = (r) => (Array.isArray(r) ? r : r?.rows || []); const tables = rowsOf(await q(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type='BASE TABLE'`)).map((r) => r.table_name);
  const snap = {}; for (const t of tables) snap[t] = rowsOf(await q(`SELECT row_to_json(x) AS j FROM "${t}" x`)).map((r) => r.j);
  async function restore() { if (!tables.length) return; await q(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`); for (const t of tables) if (snap[t].length) await q(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(null::"${t}", $1::json)`, [JSON.stringify(snap[t])]); }

  // ---- the browser
  const bundle = await build({ entryPoints: [path.join(root, "src/main.jsx")], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", logLevel: "silent", loader: { ".jsx": "jsx", ".css": "empty", ".svg": "dataurl", ".png": "dataurl" }, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", "import.meta.env.MODE": '"production"', "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" } });
  const code = bundle.outputFiles[0].text;
  function boot({ as = "admin", hash = "" } = {}) {
    const errors = []; const effects = { fetches: 0, fileDialogs: 0, downloads: 0, opens: 0, clipboard: 0, blobs: 0 }; const vc = new VirtualConsole();
    vc.on("jsdomError", (e) => errors.push(`jsdom: ${String(e?.message || e).slice(0, 140)}`)); vc.on("error", (...a) => { const m = a.map(String).join(" "); if (/Error|Uncaught|above error/i.test(m)) errors.push(`console: ${m.slice(0, 140)}`); });
    const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: `http://localhost/${hash}`, runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc }); const w = dom.window; installDomRecorder(w); // records real clicks and edits when PRIMUS_TOUCH_LOG is set (before anything captures HTMLElement.prototype.click)
    w.scrollTo = () => {}; w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })); w.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} }; w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    w.confirm = () => true; w.prompt = () => "test"; w.alert = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {}; w.open = () => { effects.opens += 1; return null; };
    w.URL.createObjectURL = () => { effects.blobs += 1; return "blob:test"; }; w.URL.revokeObjectURL = () => {}; Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async () => { effects.clipboard += 1; } }, configurable: true });
    const origClick = w.HTMLElement.prototype.click; w.HTMLInputElement.prototype.click = function () { if (this.type === "file") { effects.fileDialogs += 1; return; } return origClick.call(this); }; w.HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute("download") || /^blob:/.test(this.href)) effects.downloads += 1; };
    w.addEventListener("error", (e) => errors.push(`window: ${String(e.message || e).slice(0, 140)}`)); w.addEventListener("unhandledrejection", (e) => errors.push(`promise: ${String(e.reason?.message || e.reason).slice(0, 140)}`));
    const cookie = cookieFor(users[as]);
    w.fetch = async (input, init = {}) => { effects.fetches += 1; const url = typeof input === "string" ? input : input?.url; const method = String(init.method || input?.method || "GET").toUpperCase(); let body = init.body; if (body && typeof body !== "string") body = typeof body.toString === "function" && !(body instanceof w.FormData) ? String(body) : null;
      if (!String(url).startsWith("/api") && !/localhost\/api/.test(String(url))) return mkResp(404, {}, Buffer.from("{}"), w); const hdrs = {}; for (const [k, v] of Object.entries(init.headers || {})) hdrs[k.toLowerCase()] = v; const r = await serve(method, url, body, hdrs, cookie); return mkResp(r.status, r.hdr, r.buf, w); };
    w.eval(code); return { w, errors, effects };
  }
  function mkResp(status, hdr, buf, w) { const ct = String(hdr["content-type"] || "application/json"); return { ok: status >= 200 && status < 300, status, statusText: String(status), url: "", headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null, has: (k) => String(k).toLowerCase() in hdr, forEach: (fn) => Object.entries(hdr).forEach(([k, v]) => fn(v, k)) }, json: async () => JSON.parse(buf.toString("utf8") || "null"), text: async () => buf.toString("utf8"), blob: async () => new w.Blob([buf], { type: ct }), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), clone() { return mkResp(status, hdr, buf, w); } }; }
  const text = (w) => { const c = w.document.body.cloneNode(true); c.querySelectorAll("style,script").forEach((e) => e.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
  const click = (w, el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); const btn = (w, label) => [...w.document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
  const leaf = (w, t) => [...w.document.querySelectorAll("*")].filter((e) => e.children.length === 0 && e.textContent.trim() === t)[0];
  // ---- navigation recipes: how a person reaches each screen
  const nav = {
    async home(w) { await waitFor(() => btn(w, "NPD Screen"), 8000); await sleep(400); },
    async log(w) { await waitFor(() => btn(w, "Log"), 8000); click(w, btn(w, "Log")); await waitFor(() => /Proposition log/.test(text(w)), 8000); await sleep(500); },
    async settings(w) { await waitFor(() => btn(w, "Settings"), 8000); click(w, btn(w, "Settings")); await sleep(1200); },
    async idea(w, name) { await nav.log(w); const el = leaf(w, name); if (!el) throw new Error(`idea ${name} not in the Log`); click(w, el); await waitFor(() => /Back to log|Back to spec/.test(text(w)), 8000); await sleep(900); },
    async inputs(w, name, opts = {}) { await nav.idea(w, name); await waitFor(() => btn(w, "View entered inputs"), 4000).catch(() => {}); const b = btn(w, "View entered inputs"); if (b) { click(w, b); await sleep(1200); }
      // Filters 2 to 4 may start closed: open them so a test can reach their boxes (a test of the accordion itself passes { keepCollapsed: true })
      if (!opts.keepCollapsed) { const closed = [...w.document.querySelectorAll('section[data-filter-open="no"] .prop-filter-h, [data-filter-toggle][aria-expanded="false"]')]; for (const el of closed) click(w, el); if (closed.length) await sleep(500);
        // Cost and margin sit behind one "Adjust cost and margin" button (Part 145): press it so a test can type into COGS, net margin and MRP (a test of that button itself passes { keepCollapsed: true })
        const adj = [...w.document.querySelectorAll("button")].find((b) => /^\s*adjust cost and margin\s*$/i.test(b.textContent)); if (adj && !w.document.querySelector('[data-field="f2.cogsAtScale"]')) { click(w, adj); await sleep(400); } } },
  };
  return { db, api, users, ideas, boot, nav, text, click, btn, leaf, restore, apiLog, aiLog, seed, evaluationStatus, close: async () => { await suite.close?.(); globalThis.fetch = realFetch; } };
}

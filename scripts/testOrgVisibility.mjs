/**
 * WHO SEES WHICH IDEAS, FOR THE THREE TITLES: Individual contributor, Team Lead, Business Head (plus Admin). An independent acceptance test written by the reviewer. Real app routes on a real Postgres schema (TEST_DATABASE_URL, local only); the roster and the business-head-to-teams mapping are loaded through the real admin API, as the owner will do it.
 * Put in scripts/ with uiHarness.mjs. Exits 1 if any check fails. Options: --team-lead-sees-department  (use if "their team" means everyone in the lead's department, not only the people who report to them)
 * Roster rules the app enforces (learned by running it): a MEMBER must report to someone on the SAME team; a TEAM_LEAD must report to a BUSINESS_HEAD of the SAME team. A Business Head has one roster team; the ideas of several teams reach them through the separate business-head-to-teams mapping (admin), not through the roster.
 * Contract the app must meet (the T checks): GET /api/auth/me returns user.title, and GET /api/admin/users returns a title on every row, each one of exactly "Individual contributor", "Team Lead", "Business Head" or "Admin". The old words BM and BH FORUM must not be a title.
 *  V1 an Individual contributor sees only their own ideas   V2 a Team Lead sees their own ideas and those of the people who report to them (or the whole department with the option), and nobody else's
 *  V3 a Business Head sees every idea of every team mapped to them (here R&D and Ambient & Beverages), and no other team's   V4 a second Business Head mapped to PC sees only PC   V5 a person with no roster row (here one in a mapped team, and one in no mapped team) sees only their own ideas   V6 Admin sees all
 *  V7 the Log list and opening an idea by its id always agree (200 only for what the list shows, 404 for everything else)   V8 a Team Lead and a Business Head cannot edit someone else's idea just by seeing it
 *  T1 /api/auth/me titles are exactly the three titles (and Admin)   T2 the admin users list shows the same titles   T3 no user is titled BM or BH FORUM
 */
const TL_DEPT = process.argv.includes("--team-lead-sees-department");
import { createHarness } from "./uiHarness.mjs";
let failed = 0; const check = (id, n, ok, d = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`); if (!ok) failed++; };
const H = await createHarness(); const E = (s) => `${s}@cavinkare.com`; const q = async (s, p) => { const r = await H.db.query(s, p); return Array.isArray(r) ? r : r?.rows || []; };
const people = { ic_rd1: ["R&D", "MEMBER", "tl_rd"], ic_rd2: ["R&D", "MEMBER", "tl_rd"], ic_rd3: ["R&D", "MEMBER", "bh1"], tl_rd: ["R&D", "TEAM_LEAD", "bh1"], bh1: ["R&D", "BUSINESS_HEAD", ""], ic_ab: ["Ambient & Beverages", "MEMBER", ""], bh2: ["PC", "BUSINESS_HEAD", ""], ic_pc: ["PC", "MEMBER", "bh2"], ic_mk: ["Digital Marketing", "MEMBER", ""] };
for (const [k, [team]] of Object.entries(people)) { const u0 = await H.db.findOrCreateSlackUser({ email: E(k), name: k, role: "BM", externalId: `U_${k}` }); await H.db.setUserTeam(u0.id, team, { onlyIfEmpty: true }); H.users[k] = await H.db.getUserByEmail(E(k)); }
const ideaOf = {}; for (const [k, [team]] of Object.entries(people)) { const idea = await H.seed(`I_${k}`, { owner: k }); await q(`UPDATE propositions SET submitter_department = $2 WHERE id = $1`, [idea.id, team]); ideaOf[k] = idea.id; }
// load the business-head mapping, then the roster, through the real admin API
const bhRes = await H.api("admin", "POST", "/api/admin/users/business-head-teams", { rows: [{ email: E("bh1"), team: "R&D" }, { email: E("bh1"), team: "Ambient & Beverages" }, { email: E("bh2"), team: "PC" }] });
const csv = ["email,name,team,org_role,reports_to_email", ...Object.entries(people).filter(([k]) => k !== "ic_mk" && k !== "ic_ab").map(([k, [team, role, rep]]) => `${E(k)},${k},${team},${role},${rep ? E(rep) : ""}`)].join("\n");
const pv = await H.api("admin", "POST", "/api/admin/users/roster/preview", { csv }); const ap = await H.api("admin", "POST", "/api/admin/users/roster/apply", { csv, confirm: true });
console.log(`setup: business-head mapping HTTP ${bhRes.status}; roster preview HTTP ${pv.status}; roster apply HTTP ${ap.status}${ap.status >= 400 ? "\n  roster issues: " + JSON.stringify(ap.json?.preview?.issues || ap.json || "").slice(0, 700) : ""}`);
const idsSeen = async (as) => { const r = await H.api(as, "GET", "/api/propositions"); const arr = Array.isArray(r.json) ? r.json : r.json?.propositions || r.json?.items || []; return new Set(arr.map((p) => p.id)); };
const ALL = Object.keys(people); const sees = { admin: new Set(ALL) };
for (const k of ALL) sees[k] = new Set([k]);
sees.tl_rd = new Set(TL_DEPT ? ["tl_rd", "ic_rd1", "ic_rd2", "ic_rd3", "bh1"] : ["tl_rd", "ic_rd1", "ic_rd2"]); sees.bh1 = new Set(["bh1", "tl_rd", "ic_rd1", "ic_rd2", "ic_rd3", "ic_ab"]); sees.bh2 = new Set(["bh2", "ic_pc"]);
const asName = (set) => [...set].sort().join(",");
const mismatch = []; const actual = {}; for (const viewer of ["admin", ...ALL]) { const got = await idsSeen(viewer); actual[viewer] = new Set(ALL.filter((k) => got.has(ideaOf[k]))); const exp = sees[viewer]; if (asName(actual[viewer]) !== asName(exp)) mismatch.push(`${viewer}: sees [${asName(actual[viewer])}] expected [${asName(exp)}]`); }
const grp = (ids, id, n) => { const bad = mismatch.filter((m) => ids.includes(m.split(":")[0])); check(id, n, bad.length === 0, bad.join(" | ") || "as expected"); };
grp(["ic_rd1", "ic_rd2", "ic_rd3", "ic_ab", "ic_pc"], "V1", "an Individual contributor sees only their own ideas");
grp(["tl_rd"], "V2", TL_DEPT ? "a Team Lead sees their own and the whole R&D department's ideas, and no other team's" : "a Team Lead sees their own ideas and those of the people who report to them (not peers outside their team, not other teams)");
grp(["bh1"], "V3", "a Business Head sees every idea of every team mapped to them (R&D and Ambient & Beverages) and no other team's");
grp(["bh2"], "V4", "a second Business Head mapped only to PC sees only PC ideas");
grp(["ic_mk", "ic_ab"], "V5", "a person with no roster row sees only their own ideas");
grp(["admin"], "V6", "Admin sees every idea");
const gaps = []; for (const viewer of ["admin", ...ALL]) for (const k of ALL) { const r = await H.api(viewer, "GET", `/api/propositions/${ideaOf[k]}`); const shows = actual[viewer].has(k); if (shows !== (r.status === 200) || (!shows && r.status !== 404)) gaps.push(`${viewer}->${k}: list ${shows ? "shows" : "hides"} but open answers ${r.status}`); }
check("V7", "the Log list and opening an idea by its id always agree: 200 for exactly what the list shows, 404 for everything else", gaps.length === 0, gaps.slice(0, 3).join(" | ") || `${(ALL.length + 1) * ALL.length} viewer/idea pairs checked`);
const edits = []; for (const viewer of ["tl_rd", "bh1"]) { const target = viewer === "tl_rd" ? "ic_rd1" : "ic_ab"; const r = await H.api(viewer, "PUT", `/api/propositions/${ideaOf[target]}`, { name: "changed by a viewer" }); const after = (await q(`SELECT name FROM propositions WHERE id = $1`, [ideaOf[target]]))[0]?.name; if (after === "changed by a viewer" || r.status === 200) edits.push(`${viewer} could change ${target}'s idea (HTTP ${r.status})`); }
check("V8", "a Team Lead and a Business Head can SEE other people's ideas but cannot edit them", edits.length === 0, edits.join(" | ") || "edits refused");
const TITLES = new Set(["Individual contributor", "Team Lead", "Business Head", "Admin"]); const want = { ic_rd1: "Individual contributor", tl_rd: "Team Lead", bh1: "Business Head", bh2: "Business Head", ic_mk: "Individual contributor", admin: "Admin" };
const me = {}; for (const k of Object.keys(want)) { const r = await H.api(k, "GET", "/api/auth/me"); me[k] = r.json?.user?.title ?? r.json?.title ?? null; }
check("T1", "/api/auth/me returns the title: Individual contributor, Team Lead, Business Head and Admin as expected", Object.entries(want).every(([k, t]) => me[k] === t), Object.entries(want).map(([k, t]) => `${k}=${me[k] ?? "none"}`).join(" "));
const ul = await H.api("admin", "GET", "/api/admin/users"); const rows = ul.json?.users || []; const byEmail = Object.fromEntries(rows.map((u) => [u.email, u.title]));
check("T2", "the admin Users list shows the same titles", Object.entries(want).filter(([k]) => k !== "admin").every(([k, t]) => byEmail[E(k)] === t), Object.keys(want).filter((k) => k !== "admin").map((k) => `${k}=${byEmail[E(k)] ?? "none"}`).join(" "));
check("T3", "no user is titled BM or BH FORUM, and every title is one of the four allowed", rows.length > 0 && rows.every((u) => TITLES.has(u.title)) && !rows.some((u) => /^(BM|BH FORUM)$/i.test(String(u.title || ""))), `${rows.filter((u) => !TITLES.has(u.title)).length} of ${rows.length} rows have another title or none`);
await H.close(); console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS each title sees exactly what it should"); process.exitCode = failed ? 1 : 0;

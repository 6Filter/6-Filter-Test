/**
 * Part 125 — org roster visibility matrix, import, admin 404, idea team pick.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const SKIP = "SKIP testOrgRosterVisibility — TEST_DATABASE_URL is not set";
const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log(SKIP);
  process.exit(process.env.REQUIRE_POSTGRES_TESTS === "1" ? 1 : 0);
}

function hostAllowed(raw) {
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}
if (!hostAllowed(testUrl) || /render\.com|neon\.tech|supabase\.co/i.test(testUrl)) {
  console.error("Refusing non-local TEST_DATABASE_URL.");
  process.exit(1);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-t125-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "part125-session-secret-xxxxxxxx";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /SUBMITTER_DEPARTMENTS/);
assert.doesNotMatch(formSrc, /Only an ADMIN can change it/);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.doesNotMatch(appSrc, /AdminUsersPage/);
assert.doesNotMatch(appSrc, />Admin</);

const {
  BH_SEES_HOME_TEAM,
  NOTIFY_TEAM_LEAD_ON_REVIEW,
  applyOrgRosterImport,
  ensureOrgRosterSchema,
  getOrgRosterByEmail,
  previewOrgRosterImport,
  syncUserTeamFromRoster,
} = await import("../lib/orgRoster.js");
assert.equal(BH_SEES_HOME_TEAM, true);
assert.equal(NOTIFY_TEAM_LEAD_ON_REVIEW, false);

const { canAccessIdea, filterAccessibleIdeas } = await import("../lib/propositionAccess.js");
const {
  initDb,
  createProposition,
  findOrCreateSlackUser,
  setUserTeam,
  getUserByEmail,
  query,
} = await import("../lib/db.js");
const { replaceBusinessHeadTeams } = await import("../lib/accessDb.js");
const { handleAdminUsers } = await import("../lib/adminUsersApi.js");
const { handleSetTeam } = await import("../lib/authApi.js");
const { signSession } = await import("../lib/auth.js");
const { setPropositionManagerReview } = await import("../lib/db.js");
const { handlePropositionDraft } = await import("../lib/propositionsApi.js");

await initDb();
await ensureOrgRosterSchema();

const mkRes = () => ({
  statusCode: 0,
  body: null,
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  end(payload) {
    if (payload != null && this.body == null) {
      try {
        this.body = typeof payload === "string" ? JSON.parse(payload) : payload;
      } catch {
        this.body = payload;
      }
    }
  },
});
const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.body = body;
};
async function readStream(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

// Seed BH maps for two teams
await replaceBusinessHeadTeams(
  [
    { email: "bh.rd@cavinkare.com", team: "R&D" },
    { email: "bh.cc@cavinkare.com", team: "CC" },
  ],
  { actorUserId: "test" }
);

const csv = [
  "email,name,team,org_role,reports_to_email",
  "bh.rd@cavinkare.com,BH R&D,R&D,BUSINESS_HEAD,",
  "bh.cc@cavinkare.com,BH CC,CC,BUSINESS_HEAD,",
  "lead.a@cavinkare.com,Lead A,R&D,TEAM_LEAD,bh.rd@cavinkare.com",
  "lead.b@cavinkare.com,Lead B,CC,TEAM_LEAD,bh.cc@cavinkare.com",
  "m.a1@cavinkare.com,Member A1,R&D,MEMBER,lead.a@cavinkare.com",
  "m.a2@cavinkare.com,Member A2,R&D,MEMBER,lead.a@cavinkare.com",
  "m.b1@cavinkare.com,Member B1,CC,MEMBER,lead.b@cavinkare.com",
  "m.b2@cavinkare.com,Member B2,CC,MEMBER,lead.b@cavinkare.com",
].join("\n");

const preview = await previewOrgRosterImport(csv);
assert.equal(preview.ok, true, JSON.stringify(preview.issues || preview.bhDisagreements));
const applied = await applyOrgRosterImport(csv, { actorUserId: "admin-test" });
assert.equal(applied.applied, true);

// Repeat import changes nothing meaningful
const preview2 = await previewOrgRosterImport(csv);
assert.equal(preview2.ok, true);
assert.equal(preview2.wouldChange, 0);

// Users + wrong self-chosen team corrected from roster
const users = {};
for (const email of [
  "bh.rd@cavinkare.com",
  "bh.cc@cavinkare.com",
  "lead.a@cavinkare.com",
  "lead.b@cavinkare.com",
  "m.a1@cavinkare.com",
  "m.a2@cavinkare.com",
  "m.b1@cavinkare.com",
  "m.b2@cavinkare.com",
  "admin@cavinkare.com",
]) {
  const role = email.startsWith("bh.") ? "BH FORUM" : email.startsWith("admin") ? "ADMIN" : "BM";
  users[email] = await findOrCreateSlackUser({ email, name: email.split("@")[0], role });
}
await setUserTeam(users["m.a1@cavinkare.com"].id, "FD and Dairy");
let fixed = await syncUserTeamFromRoster(await getUserByEmail("m.a1@cavinkare.com"));
assert.equal(fixed.team, "FD and Dairy", "roster must not overwrite account default team");
assert.equal(fixed.rosterTeam, "R&D", "roster team attached for visibility only");
assert.equal(fixed.rosterLocked, false);

for (const [email, team] of [
  ["bh.rd@cavinkare.com", "R&D"],
  ["bh.cc@cavinkare.com", "CC"],
  ["lead.a@cavinkare.com", "R&D"],
  ["lead.b@cavinkare.com", "CC"],
  ["m.a2@cavinkare.com", "R&D"],
  ["m.b1@cavinkare.com", "CC"],
  ["m.b2@cavinkare.com", "CC"],
]) {
  await setUserTeam(users[email].id, team);
  const synced = await syncUserTeamFromRoster(await getUserByEmail(email));
  assert.equal(synced.team, team, "account team stays self-chosen");
  assert.equal(synced.rosterTeam, team, "roster team metadata");
}

async function idea(ownerEmail, team) {
  const u = users[ownerEmail];
  return createProposition({
    createdByUserId: u.id,
    createdByEmail: u.email,
    submitterDepartment: team,
  });
}

const ideaA1 = await idea("m.a1@cavinkare.com", "R&D");
const ideaA2 = await idea("m.a2@cavinkare.com", "R&D");
const ideaB1 = await idea("m.b1@cavinkare.com", "CC");
const ideaA1OnCc = await idea("m.a1@cavinkare.com", "CC"); // member picks other team

const as = async (email) => {
  const u = await getUserByEmail(email);
  return { ...u, email: u.email, role: u.role, team: u.team };
};

async function sees(email, prop) {
  return canAccessIdea(await as(email), prop);
}

assert.equal(await sees("m.a1@cavinkare.com", ideaA1), true);
assert.equal(await sees("m.a1@cavinkare.com", ideaA2), false);
assert.equal(await sees("m.a1@cavinkare.com", ideaB1), false);

assert.equal(await sees("lead.a@cavinkare.com", ideaA1), true);
assert.equal(await sees("lead.a@cavinkare.com", ideaA2), true);
assert.equal(await sees("lead.a@cavinkare.com", ideaB1), false);
assert.equal(await sees("lead.b@cavinkare.com", ideaA1), false);
assert.equal(await sees("lead.b@cavinkare.com", ideaA1OnCc), false);

assert.equal(await sees("bh.rd@cavinkare.com", ideaA1), true);
assert.equal(await sees("bh.rd@cavinkare.com", ideaA1OnCc), true, "D1 home-team BH sees cross-team pick");
assert.equal(await sees("bh.cc@cavinkare.com", ideaA1OnCc), true, "idea-team BH sees it");
assert.equal(await sees("bh.cc@cavinkare.com", ideaA1), false);
assert.equal(await sees("admin@cavinkare.com", ideaB1), true);

const listForLeadA = await filterAccessibleIdeas(await as("lead.a@cavinkare.com"), [
  ideaA1,
  ideaA2,
  ideaB1,
  ideaA1OnCc,
]);
assert.deepEqual(
  listForLeadA.map((p) => p.id).sort(),
  [ideaA1.id, ideaA2.id, ideaA1OnCc.id].sort(),
  "lead A sees own reports' ideas including cross-team pick"
);

// Invalid import rejected
const badPreview = await previewOrgRosterImport(
  "email,name,team,org_role,reports_to_email\nbad@x.com,Bad,NotATeam,MEMBER,lead.a@cavinkare.com\n"
);
assert.equal(badPreview.ok, false);
assert.ok((badPreview.issues || []).length > 0);

// set-team allowed for rostered person (account default ≠ roster team)
const token = signSession({
  userId: users["m.a1@cavinkare.com"].id,
  tokenVersion: Number((await getUserByEmail("m.a1@cavinkare.com")).tokenVersion) || 1,
});
const setRes = mkRes();
const setReq = Object.assign(Readable.from([Buffer.from(JSON.stringify({ team: "CC" }))]), {
  method: "POST",
  headers: { cookie: `primus_session=${token}`, "content-type": "application/json" },
});
await handleSetTeam(setReq, setRes);
assert.equal(setRes.statusCode, 200, setRes.body?.error);
assert.equal(setRes.body?.user?.team, "CC");
assert.equal(setRes.body?.user?.rosterLocked, false);

// Admin endpoints 404 for non-admin
const deny = mkRes();
await handleAdminUsers(
  { method: "GET", user: await as("m.a1@cavinkare.com") },
  deny,
  "/api/admin/users"
);
assert.equal(deny.statusCode, 404);

const allow = mkRes();
await handleAdminUsers(
  { method: "GET", user: await as("admin@cavinkare.com") },
  allow,
  "/api/admin/users"
);
assert.equal(allow.statusCode, 200);
assert.ok(Array.isArray(allow.body?.users));

// Idea team change before / after manager review
const teamIdea = await idea("m.a2@cavinkare.com", "R&D");
const draftOk = mkRes();
await handlePropositionDraft(
  Object.assign(
    Readable.from([
      Buffer.from(
        JSON.stringify({
          proposition: { ...(await import("../lib/db.js").then((m) => m.getPropositionById(teamIdea.id))), submitterDepartment: "CC", submitterName: "A2" },
        })
      ),
    ]),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      user: { ...(await as("m.a2@cavinkare.com")), role: "BM" },
    }
  ),
  draftOk,
  teamIdea.id,
  { readBody: async (r) => JSON.parse(await readStream(r)), sendJson, redactSecrets: (s) => s }
);
assert.equal(draftOk.statusCode, 200, draftOk.body?.error);
const { getPropositionById } = await import("../lib/db.js");
assert.equal((await getPropositionById(teamIdea.id)).submitterDepartment, "CC");
assert.equal(await sees("bh.cc@cavinkare.com", await getPropositionById(teamIdea.id)), true);

await setPropositionManagerReview(teamIdea.id, {
  requestedAt: new Date().toISOString(),
  requestedByEmail: "m.a2@cavinkare.com",
});
const locked = mkRes();
await handlePropositionDraft(
  Object.assign(
    Readable.from([
      Buffer.from(
        JSON.stringify({
          proposition: {
            ...(await getPropositionById(teamIdea.id)),
            submitterDepartment: "R&D",
            submitterName: "A2",
          },
        })
      ),
    ]),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      user: { ...(await as("m.a2@cavinkare.com")), role: "BM" },
    }
  ),
  locked,
  teamIdea.id,
  { readBody: async (r) => JSON.parse(await readStream(r)), sendJson, redactSecrets: (s) => s }
);
assert.equal(locked.statusCode, 200, locked.body?.error);
assert.equal((await getPropositionById(teamIdea.id)).submitterDepartment, "R&D");
assert.equal(await sees("bh.rd@cavinkare.com", await getPropositionById(teamIdea.id)), true);

assert.ok(await getOrgRosterByEmail("m.a1@cavinkare.com"));

console.log("PASS testOrgRosterVisibility");
await suite.drop?.();
process.exit(0);

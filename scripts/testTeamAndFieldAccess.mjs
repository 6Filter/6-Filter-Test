/**
 * Part 124 — creator field access, server-owned writes, team change.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const SKIP = "SKIP testTeamAndFieldAccess — TEST_DATABASE_URL is not set";
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
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-t124-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "part124-session-secret-xxxxxxxx";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.doesNotMatch(formSrc, /roleLocked/);
assert.doesNotMatch(formSrc, /ownershipBanner/);
assert.doesNotMatch(formSrc, /canWriteField/);
assert.match(formSrc, /SUBMITTER_DEPARTMENTS/);
assert.match(formSrc, /AutofillProvenance/);
assert.match(formSrc, /re-routed if you change the team/);
assert.doesNotMatch(formSrc, /Ask the admin to change it\./);
assert.doesNotMatch(formSrc, /managerReviewRequestedOn\(doc\)\s*\?\s*String\(currentUser/);

const {
  canEditIdeaInputs,
  isServerOwnedField,
  usuallyProvidedByHint,
} = await import("../lib/fieldOwnership.js");
const { firstForbiddenField } = await import("../lib/fieldOwnershipGate.js");
const { SUBMITTER_DEPARTMENTS } = await import("../lib/propositionFields.js");

assert.equal(isServerOwnedField("techShiftRisk"), true);
assert.equal(isServerOwnedField("cogsAtScale"), false);
assert.match(usuallyProvidedByHint("cogsAtScale"), /Usually provided by/);

const owner = { id: "u1", email: "owner@cavinkare.com", role: "BM", team: "R&D" };
const other = { id: "u2", email: "other@cavinkare.com", role: "BM", team: "CC" };
const admin = { id: "adm", email: "admin@cavinkare.com", role: "ADMIN", team: "R&D" };
const idea = { createdByUserId: "u1", createdByEmail: "owner@cavinkare.com", submitterDepartment: "R&D" };

assert.equal(canEditIdeaInputs(owner, idea), true);
assert.equal(canEditIdeaInputs(other, idea), false);
assert.equal(canEditIdeaInputs(admin, idea), true);

const emptyIdea = { f2: {}, f4: {} };
const fakeRisk = {
  dimensions: { functionalCoreStability: { risk: "High", reason: "client forged" } },
};
assert.equal(
  await firstForbiddenField(owner, idea, emptyIdea, { f4: { techShiftRisk: fakeRisk } }),
  "techShiftRisk"
);

const {
  initDb,
  createProposition,
  updateProposition,
  getPropositionById,
  findOrCreateSlackUser,
  setUserTeam,
  query,
} = await import("../lib/db.js");
const { handlePropositionById } = await import("../lib/propositionsApi.js");
const { handleSetTeam } = await import("../lib/authApi.js");
const { setPropositionManagerReview } = await import("../lib/db.js");

await initDb();

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.body = body;
};
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
const mkReq = (body, user) => {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body || {}))]), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    user,
  });
  return req;
};

const dbOwner = await findOrCreateSlackUser({ email: owner.email, name: "Owner", role: "BM" });
await setUserTeam(dbOwner.id, "R&D");
const dbOther = await findOrCreateSlackUser({ email: other.email, name: "Other", role: "BM" });
await setUserTeam(dbOther.id, "CC");
const dbAdmin = await findOrCreateSlackUser({ email: admin.email, name: "Admin", role: "ADMIN" });

const prop = await createProposition({
  createdByUserId: dbOwner.id,
  createdByEmail: dbOwner.email,
  submitterDepartment: "R&D",
  submitterName: "Owner",
  ideaDescription: "Test idea for part 124",
  name: "Part 124",
  category: "Hair oils",
});

await updateProposition(
  prop.id,
  { f2: { cogsAtScale: 38, netMarginAtScale: 22, gstRatePct: 18 }, researchRunAt: new Date().toISOString() },
  { handler: "seed", writer: "server", allowFilterReset: true }
);

const { handlePropositionDraft } = await import("../lib/propositionsApi.js");

// Creator saves COGS override (autosave path)
const draftRes = mkRes();
const seeded = await getPropositionById(prop.id);
await handlePropositionDraft(
  Object.assign(Readable.from([Buffer.from(JSON.stringify({
    proposition: {
      ...seeded,
      f2: { ...(seeded.f2 || {}), cogsAtScale: 40, netMarginAtScale: 22, gstRatePct: 18 },
    },
  }))]), { method: "POST", headers: { "content-type": "application/json" }, user: { ...dbOwner, team: "R&D", role: "BM" } }),
  draftRes,
  prop.id,
  { readBody: async (r) => JSON.parse(await readStream(r)), sendJson, redactSecrets: (s) => s }
);
assert.equal(draftRes.statusCode, 200, `creator draft: ${draftRes.body?.error || ""}`);
const afterSave = await getPropositionById(prop.id);
assert.equal(Number(afterSave.f2?.cogsAtScale), 40, "cogsAtScale persisted");

// Non-owner forbidden
const denyRes = mkRes();
await handlePropositionById(
  mkReq(
    {
      proposition: {
        ...afterSave,
        f2: { ...(afterSave.f2 || {}), cogsAtScale: 99 },
        submitterName: "Owner",
        submitterDepartment: "R&D",
      },
      confirmMissingSteps: true,
    },
    { ...dbOther, team: "CC", role: "BM" }
  ),
  denyRes,
  prop.id,
  { readBody: async (r) => JSON.parse(await readStream(r)), sendJson, redactSecrets: (s) => s }
);
assert.ok([403, 404].includes(denyRes.statusCode), "non-owner cannot edit inputs");

// Client techShiftRisk when stored empty → forbidden at API layer
const riskRes = mkRes();
const current = await getPropositionById(prop.id);
await handlePropositionById(
  mkReq(
    {
      proposition: {
        ...current,
        f4: {
          techShiftRisk: {
            dimensions: { functionalCoreStability: { risk: "Low", reason: "injected" } },
          },
        },
        submitterName: "Owner",
        submitterDepartment: "R&D",
      },
      confirmMissingSteps: true,
    },
    { ...dbOwner, team: "R&D", role: "BM" }
  ),
  riskRes,
  prop.id,
  { readBody: async (r) => JSON.parse(await readStream(r)), sendJson, redactSecrets: (s) => s }
);
assert.equal(riskRes.statusCode, 403);
assert.equal(riskRes.body?.field, "techShiftRisk");

// set-team allows change when team already set
await setUserTeam(dbOwner.id, "R&D");
const setTeamReq = Object.assign(Readable.from([Buffer.from(JSON.stringify({ team: "CC" }))]), {
  method: "POST",
  headers: { cookie: "primus_session=stub", "content-type": "application/json" },
});
const { signSession } = await import("../lib/auth.js");
const token = signSession({ userId: dbOwner.id, tokenVersion: Number(dbOwner.tokenVersion) || 1 });
setTeamReq.headers.cookie = `primus_session=${token}`;
const setTeamRes = mkRes();
await handleSetTeam(setTeamReq, setTeamRes);
assert.equal(setTeamRes.statusCode, 200, `set-team change: ${setTeamRes.body?.error || ""}`);
assert.equal(setTeamRes.body?.user?.team, "CC");

// Idea team change before manager review (draft/autosave path — same as the form select)
const teamProp = await createProposition({
  createdByUserId: dbOwner.id,
  createdByEmail: dbOwner.email,
  submitterDepartment: "R&D",
});
const teamChangeRes = mkRes();
await handlePropositionDraft(
  Object.assign(Readable.from([Buffer.from(JSON.stringify({
    proposition: {
      ...(await getPropositionById(teamProp.id)),
      submitterDepartment: "Manufacturing and Commodities",
      submitterName: "Owner",
    },
  }))]), { method: "POST", headers: { "content-type": "application/json" }, user: { ...dbOwner, team: "CC", role: "BM" } }),
  teamChangeRes,
  teamProp.id,
  { readBody: async (r) => JSON.parse(await readStream(r)), sendJson, redactSecrets: (s) => s }
);
assert.equal(teamChangeRes.statusCode, 200, `team draft: ${teamChangeRes.body?.error || ""}`);
const teamChanged = await getPropositionById(teamProp.id);
assert.equal(teamChanged.submitterDepartment, "Manufacturing and Commodities");
const teamAudit = await query(
  `SELECT action, ids_json FROM proposition_audit WHERE action = 'idea-team-changed' ORDER BY audit_id DESC LIMIT 5`
);
assert.ok(teamAudit.some((r) => String(r.ids_json || "").includes(teamProp.id)), "idea-team-changed audited");

// After manager review — creator can still change team (re-route)
await setPropositionManagerReview(teamProp.id, {
  requestedAt: new Date().toISOString(),
  requestedByEmail: dbOwner.email,
  status: "requested",
});
const rerouteRes = mkRes();
await handlePropositionDraft(
  Object.assign(Readable.from([Buffer.from(JSON.stringify({
    proposition: {
      ...(await getPropositionById(teamProp.id)),
      submitterDepartment: "Sales & Distribution FMCG",
      submitterName: "Owner",
    },
  }))]), { method: "POST", headers: { "content-type": "application/json" }, user: { ...dbOwner, team: "CC", role: "BM" } }),
  rerouteRes,
  teamProp.id,
  { readBody: async (r) => JSON.parse(await readStream(r)), sendJson, redactSecrets: (s) => s }
);
assert.equal(rerouteRes.statusCode, 200, `team after review: ${rerouteRes.body?.error || ""}`);
assert.equal((await getPropositionById(teamProp.id)).submitterDepartment, "Sales & Distribution FMCG");
const moveEvents = await query(
  `SELECT event FROM manager_review_events WHERE idea_id = $1 ORDER BY created_at ASC`,
  [teamProp.id]
);
assert.ok(
  moveEvents.some((e) => e.event === "moved"),
  `expected moved event, got ${moveEvents.map((e) => e.event).join(",")}`
);

// Unlisted team → 400
const badTeamRes = mkRes();
await handlePropositionDraft(
  Object.assign(Readable.from([Buffer.from(JSON.stringify({
    proposition: {
      ...(await getPropositionById(prop.id)),
      submitterDepartment: "Not A Real Team",
      submitterName: "Owner",
    },
  }))]), { method: "POST", headers: { "content-type": "application/json" }, user: { ...dbOwner, team: "CC", role: "BM" } }),
  badTeamRes,
  prop.id,
  { readBody: async (r) => JSON.parse(await readStream(r)), sendJson, redactSecrets: (s) => s }
);
assert.equal(badTeamRes.statusCode, 400);

// All 18 canonical teams accepted on create/update path
for (const team of SUBMITTER_DEPARTMENTS) {
  assert.ok(team.length > 0);
  const p = await createProposition({
    createdByUserId: dbOwner.id,
    createdByEmail: dbOwner.email,
    submitterDepartment: team,
    submitterName: "Owner",
    ideaDescription: "team enum",
    name: `Team ${team.slice(0, 12)}`,
    category: "Hair oils",
  });
  assert.equal(p.submitterDepartment, team);
}
assert.equal(SUBMITTER_DEPARTMENTS.length, 18);
assert.ok(SUBMITTER_DEPARTMENTS.includes("R&D"));
assert.ok(SUBMITTER_DEPARTMENTS.includes("Sales & Distribution FMCG"));
assert.ok(SUBMITTER_DEPARTMENTS.includes("Manufacturing and Commodities"));

console.log("PASS testTeamAndFieldAccess");
await suite.drop?.();
process.exit(0);

async function readStream(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

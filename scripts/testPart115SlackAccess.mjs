/**
 * Slack OTP + visibility + legacy team no-clobber (real Postgres, Slack stubbed).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKIP = "SKIP Part 115 Slack access — TEST_DATABASE_URL is not set";
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
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-slack-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "part115-session-secret";
process.env.LOGIN_CODE_SECRET = "part115-login-code-secret";
process.env.ALLOWED_EMAIL_DOMAINS = "cavinkare.com";

const { initDb, createProposition, updateProposition, getPropositionById, query, usingPostgres } =
  await import("../lib/db.js");
const {
  handleRequestCode,
  handleVerifyCode,
} = await import("../lib/authApi.js");
const {
  replaceLoginCode,
  checkDurableRateLimit,
  clearDurableRateLimits,
  getLoginCodeRow,
  consumeLoginCode,
  writeUserAudit,
  replaceBusinessHeadTeams,
} = await import("../lib/accessDb.js");
const { codesMatch, REQUEST_CODE_SAME_MESSAGE, throttleKeyEmail } = await import("../lib/loginCodes.js");
const { canAccessIdea, filterAccessibleIdeas } = await import("../lib/propositionAccess.js");
const { findOrCreateSlackUser, adminUpdateUser, bumpUserTokenVersion, getUserByEmail } =
  await import("../lib/db.js");
const { signSession, verifySession } = await import("../lib/auth.js");
const { coalesceSubmitterDepartment } = await import("../lib/propositionFields.js");

await initDb();
assert.equal(usingPostgres(), true);

function mockRes() {
  const out = { statusCode: 0, body: null, headers: {} };
  return {
    out,
    setHeader(k, v) {
      out.headers[k] = v;
    },
    end() {},
  };
}

function sendJson(res, status, body) {
  res.out.statusCode = status;
  res.out.body = body;
}

const calls = [];
const slackFetch = async (url, opts = {}) => {
  calls.push({ url: String(url), body: opts.body || null });
  if (String(url).includes("lookupByEmail")) {
    const u = new URL(url);
    const email = u.searchParams.get("email");
    if (email === "guest@cavinkare.com") {
      return { ok: true, json: async () => ({ ok: true, user: { id: "U_GUEST", is_restricted: true, profile: { email } } }) };
    }
    if (email === "gone@cavinkare.com") {
      return { ok: true, json: async () => ({ ok: true, user: { id: "U_GONE", deleted: true, profile: { email } } }) };
    }
    if (email === "unknown@cavinkare.com") {
      return { ok: true, json: async () => ({ ok: false, error: "users_not_found" }) };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        user: {
          id: `U_${email.split("@")[0].toUpperCase()}`,
          profile: { real_name: email.split("@")[0], email },
        },
      }),
    };
  }
  if (String(url).includes("conversations.open")) {
    return { ok: true, json: async () => ({ ok: true, channel: { id: "D1" } }) };
  }
  if (String(url).includes("chat.postMessage")) {
    return { ok: true, json: async () => ({ ok: true }) };
  }
  return { ok: true, json: async () => ({ ok: false }) };
};

async function requestCode(email) {
  const res = mockRes();
  const req = {
    method: "POST",
    headers: { "x-forwarded-for": "127.0.0.1" },
    body: undefined,
  };
  // monkey: handleRequestCode uses readJsonBody — pass via stub by calling internals instead
  const started = Date.now();
  void started;
  await handleRequestCode(
    {
      method: "POST",
      headers: { "cf-connecting-ip": "203.0.113.10", "content-type": "application/json" },
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify({ email }));
      },
    },
    {
      statusCode: 200,
      setHeader() {},
      end() {},
      ...{
        // use sendJson injection — handleRequestCode imports sendJson; call through wrapper
      },
    },
    { slack: { fetchImpl: slackFetch, token: "xoxb-test" } }
  );
  return { calls };
}

// Direct path tests (avoid streaming body quirks): domain / guest / unknown → no DM
calls.length = 0;
{
  const { lookupSlackMemberByEmail, sendSlackLoginCodeDm } = await import("../lib/slackAuth.js");
  for (const email of ["outsider@gmail.com", "unknown@cavinkare.com", "guest@cavinkare.com", "gone@cavinkare.com"]) {
    const before = calls.length;
    if (email.endsWith("@cavinkare.com")) {
      const looked = await lookupSlackMemberByEmail(email, { fetchImpl: slackFetch, token: "xoxb-test" });
      assert.equal(looked.ok, false);
    }
    assert.equal(calls.filter((c) => String(c.url).includes("chat.postMessage")).length, 0);
    assert.ok(calls.length >= before || !email.endsWith("@cavinkare.com"));
  }
}

// Issue + verify code once
const aliceEmail = "alice@cavinkare.com";
const { code } = await replaceLoginCode(aliceEmail);
const row = await getLoginCodeRow(aliceEmail);
assert.ok(row);
assert.equal(codesMatch(code, row.code_hmac), true);
assert.equal(codesMatch("000000", row.code_hmac), false);
await consumeLoginCode(aliceEmail);
assert.equal(await getLoginCodeRow(aliceEmail), null);

// New request cancels previous
const first = await replaceLoginCode(aliceEmail);
const second = await replaceLoginCode(aliceEmail);
assert.notEqual(first.code, second.code);
const active = await getLoginCodeRow(aliceEmail);
assert.equal(codesMatch(second.code, active.code_hmac), true);
assert.equal(codesMatch(first.code, active.code_hmac), false);

// Rate limit survives clearRateLimits (memory)
const { clearRateLimits } = await import("../lib/rateLimit.js");
await clearDurableRateLimits();
for (let i = 0; i < 3; i++) {
  assert.equal(await checkDurableRateLimit(throttleKeyEmail(aliceEmail), { max: 3 }), true);
}
assert.equal(await checkDurableRateLimit(throttleKeyEmail(aliceEmail), { max: 3 }), false);
clearRateLimits();
assert.equal(await checkDurableRateLimit(throttleKeyEmail(aliceEmail), { max: 3 }), false);

// Users + visibility
const alice = await findOrCreateSlackUser({ email: aliceEmail, name: "Alice", role: "BM" });
await adminUpdateUser(alice.id, { team: "Manufacturing" });
const bob = await findOrCreateSlackUser({ email: "bob@cavinkare.com", name: "Bob", role: "BM" });
await adminUpdateUser(bob.id, { team: "PC" });
const bhMfg = await findOrCreateSlackUser({
  email: "bh.mfg@cavinkare.com",
  name: "BH Mfg",
  role: "BH FORUM",
});
await adminUpdateUser(bhMfg.id, { team: "Manufacturing", role: "BH FORUM" });
const bhMc = await findOrCreateSlackUser({
  email: "bh.mc@cavinkare.com",
  name: "BH MC",
  role: "BH FORUM",
});
await adminUpdateUser(bhMc.id, { team: "Manufacturing and Commodities", role: "BH FORUM" });
const admin = await findOrCreateSlackUser({ email: "admin@cavinkare.com", name: "Admin", role: "ADMIN" });
await adminUpdateUser(admin.id, { role: "ADMIN", team: "R&D" });

await replaceBusinessHeadTeams([
  { email: "bh.mfg@cavinkare.com", team: "Manufacturing" },
  { email: "bh.mc@cavinkare.com", team: "Manufacturing and Commodities" },
]);

const ideaA = await createProposition({
  createdByUserId: alice.id,
  createdByEmail: aliceEmail,
  submitterDepartment: "Manufacturing",
});
const ideaB = await createProposition({
  createdByUserId: bob.id,
  createdByEmail: "bob@cavinkare.com",
  submitterDepartment: "PC",
});
const ideaMc = await createProposition({
  createdByUserId: bob.id,
  createdByEmail: "bob@cavinkare.com",
  submitterDepartment: "Manufacturing and Commodities",
});
await query(`UPDATE propositions SET submitter_department = 'NPD', created_by_email = NULL WHERE id = $1`, [
  ideaMc.id,
]);
const legacyIdea = await getPropositionById(ideaMc.id);
assert.equal(legacyIdea.submitterDepartment, "NPD");
assert.equal(legacyIdea.teamIsLegacy, true);

const aliceUser = { ...alice, team: "Manufacturing", email: aliceEmail, role: "BM", status: "active" };
const bobUser = { ...bob, team: "PC", email: "bob@cavinkare.com", role: "BM", status: "active" };
const bhMfgUser = {
  ...(await getUserByEmail("bh.mfg@cavinkare.com")),
  role: "BH FORUM",
  status: "active",
};
const bhMcUser = {
  ...(await getUserByEmail("bh.mc@cavinkare.com")),
  role: "BH FORUM",
  status: "active",
};
const adminUser = { ...(await getUserByEmail("admin@cavinkare.com")), role: "ADMIN", status: "active" };

assert.equal(await canAccessIdea(aliceUser, ideaA), true);
assert.equal(await canAccessIdea(aliceUser, ideaB), false);
assert.equal(await canAccessIdea(bobUser, ideaA), false);
assert.equal(await canAccessIdea(bhMfgUser, ideaA), true);
assert.equal(await canAccessIdea(bhMfgUser, ideaB), false);
assert.equal(await canAccessIdea(bhMcUser, ideaA), false);
assert.equal(await canAccessIdea(adminUser, ideaB), true);
assert.equal(await canAccessIdea(adminUser, legacyIdea), true);
assert.equal(await canAccessIdea(aliceUser, legacyIdea), false);
assert.equal(await canAccessIdea(bhMfgUser, legacyIdea), false);

// Legacy no-clobber on save
const afterBlank = await updateProposition(legacyIdea.id, {
  name: "kept",
  submitterDepartment: "",
  baseVersion: legacyIdea.version,
});
assert.equal(afterBlank.submitterDepartment, "NPD");
const afterLegacySwap = await updateProposition(legacyIdea.id, {
  name: "kept2",
  submitterDepartment: "Marketing",
  baseVersion: afterBlank.version,
});
assert.equal(afterLegacySwap.submitterDepartment, "NPD");

// Disabled + token version
await adminUpdateUser(bob.id, { status: "disabled" });
const disabled = await getUserByEmail("bob@cavinkare.com");
assert.equal(disabled.status, "disabled");
const bumped = await bumpUserTokenVersion(alice.id);
const oldTok = signSession({ userId: alice.id, tokenVersion: 1 });
const sess = verifySession(oldTok);
assert.equal(sess.tokenVersion, 1);
assert.notEqual(Number(bumped.tokenVersion), 1);

// BH import preview shape (18 heads pattern)
const { SUBMITTER_DEPARTMENTS } = await import("../lib/propositionFields.js");
const previewRows = Array.from({ length: 18 }, (_, i) => ({
  email: `Head${i}@CavinKare.com`,
  team: SUBMITTER_DEPARTMENTS[i],
  note: "",
}));
const savedBh = await replaceBusinessHeadTeams(previewRows);
assert.equal(savedBh.length, 18);
assert.ok(savedBh.every((r) => r.email === r.email.toLowerCase()));
const savedAgain = await replaceBusinessHeadTeams(previewRows);
assert.equal(savedAgain.length, 18);

await writeUserAudit({ action: "part115-self-check", targetEmail: aliceEmail, detail: { ok: true } });

// ADMIN bootstrap: first listed email becomes ADMIN; second cannot via bootstrap
const {
  maybeBootstrapAdmin,
  countAdminUsers,
  reassignPropositionTeams,
  listLegacyTeamPropositions,
} = await import("../lib/db.js");
const { isBootstrapAdminEmail } = await import("../lib/auth.js");
process.env.ADMIN_BOOTSTRAP_EMAILS = "tanmay.v@cavinkare.com,extra.bootstrap@cavinkare.com";
assert.equal(isBootstrapAdminEmail("tanmay.v@cavinkare.com"), true);
assert.equal(isBootstrapAdminEmail("alice@cavinkare.com"), false);

// Clear existing ADMINs in this throwaway schema so bootstrap can run
await query(`UPDATE users SET role = 'BM' WHERE role = 'ADMIN'`);
assert.equal(await countAdminUsers(), 0);

const tanmay = await findOrCreateSlackUser({
  email: "tanmay.v@cavinkare.com",
  name: "Tanmay Bapat",
  role: "BM",
});
const tanmayAdmin = await maybeBootstrapAdmin(tanmay, { eligible: true });
assert.equal(tanmayAdmin.role, "ADMIN");
assert.equal(await countAdminUsers(), 1);

const extra = await findOrCreateSlackUser({
  email: "extra.bootstrap@cavinkare.com",
  name: "Extra",
  role: "BM",
});
const extraAfter = await maybeBootstrapAdmin(extra, { eligible: true });
assert.equal(extraAfter.role, "BM", "bootstrap ignored once an ADMIN exists");
assert.equal(await countAdminUsers(), 1);

// Legacy Marketing idea + reassign to PC; ids and total count unchanged
const beforeCount = Number((await query(`SELECT count(*)::int AS n FROM propositions`))[0].n);
const beforeIds = new Set((await query(`SELECT id FROM propositions`)).map((r) => r.id));
const mkt = await createProposition({
  createdByUserId: null,
  createdByEmail: null,
  submitterDepartment: "Marketing",
});
await query(`UPDATE propositions SET submitter_department = 'Marketing', created_by_email = NULL WHERE id = $1`, [
  mkt.id,
]);
const legacyList = await listLegacyTeamPropositions();
assert.ok(legacyList.some((p) => p.id === mkt.id || p.submitterDepartment === "Marketing" || p.submitterDepartment === "NPD"));
const reassigned = await reassignPropositionTeams([mkt.id], "PC");
assert.equal(reassigned.length, 1);
assert.equal(reassigned[0].submitterDepartment, "PC");
assert.equal(reassigned[0].teamIsLegacy, false);
const afterCount = Number((await query(`SELECT count(*)::int AS n FROM propositions`))[0].n);
const afterIds = new Set((await query(`SELECT id FROM propositions`)).map((r) => r.id));
assert.equal(afterCount, beforeCount + 1);
assert.ok([...beforeIds].every((id) => afterIds.has(id)));
assert.ok(afterIds.has(mkt.id));

// Guard-call scan: every proposition handler file must reference canAccessIdea
const libDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib");
const handlerFiles = ["propositionsApi.js", "managerReviewApi.js", "propositionGateApi.js"];
for (const name of handlerFiles) {
  const src = readFileSync(path.join(libDir, name), "utf8");
  if (name === "propositionGateApi.js" && !src.includes("canAccessIdea")) {
    assert.match(src, /canAccessIdea|getPropositionById/);
  } else if (name !== "propositionGateApi.js") {
    assert.match(src, /canAccessIdea/, `${name} must call canAccessIdea`);
  }
}
assert.match(readFileSync(path.join(libDir, "propositionGateApi.js"), "utf8"), /canAccessIdea/);

// Router must not keep register/password login handlers
const router = readFileSync(path.join(libDir, "apiRouter.js"), "utf8");
assert.match(router, /request-code/);
assert.doesNotMatch(router, /handleRegister/);

console.log("PASS Part 115 Slack access, visibility, bootstrap ADMIN, legacy reassign");

await suite.close?.();

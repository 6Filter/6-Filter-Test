/**
 * Manager review + access rules + encrypted backup (real Postgres, Slack stubbed).
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

const SKIP = "SKIP Part 116 manager review — TEST_DATABASE_URL is not set";
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
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-mgr-${process.pid}`);
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "part116-session-secret-xxxxxxxx";
process.env.BACKUP_TOKEN = "part116-backup-token-xxxxxxxxxxxxxxxx";
process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
process.env.PUBLIC_APP_URL = "https://example.test";
process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
delete process.env.MANAGER_REVIEW_CHANNEL_COPY;
delete process.env.MANAGER_REVIEW_WEBHOOK_URL;

const dmLog = [];
const channelLog = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url || "");
  if (u.includes("conversations.open")) {
    return { ok: true, json: async () => ({ ok: true, channel: { id: "DTEST" } }) };
  }
  if (u.includes("chat.postMessage")) {
    dmLog.push(JSON.parse(String(opts.body || "{}")));
    return { ok: true, json: async () => ({ ok: true }) };
  }
  if (u.includes("hooks.slack.com")) {
    channelLog.push(JSON.parse(String(opts.body || "{}")));
    return { ok: true, text: async () => "ok" };
  }
  if (typeof realFetch === "function") return realFetch(url, opts);
  return { ok: false, json: async () => ({}) };
};

try {
  const {
    initDb,
    createProposition,
    updateProposition,
    getPropositionById,
    findOrCreateSlackUser,
    adminUpdateUser,
    query,
    usingPostgres,
    setPropositionManagerReview,
  } = await import("../lib/db.js");
  const { replaceBusinessHeadTeams } = await import("../lib/accessDb.js");
  const { canAccessIdea } = await import("../lib/propositionAccess.js");
  const { canProceedToProofUpload, hasManagerApproval } = await import("../lib/filterUnlock.js");
  const {
    requestManagerReview,
    decideManagerReview,
    hydrateReviewOnDoc,
  } = await import("../lib/managerReviewServer.js");
  const { listManagerReviewEvents } = await import("../lib/managerReviewEvents.js");
  const { reviewDisplayState } = await import("../lib/managerReview.js");
  const { encryptBackupPayload, decryptBackupPayload, gzipJsonLines, backupTokenMatches } =
    await import("../lib/backupCrypto.js");
  const { handleBackupExport } = await import("../lib/backupExportApi.js");
  const { handleHealth } = await import("../lib/healthApi.js");
  const { flattenProposition } = await import("../lib/logExport.js");

  await initDb();
  assert.equal(usingPostgres(), true);

  const owner = await findOrCreateSlackUser({
    email: "owner.116@cavinkare.com",
    name: "Owner One",
    role: "BM",
    externalId: "U_OWNER",
  });
  await adminUpdateUser(owner.id, { role: "BM", team: "PC" });

  const head = await findOrCreateSlackUser({
    email: "head.116@cavinkare.com",
    name: "Head Care",
    role: "BH FORUM",
    externalId: "U_HEAD",
  });
  await adminUpdateUser(head.id, { role: "BH FORUM", team: "PC" });

  const otherHead = await findOrCreateSlackUser({
    email: "otherhead.116@cavinkare.com",
    name: "Other Head",
    role: "BH FORUM",
    externalId: "U_OTHER",
  });
  await adminUpdateUser(otherHead.id, { role: "BH FORUM", team: "FD and Dairy" });

  const admin = await findOrCreateSlackUser({
    email: "admin.116@cavinkare.com",
    name: "Admin User",
    role: "ADMIN",
    externalId: "U_ADMIN",
  });
  await adminUpdateUser(admin.id, { role: "ADMIN", team: "PC" });

  await replaceBusinessHeadTeams(
    [
      { email: head.email, team: "PC" },
      { email: otherHead.email, team: "FD and Dairy" },
    ],
    { actorUserId: admin.id }
  );

  const created = await createProposition({
    submitterDepartment: "PC",
    createdByUserId: owner.id,
    createdByEmail: owner.email,
  });
  await updateProposition(created.id, {
    name: "Secret Serum Idea",
    ideaDescription: "A WATCH idea for manager review tests.",
    goNoGo: { classification: "WATCH", score: { pct: 72, total: 72, max: 100 } },
  });

  const idea = await getPropositionById(created.id);
  assert.equal(await canAccessIdea(owner, idea), true);
  assert.equal(await canAccessIdea(otherHead, idea), false);

  dmLog.length = 0;
  channelLog.length = 0;
  const reqResult = await requestManagerReview({ ideaId: idea.id, user: owner });
  assert.equal(reqResult.ok, true);
  assert.match(reqResult.announce, /Business head: Head Care/);
  assert.ok(dmLog.some((m) => String(m.text || "").includes("Secret Serum Idea")));
  assert.equal(channelLog.length, 0);
  assert.equal(canProceedToProofUpload(await hydrateReviewOnDoc(await getPropositionById(idea.id))), false);

  await assert.rejects(
    () =>
      decideManagerReview({
        ideaId: idea.id,
        user: otherHead,
        decision: "approve",
        comment: "Looks good enough",
      }),
    /not found|Not allowed/i
  );

  await assert.rejects(
    () =>
      decideManagerReview({
        ideaId: idea.id,
        user: owner,
        decision: "approve",
        comment: "Looks good enough",
      }),
    /cannot decide|own idea|Not allowed/i
  );

  dmLog.length = 0;
  const first = await decideManagerReview({
    ideaId: idea.id,
    user: head,
    decision: "approve",
    comment: "Approved after review by BH",
  });
  assert.equal(first.decision, "approved");
  const second = await decideManagerReview({
    ideaId: idea.id,
    user: head,
    decision: "approve",
    comment: "Approved after review by BH again xx",
  });
  assert.equal(second.alreadyDecided, true);
  const events = await listManagerReviewEvents(idea.id);
  assert.equal(events.filter((e) => e.event === "approved").length, 1);
  const approvedDoc = await hydrateReviewOnDoc(await getPropositionById(idea.id));
  assert.equal(hasManagerApproval(approvedDoc), true);
  assert.equal(canProceedToProofUpload(approvedDoc), true);

  const created2 = await createProposition({
    submitterDepartment: "PC",
    createdByUserId: owner.id,
    createdByEmail: owner.email,
  });
  await updateProposition(created2.id, {
    name: "Reject Path Idea",
    goNoGo: { classification: "WATCH", score: { pct: 70, total: 70, max: 100 } },
  });
  await requestManagerReview({ ideaId: created2.id, user: owner });
  await decideManagerReview({
    ideaId: created2.id,
    user: head,
    decision: "reject",
    comment: "Needs a clearer proof plan",
  });
  const rejected = await hydrateReviewOnDoc(await getPropositionById(created2.id));
  assert.equal(hasManagerApproval(rejected), false);
  assert.equal(canProceedToProofUpload(rejected), false);
  assert.equal(reviewDisplayState(rejected).statusKey, "rejected");

  const headOwned = await createProposition({
    submitterDepartment: "PC",
    createdByUserId: head.id,
    createdByEmail: head.email,
  });
  await updateProposition(headOwned.id, {
    name: "Head Own Idea",
    goNoGo: { classification: "WATCH", score: { pct: 71, total: 71, max: 100 } },
  });
  // Sole team head cannot route a WATCH request to ADMIN — must map another head.
  await assert.rejects(
    () => requestManagerReview({ ideaId: headOwned.id, user: head }),
    /only business head|another head/i
  );

  await replaceBusinessHeadTeams([{ email: otherHead.email, team: "FD and Dairy" }], {
    actorUserId: admin.id,
  });
  const orphan = await createProposition({
    submitterDepartment: "PC",
    createdByUserId: owner.id,
    createdByEmail: owner.email,
  });
  await updateProposition(orphan.id, {
    name: "Orphan Team Idea",
    goNoGo: { classification: "WATCH", score: { pct: 68, total: 68, max: 100 } },
  });
  await assert.rejects(
    () => requestManagerReview({ ideaId: orphan.id, user: owner }),
    /No business head is mapped|assign the team head/i
  );

  // Team head mapping (not ADMIN) receives the Ambient & Beverages WATCH request.
  const bevHead = await findOrCreateSlackUser({
    email: "bevhead.116@cavinkare.com",
    name: "Bev Head",
    role: "BH FORUM",
    externalId: "U_BEV",
  });
  await adminUpdateUser(bevHead.id, { role: "BH FORUM", team: "Ambient & Beverages" });
  await replaceBusinessHeadTeams(
    [
      { email: head.email, team: "PC" },
      { email: bevHead.email, team: "Ambient & Beverages" },
      { email: admin.email, team: "Ambient & Beverages" },
    ],
    { actorUserId: admin.id }
  );
  const bevIdea = await createProposition({
    submitterDepartment: "Ambient & Beverages",
    createdByUserId: owner.id,
    createdByEmail: owner.email,
  });
  await updateProposition(bevIdea.id, {
    name: "Protein milkshake",
    division: "Ambient Dairy",
    goNoGo: { classification: "WATCH", score: { pct: 72, total: 72, max: 100 } },
  });
  dmLog.length = 0;
  const bevReq = await requestManagerReview({ ideaId: bevIdea.id, user: owner });
  assert.equal(bevReq.adminFallback, false);
  assert.ok(bevReq.recipients.some((r) => r.email === String(bevHead.email).toLowerCase()));
  assert.ok(!bevReq.recipients.some((r) => r.email === String(admin.email).toLowerCase()));
  assert.match(bevReq.announce, /Business head: Bev Head/);
  assert.ok(dmLog.some((m) => String(m.text || "").includes("Protein milkshake")));

  await replaceBusinessHeadTeams([{ email: "noslack.116@cavinkare.com", team: "PC" }], {
    actorUserId: admin.id,
  });
  const noSlack = await findOrCreateSlackUser({
    email: "noslack.116@cavinkare.com",
    name: "No Slack Head",
    role: "BH FORUM",
    externalId: null,
  });
  await adminUpdateUser(noSlack.id, { role: "BH FORUM", team: "PC" });
  await query(`UPDATE users SET external_id = NULL WHERE id = $1`, [noSlack.id]);
  const failIdea = await createProposition({
    submitterDepartment: "PC",
    createdByUserId: owner.id,
    createdByEmail: owner.email,
  });
  await updateProposition(failIdea.id, {
    name: "Unreachable Head Idea",
    goNoGo: { classification: "WATCH", score: { pct: 69, total: 69, max: 100 } },
  });
  const failReq = await requestManagerReview({ ideaId: failIdea.id, user: owner });
  assert.ok(failReq.unreachable?.length >= 1);
  assert.match(failReq.unreachable[0].message, /Could not reach/);

  const legacy = await createProposition({
    submitterDepartment: "PC",
    createdByUserId: owner.id,
    createdByEmail: owner.email,
  });
  await updateProposition(legacy.id, {
    name: "Legacy Approval",
    goNoGo: { classification: "WATCH", score: { pct: 75, total: 75, max: 100 } },
  });
  await setPropositionManagerReview(legacy.id, {
    comment: "Legacy manager said yes",
    managerName: "Old Manager",
    approvedAt: "2024-01-15T00:00:00.000Z",
  });
  const legacyDoc = await hydrateReviewOnDoc(await getPropositionById(legacy.id));
  assert.equal(hasManagerApproval(legacyDoc), true);
  assert.equal(canProceedToProofUpload(legacyDoc), true);
  assert.match(reviewDisplayState(legacyDoc).label, /Approved by Old Manager/);

  const flat = flattenProposition(approvedDoc);
  assert.ok(Object.prototype.hasOwnProperty.call(flat, "managerReviewStatus"));

  assert.equal(backupTokenMatches(process.env.BACKUP_TOKEN), true);
  assert.equal(backupTokenMatches("wrong-token"), false);
  const gzip = gzipJsonLines([{ type: "row", table: "users", record: { id: "x", email: "a@b.com" } }]);
  const blob = encryptBackupPayload(gzip, { version: 1, tables: [{ name: "users", rows: 1 }] });
  const decoded = decryptBackupPayload(blob);
  assert.equal(decoded.manifest.sha256, createHash("sha256").update(gzip).digest("hex"));

  const captured = [];
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(body) {
      captured.push({ status: this.statusCode, body });
    },
  };
  await handleBackupExport(
    { method: "GET", headers: { "x-backup-token": process.env.BACKUP_TOKEN }, url: "/api/admin/backup/export" },
    res
  );
  assert.equal(captured[0].status, 200);

  const healthRes = {
    statusCode: 0,
    setHeader() {},
    end(body) {
      this.body = body;
    },
  };
  await handleHealth({ method: "GET" }, healthRes);
  const health = JSON.parse(healthRes.body);
  assert.ok(Object.prototype.hasOwnProperty.call(health, "lastBackupAt"));

  process.env.MANAGER_REVIEW_CHANNEL_COPY = "1";
  process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/T/B/X";
  await replaceBusinessHeadTeams([{ email: head.email, team: "PC" }], { actorUserId: admin.id });
  const copyIdea = await createProposition({
    submitterDepartment: "PC",
    createdByUserId: owner.id,
    createdByEmail: owner.email,
  });
  await updateProposition(copyIdea.id, {
    name: "Must Not Appear In Channel",
    goNoGo: { classification: "WATCH", score: { pct: 66, total: 66, max: 100 } },
  });
  channelLog.length = 0;
  await requestManagerReview({ ideaId: copyIdea.id, user: owner });
  assert.ok(channelLog.length >= 1);
  assert.ok(!String(channelLog[0].text || "").includes("Must Not Appear In Channel"));

  console.log("PASS Part 116 manager review, deep-link access rules, encrypted backup");
} finally {
  globalThis.fetch = realFetch;
  await suite.drop?.();
}

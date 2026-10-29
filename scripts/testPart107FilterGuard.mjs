/**
 * Empty filter objects must not be sent, and a populated column must survive one.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildResearchFindings } from "../lib/researchFindings.js";
import { checkF3 } from "../lib/filterChecks.js";
import { filterHasContent, FILTER_COLUMNS, omitEmptyFilterColumns } from "../lib/filterWriteGuard.js";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-guard-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const empty = { forumVerdict: "", verdictNote: "" };
const kept = omitEmptyFilterColumns({ name: "Kept", f1: empty, f2: { cogsAtScale: 40, netMarginAtScale: 20 } });
assert.equal(kept.f1, undefined);
assert.equal(kept.f2.cogsAtScale, 40);

const unusable = buildResearchFindings({
  marginElasticityResearch: { maxMarginPct: null, maxMrpInr: null, basis: "no ceiling" },
});
assert.equal(unusable.f3.researchFailed, true);
assert.equal(unusable.f3.failureReason, "no usable range");
assert.ok(unusable.stepsFailed.includes("F3"));
const card = checkF3({}, {}, unusable.f3);
assert.match(card.items[0].text, /Research failed — retry/);
assert.match(card.items[0].text, /no usable range/);
const skipped = buildResearchFindings({ marginElasticityResearch: {} });
assert.equal(skipped.f3.researchFailed, false);

const { createProposition, getPropositionById, setUpdateRecorder, updateProposition } = await import("../lib/db.js");
const { fileListAudit } = await import("../lib/propositionRetention.js");
const { handlePropositionGoNogo } = await import("../lib/propositionGateApi.js");
const { handlePropositionDraft, handlePropositionById } = await import("../lib/propositionsApi.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");
const { handlePropositionRefreshField, handlePropositionRetryStep } = await import("../lib/propositionsApi.js");
const { handlePropositionReassessF4 } = await import("../lib/filters/reassessTechShift.js");

const created = await createProposition({ submitterDepartment: "R&D" });
const populated = await updateProposition(created.id, {
  name: "Guard row",
  submitterName: "Tester",
  submitterDepartment: "R&D",
  ideaDescription: "A described idea for the guard test.",
  f1: { declaredAttribute: "strength", benchmark: "Brand", declaredGap: 3 },
  f2: { cogsAtScale: 40, netMarginAtScale: 20, grammage: "100g" },
});
assert.equal(populated.f1.declaredAttribute, "strength");

const clobbered = await updateProposition(created.id, { f1: empty, f2: { cogsAtScale: 41, netMarginAtScale: 20 } }, {
  handler: "test-clobber",
});
assert.equal(clobbered.f1.declaredAttribute, "strength");
assert.equal(Number(clobbered.f2.cogsAtScale), 41);
const audit = await fileListAudit();
const blocked = audit.filter((row) => row.action === "blocked-clobber");
assert.ok(blocked.length >= 1);
assert.match(JSON.stringify(blocked[blocked.length - 1].ids_json), /f1/);
assert.doesNotMatch(JSON.stringify(blocked), /strength|Brand/);

const calls = [];
setUpdateRecorder((call) => calls.push(call));
const user = { department: "R&D", role: "ADMIN" };
function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
function redactSecrets(message) {
  return String(message || "");
}
function capture() {
  const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
  return res;
}

const draftRes = capture();
await handlePropositionDraft(
  { method: "POST", user, body: { proposition: { name: "Guard row", f3: empty, f1: populated.f1 } } },
  draftRes,
  created.id,
  { sendJson, redactSecrets }
);
assert.equal(draftRes.statusCode, 200);

const gateRes = capture();
await handlePropositionGoNogo(
  {
    method: "POST",
    user,
    body: {
      proposition: {
        ...populated,
        f1: empty,
        f2: empty,
        f3: empty,
        f4: empty,
      },
    },
  },
  gateRes,
  created.id,
  { sendJson, redactSecrets }
);
assert.equal(gateRes.statusCode, 200);

const putBody = {
  proposition: {
    ...populated,
    id: created.id,
    f3: empty,
    f4: empty,
  },
};
const putRes = capture();
await handlePropositionById(
  { method: "PUT", user },
  putRes,
  created.id,
  { readBody: async () => putBody, sendJson, redactSecrets }
);
assert.notEqual(putRes.statusCode, 500);

for (const run of [
  () => handlePropositionConceptCard({ method: "POST", user, body: { attachment: { name: "card.pdf", data: "e30=" } } }, capture(), created.id, { sendJson, redactSecrets }),
  () => handlePropositionRefreshField({ method: "POST", user, body: { field: "cogsAtScale", proposition: populated } }, capture(), created.id, { sendJson, redactSecrets }),
  () => handlePropositionRetryStep({ method: "POST", user, body: { filter: "f3" } }, capture(), created.id, { sendJson, redactSecrets }),
  () => handlePropositionReassessF4({ method: "POST", user, body: { proposition: populated } }, capture(), created.id, { sendJson, redactSecrets }),
]) {
  try {
    await run();
  } catch {
    /* a handler may stop before a write; it still must not have sent an empty filter */
  }
}

for (const call of calls) {
  for (const key of FILTER_COLUMNS) {
    if (call.payload[key] !== undefined && !filterHasContent(call.payload[key])) {
      assert.fail(`${call.handler} sent an empty ${key}`);
    }
  }
}
const gateCall = calls.find((call) => call.handler === "go-nogo");
assert.ok(gateCall);
assert.equal(gateCall.payload.f1, undefined);
assert.ok(gateCall.payload.goNoGo);

const after = await getPropositionById(created.id);
assert.equal(after.f1.declaredAttribute, "strength");
setUpdateRecorder(null);
console.log("PASS filter column cannot be wiped");

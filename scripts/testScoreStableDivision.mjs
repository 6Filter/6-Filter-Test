/**
 * Same hair-oil numbers must score once.
 * A blank division on the re-read keeps the stored division, or the keyword match.
 * A concept card that cannot be read still keeps its file name and the typed fields.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-score-stable-${process.pid}`);
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;

const { initDb, createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo, divisionForScore } = await import("../lib/propositionGateApi.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

await initDb();

const user = { department: "NPD" };
function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}
const redactSecrets = (message) => String(message || "");

function signature(body) {
  const go = body?.goNoGo || {};
  const checks = body?.advisoryChecks || {};
  return {
    classification: go.classification,
    pct: go.score?.pct,
    f2: checks.f2?.checkLabel,
    scale: go.ideaScale,
  };
}

const fields = {
  name: "Herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil that cools the scalp in summer heat.",
  submitterName: "Live Tester",
  submitterDepartment: "NPD",
  f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, mrpInr: "105.90", grammage: "10g" },
};

assert.equal(divisionForScore({ division: "Personal Care" }, { division: "" }), "Personal Care");
assert.equal(divisionForScore({ division: "Personal Care" }, { division: "Foods" }), "Personal Care");
assert.equal(
  divisionForScore({}, { name: fields.name, category: fields.category, ideaDescription: fields.ideaDescription }),
  "Personal Care"
);

async function score(id, proposition) {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionGoNogo(
    { method: "POST", user },
    res,
    id,
    { readBody: async () => ({ proposition, provider: "claude" }), sendJson, redactSecrets }
  );
  assert.equal(res.statusCode, 200, res.body?.error || "go-nogo failed");
  return res.body;
}

const stored = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(
  stored.id,
  { ...fields, division: "Personal Care" },
  { handler: "seed", writer: "server", allowFilterReset: true }
);
const withDivision = await score(stored.id, { ...fields, division: "Personal Care" });
const blankDivision = await score(stored.id, { ...fields, division: "" });
const again = await score(stored.id, { ...fields, division: "" });
assert.deepEqual(signature(blankDivision), signature(withDivision));
assert.deepEqual(signature(again), signature(withDivision));
assert.equal(signature(withDivision).classification, "NO-GO");
assert.equal(signature(withDivision).f2, "Below floor");
const kept = await getPropositionById(stored.id);
assert.equal(kept.division, "Personal Care");
assert.equal(kept.name, fields.name);
assert.equal(Number(kept.f2.cogsAtScale), 70);
assert.equal(Number(kept.f2.netMarginAtScale), 22);

const fresh = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(fresh.id, fields, { handler: "seed", writer: "server", allowFilterReset: true });
const keyword = await score(fresh.id, { ...fields, division: "" });
assert.deepEqual(signature(keyword), signature(withDivision));
const freshRow = await getPropositionById(fresh.id);
assert.equal(freshRow.division, "Personal Care");

const csv = Buffer.from(
  "Category,Hair oils\nIdea,Herbal cooling hair oil\nAttribute,Cooling feel\nBenchmark,Parachute Advansed\nGap,2\n",
  "utf8"
).toString("base64");
const cardRes = { statusCode: 0, body: null, end() {} };
await handlePropositionConceptCard(
  { method: "POST", user },
  cardRes,
  fresh.id,
  {
    readBody: async () => ({
      attachment: { name: "qa-concept-card-10oct.csv", mediaType: "text/csv", data: csv },
      provider: "claude",
    }),
    sendJson,
    redactSecrets,
  }
);
assert.equal(cardRes.statusCode, 200, cardRes.body?.error || "concept card failed");
assert.equal(cardRes.body.conceptCardName, "qa-concept-card-10oct.csv");
assert.ok(cardRes.body.extractError, "reading without a key should be reported");
const afterCard = await getPropositionById(fresh.id);
assert.equal(afterCard.f1.conceptCardName, "qa-concept-card-10oct.csv");
assert.equal(afterCard.name, fields.name);
assert.equal(afterCard.category, fields.category);
assert.equal(afterCard.ideaDescription, fields.ideaDescription);
assert.equal(Number(afterCard.f2.cogsAtScale), 70);
assert.equal(Number(afterCard.f2.netMarginAtScale), 22);
assert.equal(String(afterCard.f2.mrpInr), "105.90");
assert.equal(afterCard.division, "Personal Care");

console.log("PASS same values keep one score, and a concept card name survives a failed read");

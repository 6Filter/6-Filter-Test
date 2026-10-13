/**
 * Same field values must score once. A blank division on a re-read keeps the
 * stored division, or the keyword match Submit uses. A concept card keeps its
 * file name when reading fails, and does not clear typed fields.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-score-stable-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionGoNogo, divisionForScore } = await import("../lib/propositionGateApi.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

assert.equal(
  divisionForScore({ division: "Personal Care" }, { division: "", ideaDescription: "herbal cooling hair oil" }),
  "Personal Care"
);
assert.equal(
  divisionForScore({ division: "" }, { division: "", name: "Herbal cooling hair oil", category: "Hair oils" }),
  "Personal Care"
);

const user = { department: "NPD" };
function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}
const redactSecrets = (message) => String(message || "");
function capture() {
  return { statusCode: 0, body: null, end() {} };
}

const hairOil = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A herbal cooling hair oil for daily use in a 10g sachet.",
  submitterName: "Live Tester",
  submitterDepartment: "NPD",
  division: "Personal Care",
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "10g",
    mrpInr: "105.90",
    qcomTrajectory: "Take-rate stays near today's card for three years.",
  },
};

const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(created.id, hairOil, { handler: "test-seed" });

async function readScore(division) {
  const res = capture();
  await handlePropositionGoNogo(
    { method: "POST", user, body: { proposition: { ...hairOil, division } } },
    res,
    created.id,
    { sendJson, redactSecrets }
  );
  assert.equal(res.statusCode, 200);
  return {
    classification: res.body.goNoGo.classification,
    pct: res.body.goNoGo.score.pct,
    f2: res.body.advisoryChecks.f2.checkLabel,
  };
}

const blank = await readScore("");
const named = await readScore("Personal Care");
assert.equal(blank.classification, "NO-GO");
assert.equal(named.classification, "NO-GO");
assert.equal(blank.classification, named.classification);
assert.equal(blank.pct, named.pct);
assert.equal(blank.f2, "Below floor");
assert.equal(named.f2, "Below floor");

const stored = await getPropositionById(created.id);
assert.equal(stored.division, "Personal Care");
assert.equal(stored.name, hairOil.name);
assert.equal(Number(stored.f2.cogsAtScale), 70);
assert.equal(Number(stored.f2.netMarginAtScale), 22);
assert.equal(stored.goNoGo.classification, "NO-GO");
assert.equal(stored.goNoGo.score.pct, blank.pct);

const unlabelled = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(unlabelled.id, { ...hairOil, division: "" }, { handler: "test-seed" });
const first = await (async () => {
  const res = capture();
  await handlePropositionGoNogo(
    { method: "POST", user, body: { proposition: { ...hairOil, division: "" } } },
    res,
    unlabelled.id,
    { sendJson, redactSecrets }
  );
  return res.body.goNoGo;
})();
const second = await (async () => {
  const res = capture();
  await handlePropositionGoNogo(
    { method: "POST", user, body: { proposition: { ...hairOil, division: "" } } },
    res,
    unlabelled.id,
    { sendJson, redactSecrets }
  );
  return res.body.goNoGo;
})();
assert.equal(first.classification, second.classification);
assert.equal(first.score.pct, second.score.pct);
assert.equal(first.classification, "NO-GO");
assert.equal(first.score.pct, blank.pct);

const cardRow = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(
  cardRow.id,
  {
    name: "Concept card row",
    category: "Hair oils",
    ideaDescription: "Typed idea that must stay.",
    f1: { declaredAttribute: "cooling sensation", benchmark: "Parachute" },
  },
  { handler: "test-seed" }
);
const cardRes = capture();
await handlePropositionConceptCard(
  { method: "POST", user },
  cardRes,
  cardRow.id,
  {
    readBody: async () => ({
      attachment: {
        name: "qa-concept-card.csv",
        mediaType: "text/csv",
        data: Buffer.from("Category,Hair oils\nIdea,Herbal cooling hair oil\n").toString("base64"),
      },
    }),
    sendJson,
    redactSecrets,
  }
);
assert.equal(cardRes.statusCode, 200);
assert.equal(cardRes.body.conceptCardName, "qa-concept-card.csv");
assert.match(cardRes.body.extractError, /API key|Could not read/i);
const afterCard = await getPropositionById(cardRow.id);
assert.equal(afterCard.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(afterCard.f1.declaredAttribute, "cooling sensation");
assert.equal(afterCard.f1.benchmark, "Parachute");
assert.equal(afterCard.ideaDescription, "Typed idea that must stay.");
assert.equal(afterCard.name, "Concept card row");

console.log("PASS score stays stable when division is blank, and a concept card keeps its file name");

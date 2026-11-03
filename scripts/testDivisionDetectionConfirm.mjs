/**
 * Part 126 — AI-first division detection confirmation rules (AI stubbed).
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-div-detect-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";

const { resolveDivisionSilently } = await import("../lib/filters/resolveDivisionSilent.js");
const {
  formatMinimumMarginHint,
  marginBelowFloorWarning,
  assignDivisionMinimumMargin,
} = await import("../lib/divisionMargin.js");
const { NET_MARGIN_ASSIGNMENT } = await import("../lib/lockedConstants.js");
const {
  initDb,
  createProposition,
  getPropositionById,
  updateProposition,
  listDivisionConfirmationQueue,
  updatePropositionResearchFindingsOnly,
} = await import("../lib/db.js");
const {
  handlePropositionRequestDivisionReview,
  handlePropositionCorrectDivision,
  handleDivisionConfirmationQueue,
} = await import("../lib/propositionsApi.js");

assert.equal(NET_MARGIN_ASSIGNMENT, "proposer-input");
await initDb();

function mkRes() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    end() {},
  };
}
const sendJson = (res, code, body) => {
  res.statusCode = code;
  res.body = body;
};
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// Agree (AI Foods + force rules-agree path via AI-only when rules match foods pickle text)
{
  const r = await resolveDivisionSilently({
    name: "Pickle",
    category: "Pickles",
    ideaDescription: "Traditional mango pickle jar for retail foods aisle",
    aiClassify: async () => ({
      division: "Foods",
      reason: "Culinary pickle.",
      confidence: "high",
    }),
  });
  assert.equal(r.division, "Foods");
  if (r.divisionDetection.rulesDivision === "Foods") {
    assert.equal(r.needsConfirmation, false);
  }
}

// Disagree → needs confirmation, store AI
{
  const r = await resolveDivisionSilently({
    name: "Keratin",
    category: "Hair",
    ideaDescription: "Keratin smoothing treatment for salons professional care kit",
    aiClassify: async () => ({
      division: "Professional Care",
      reason: "Salon B2B treatment.",
      confidence: "high",
    }),
  });
  assert.equal(r.division, "Professional Care");
  if (r.divisionDetection.rulesDivision && r.divisionDetection.rulesDivision !== "Professional Care") {
    assert.equal(r.needsConfirmation, true);
  }
}

// Low confidence → needs confirmation
{
  const r = await resolveDivisionSilently({
    name: "Mystery SKU",
    category: "Other",
    ideaDescription: "Ambiguous personal care cream for retail",
    aiClassify: async () => ({
      division: "Personal Care",
      reason: "Guessy.",
      confidence: "low",
    }),
  });
  assert.equal(r.division, "Personal Care");
  assert.equal(r.needsConfirmation, true);
}

// Hint never fills margin; all 11 divisions
{
  const empty = assignDivisionMinimumMargin({}, { division: "Foods" });
  assert.equal(empty.assigned, false);
  assert.equal(empty.f2.netMarginAtScale, undefined);
  assert.match(formatMinimumMarginHint({ division: "Foods" }), /Minimum net margin for Foods: 35% \(fixed\)/);
  assert.match(marginBelowFloorWarning(20, { division: "Foods" }), /Below the minimum/);
  assert.equal(marginBelowFloorWarning(40, { division: "Foods" }), "");
  assert.match(formatMinimumMarginHint({ division: "" }), /Division not detected/);
  for (const [div, pct] of [
    ["Professional Care", 60],
    ["Personal Care", 50],
    ["Foods", 35],
    ["Snacks", 30],
    ["Bakery", 30],
    ["Ambient Dairy", 25],
    ["Beverages", 25],
    ["Dairy Craft — Non-UHT", 25],
    ["Cold Chain Business", 12],
    ["Dairy Craft — UHT Milk", 12],
  ]) {
    assert.match(formatMinimumMarginHint({ division: div }), new RegExp(`${pct}% \\(fixed\\)`));
  }
  assert.match(
    formatMinimumMarginHint({
      division: "International Business",
      researchFindings: { divisionDetection: { respectiveDivision: "Foods" } },
    }),
    /Foods: 35% \(fixed\).*INR at group level/
  );
}

// Request review → queue; only ADMIN corrects
{
  let prop = await createProposition({ submitterDepartment: "R&D" });
  prop = await updateProposition(
    prop.id,
    {
      name: "Salon Keratin 2",
      category: "Hair",
      ideaDescription: "Keratin for salons",
      submitterName: "Tester",
      submitterDepartment: "R&D",
    },
    { bumpVersion: false, handler: "test" }
  );
  const { adminCorrectPropositionDivision } = await import("../lib/db.js");
  prop = await adminCorrectPropositionDivision(prop.id, "Personal Care", {
    source: "ai",
    needsConfirmation: true,
    confidence: "low",
    reason: "stub",
  });
  // Re-mark confirmation (adminCorrect clears it) for the queue path
  await updatePropositionResearchFindingsOnly(prop.id, {
    ...(prop.researchFindings || {}),
    divisionDetection: {
      ...((prop.researchFindings && prop.researchFindings.divisionDetection) || {}),
      source: "ai",
      needsConfirmation: true,
      confidence: "low",
      reason: "stub",
    },
  });

  const reqRes = mkRes();
  await handlePropositionRequestDivisionReview(
    Object.assign(
      Readable.from([
        Buffer.from(JSON.stringify({ suggestion: "Professional Care", detected: "Personal Care" })),
      ]),
      { method: "POST", user: { email: "bm@cavinkare.com", role: "BM" } }
    ),
    reqRes,
    prop.id,
    { readBody, sendJson, redactSecrets: (s) => s }
  );
  assert.equal(reqRes.statusCode, 200, reqRes.body?.error);
  const queued = await listDivisionConfirmationQueue(50);
  assert.ok(queued.some((q) => q.id === prop.id && q.divisionReviewRequested));

  const deny = mkRes();
  await handlePropositionCorrectDivision(
    Object.assign(
      Readable.from([Buffer.from(JSON.stringify({ division: "Professional Care" }))]),
      { method: "POST", user: { email: "bm@cavinkare.com", role: "BM" } }
    ),
    deny,
    prop.id,
    { readBody, sendJson, redactSecrets: (s) => s }
  );
  assert.equal(deny.statusCode, 403);

  const ok = mkRes();
  await handlePropositionCorrectDivision(
    Object.assign(
      Readable.from([Buffer.from(JSON.stringify({ division: "Professional Care" }))]),
      { method: "POST", user: { email: "admin@cavinkare.com", role: "ADMIN" } }
    ),
    ok,
    prop.id,
    { readBody, sendJson, redactSecrets: (s) => s }
  );
  assert.equal(ok.statusCode, 200, ok.body?.error);
  const fixed = await getPropositionById(prop.id);
  assert.equal(fixed.division, "Professional Care");
  assert.equal(fixed.researchFindings?.divisionDetection?.source, "admin");
  assert.equal(fixed.researchFindings?.divisionDetection?.needsConfirmation, false);

  const queueRes = mkRes();
  await handleDivisionConfirmationQueue(
    { method: "GET", user: { email: "admin@cavinkare.com", role: "ADMIN" } },
    queueRes,
    { sendJson, redactSecrets: (s) => s }
  );
  assert.equal(queueRes.statusCode, 200);
}

console.log("PASS testDivisionDetectionConfirm");
process.exit(0);

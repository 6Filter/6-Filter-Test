/**
 * Five honest Submit outcomes — message text + server screenDecision shape.
 * Cases: blocked required, sealed reuse, ran/changed, already running, credit out.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildScreenDecision,
  formatScreenDecisionLog,
  screenFeedbackMessage,
} from "../lib/screenFeedback.js";

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");

assert.match(apiSrc, /screenDecision/, "API must return screenDecision");
assert.match(apiSrc, /lastScreenDecision/, "API must store lastScreenDecision on the idea");
assert.match(apiSrc, /\[primus\/screen-decision\]/, "API must log one screen-decision line");

// 1) Blocked — blank required on a legacy-shaped idea
const blocked = screenFeedbackMessage({
  outcome: "blocked",
  reasonCode: "missing_required",
  reasonPlain: "GST rate is required before Submit.",
  fieldLabel: "GST rate",
});
assert.match(blocked, /^Not started:/);
assert.match(blocked, /GST rate/i);

// 2) Finished unchanged — sealed result reused
const reused = screenFeedbackMessage({
  outcome: "unchanged",
  screenedAt: "2026-11-27T03:00:00.000Z",
  level: 1,
  reasonCode: "seal_reused",
  fromPct: 61,
  toPct: 61,
  fromVerdict: "WATCH",
  toVerdict: "WATCH",
});
assert.match(reused, /Nothing changed because/i);
assert.match(reused, /stored result for this level was reused/i);

// 3) Finished changed — research ran
const ran = screenFeedbackMessage({
  outcome: "changed",
  screenedAt: "2026-11-27T03:01:00.000Z",
  level: 2,
  fromPct: 61,
  toPct: 80,
  fromVerdict: "WATCH",
  toVerdict: "WATCH",
});
assert.match(ran, /Score 61% to 80%/);
assert.match(ran, /Level 2/);

// 4) Search already running
const busy = screenFeedbackMessage({ outcome: "blocked", reasonCode: "already_running" });
assert.match(busy, /Not started:/);
assert.match(busy, /already running|already in progress/i);

// 5) Credit out
const credit = screenFeedbackMessage({
  outcome: "error",
  reasonPlain: "Claude has run out of credit for this team. Ask an admin to top up.",
});
assert.match(credit, /run out of credit/i);
assert.doesNotMatch(credit, /at |Error:|stack/i);

const decision = buildScreenDecision({
  ideaId: "idea-abc",
  level: 1,
  inputsKeyChanged: false,
  levelChanged: false,
  sealReused: true,
  forceResearch: false,
  outcome: "reused",
  reasonCode: "seal_reused",
  ms: 42,
});
assert.equal(decision.ideaId, "idea-abc");
assert.equal(decision.outcome, "reused");
assert.equal(decision.sealReused, true);
const logLine = formatScreenDecisionLog(decision);
assert.match(logLine, /\[primus\/screen-decision\]/);
assert.match(logLine, /ideaId=idea-abc/);
assert.doesNotMatch(logLine, /milkshake|Cavin/i);

// Wire-up: form must map screenDecision into the five message shapes
assert.match(formSrc, /screenFeedbackMessage|screenDecision/, "form must use screenDecision feedback");
assert.match(formSrc, /statusMessage|submitFeedback/, "form must hold a feedback string for both pages");

console.log("PASS testHonestSubmitOutcomes (message + decision shape)");

// Optional live API check on file store when available
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-honest-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.REQUIRE_AUTH = "false";
process.env.ANTHROPIC_API_KEY = `sk-${"ant"}-stub-local-only`;

const { initDb, createProposition } = await import("../lib/db.js");
const { handlePropositionById, handlePropositionDraft } = await import("../lib/propositionsApi.js");
const { emptyPropositionDoc } = await import("../lib/propositionFields.js");
await initDb();

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}
async function call(handler, method, id, body) {
  const res = { statusCode: 0, body: null, end() {} };
  await handler(
    { method, user: { department: "R&D", role: "NPD", email: "tester@example.com" }, headers: {} },
    res,
    id,
    { readBody: async () => body, sendJson, redactSecrets: (m) => m }
  );
  return res;
}

const row = await createProposition({ submitterDepartment: "R&D" });
const doc = emptyPropositionDoc(row.id);
doc.submitterName = "Honest Tester";
doc.submitterDepartment = "R&D";
doc.name = "Honest submit fixture";
doc.category = "Milkshake";
doc.division = "Beverages";
doc.ideaDescription = "Ambient no-added-sugar milkshake in tetra for the honest-submit outcome checks.";
doc.f1 = {
  declaredAttribute: "no added sugar",
  benchmark: "Britannia Winkin Cow",
  declaredGap: 2,
  gapDerivation: "No added sugar claim in tetra pack milkshakes for this fixture.",
  parityExceptions: "Source of calcium only",
  growthRoute: "new market",
  growthArgument: "Claim is missing from tetra competition which opens a new set of buyers.",
};
doc.f2 = { cogsAtScale: 40, netMarginAtScale: 45, gstRatePct: 12, grammage: "170 ml" };
doc.f3 = {
  volumeLossJustification:
    "Shelf price held flat five years including inflation so volume loss stays inside ten percent.",
};
doc.f4 = { techShiftRisk: { dimensions: {}, overallRisk: "Low" } };
await call(handlePropositionDraft, "POST", row.id, { proposition: doc });

const blockedRes = await call(handlePropositionById, "PUT", row.id, {
  proposition: { ...doc, f2: { ...doc.f2, gstRatePct: null } },
  forceResearch: false,
  forceReseal: true,
});
assert.ok(blockedRes.statusCode >= 400, `blank GST should block, got ${blockedRes.statusCode}`);
assert.ok(blockedRes.body?.screenDecision || /GST|required/i.test(String(blockedRes.body?.error || "")));

const okRes = await call(handlePropositionById, "PUT", row.id, {
  proposition: doc,
  forceResearch: false,
  forceReseal: true,
  confirmMissingSteps: true,
});
assert.equal(okRes.statusCode, 200, okRes.body?.error || "submit failed");
assert.ok(okRes.body?.screenDecision, "200 response must include screenDecision");
assert.ok(
  ["ran", "reused", "blocked"].includes(okRes.body.screenDecision.outcome),
  `unexpected outcome ${okRes.body.screenDecision.outcome}`
);
assert.ok(okRes.body.proposition?.lastScreenDecision || okRes.body.proposition?.goNoGo?.lastScreenDecision);

console.log("PASS testHonestSubmitOutcomes (API screenDecision)");

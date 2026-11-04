/**
 * Part 132 — Submit blocks invalid inputs (422, no spend); drafts never blocked;
 * research uses corrected benchmark; AI review notes only.
 * Real Postgres when TEST_DATABASE_URL is set.
 */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

const SKIP = "SKIP testInputReviewSubmit — TEST_DATABASE_URL not set";
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
const { openSuiteDatabase } = await import("../pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-input-review-${process.pid}`);
process.env.REQUIRE_AUTH = "false";

const { createProposition, getPropositionById, deleteProposition, initDb } = await import("../../lib/db.js");
await initDb();
const {
  handlePropositionById,
  handlePropositionDraft,
} = await import("../../lib/propositionsApi.js");
const { reviewInputs, titleCaseName, researchDisplayValue } = await import("../../lib/inputReview.js");
const {
  mergeInputReview,
  parseInputReviewAiResponse,
  shouldRunInputReviewAi,
  INPUT_REVIEW_PROMPT_TOKEN,
  inputReviewSystemPrompt,
} = await import("../../lib/inputReviewAi.js");
const { INVALID_INPUTS_BLOCK_SUBMIT, AI_INPUT_REVIEW } = await import("../../lib/lockedConstants.js");

assert.equal(INVALID_INPUTS_BLOCK_SUBMIT, true);
assert.equal(AI_INPUT_REVIEW, true);
assert.match(inputReviewSystemPrompt(), new RegExp(INPUT_REVIEW_PROMPT_TOKEN));

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function mkRes() {
  return { statusCode: 0, body: null, end() {} };
}

async function readStream(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function mkReq(body, user = { id: "u1", email: "owner@cavinkare.com", team: "R&D", role: "ADMIN" }) {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    user,
  });
}

function mkDraftReq(body, user = { id: "u1", email: "owner@cavinkare.com", team: "R&D", role: "ADMIN" }) {
  return Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    method: "POST",
    headers: { "content-type": "application/json" },
    user,
  });
}

const nonsense = {
  name: "zzzz",
  category: "asdfgh",
  ideaDescription: "qwerty mash",
  submitterName: "Owner",
  submitterDepartment: "R&D",
  f1: {
    declaredAttribute: "test",
    benchmark: "asdfgh qwerty",
    declaredGap: 15,
    growthRoute: "penetration",
    growthArgument: "households growing",
  },
  f2: {
    gstRatePct: 99,
    netMarginAtScale: 150,
    mrpInr: 325,
    cogsAtScale: 900,
    grammage: "50 ml",
  },
};

const localReview = reviewInputs(nonsense);
assert.equal(localReview.blocking, true);
assert.ok(localReview.fields.length >= 5, "every problem listed at once");

const prop = await createProposition({
  createdByEmail: "owner@cavinkare.com",
  submitterDepartment: "R&D",
  submitterName: "Owner",
});
const ids = [prop.id];

try {
  // Draft with nonsense must succeed and keep typed values
  const draftRes = mkRes();
  await handlePropositionDraft(
    mkDraftReq({
      proposition: {
        ...nonsense,
        id: prop.id,
        ideaDescription: "qwerty mash kept on draft",
      },
    }),
    draftRes,
    prop.id,
    {
      readBody: async (r) => JSON.parse(await readStream(r)),
      sendJson,
      redactSecrets: (s) => s,
    }
  );
  assert.equal(draftRes.statusCode, 200, `draft must never block: ${JSON.stringify(draftRes.body)}`);
  const afterDraft = await getPropositionById(prop.id);
  assert.equal(afterDraft.f1?.benchmark, "asdfgh qwerty");
  assert.equal(Number(afterDraft.f1?.declaredGap), 15);
  assert.ok(!afterDraft.goNoGo?.classification, "draft seals no verdict");

  // Submit nonsense → 422, no verdict, typed values kept
  const submitRes = mkRes();
  await handlePropositionById(
    mkReq({
      proposition: {
        ...afterDraft,
        ...nonsense,
        submitterName: "Owner",
        submitterDepartment: "R&D",
      },
      confirmMissingSteps: true,
    }),
    submitRes,
    prop.id,
    {
      readBody: async (r) => JSON.parse(await readStream(r)),
      sendJson,
      redactSecrets: (s) => s,
    }
  );
  assert.equal(submitRes.statusCode, 422, `expected 422 got ${submitRes.statusCode}`);
  assert.ok(submitRes.body?.inputReview?.blocking);
  assert.ok(
    Array.isArray(submitRes.body?.inputReview?.fields) &&
      submitRes.body.inputReview.fields.length >= 5,
    "422 lists every problem"
  );
  const after422 = await getPropositionById(prop.id);
  assert.equal(after422.f1?.benchmark, "asdfgh qwerty", "typed value kept after 422");
  assert.ok(!after422.goNoGo?.classification, "422 seals no verdict");
  assert.ok(!after422.researchRunAt, "422 spends no research");

  // Odd capitals: suggestion + research display name
  assert.equal(titleCaseName("dOVE SCALP SERUM"), "Dove Scalp Serum");
  const oddDoc = {
    name: "Hair growth serum for Indian women",
    category: "Hair serums",
    ideaDescription: "A leave-in hair growth serum for Indian women with thinning hair.",
    submitterName: "Owner",
    submitterDepartment: "R&D",
    f1: {
      declaredAttribute: "hair growth",
      benchmark: "dOVE SCALP SERUM",
      declaredGap: 3,
      growthRoute: "penetration",
      growthArgument: "households growing in hair care",
    },
    f2: {
      gstRatePct: 18,
      netMarginAtScale: 55,
      mrpInr: 299,
      cogsAtScale: 80,
      grammage: "50 ml",
    },
  };
  const oddReview = reviewInputs(oddDoc);
  assert.equal(oddReview.blocking, false);
  const oddCap = oddReview.fields.find((f) => f.code === "BENCHMARK_ODD_CAPITALS");
  assert.ok(oddCap && /Dove Scalp Serum/i.test(oddCap.suggestion));
  assert.equal(
    researchDisplayValue("benchmark", oddDoc.f1.benchmark, oddReview),
    "Dove Scalp Serum"
  );
  assert.equal(shouldRunInputReviewAi(oddReview), true);

  // AI notes cannot remove deterministic issues or change a score
  const merged = mergeInputReview(localReview, {
    fields: [
      { field: "benchmark", status: "ok" },
      { field: "name", status: "suspect", issue: "odd name" },
    ],
  });
  assert.equal(merged.blocking, true);
  assert.ok(merged.fields.some((f) => f.status === "invalid"));
  assert.ok(merged.ai?.fields?.some((f) => f.status === "suspect"));

  const parsed = parseInputReviewAiResponse(
    JSON.stringify({
      fields: [{ field: "benchmark", status: "suspect", issue: "may not exist" }],
    })
  );
  assert.equal(parsed.fields[0].status, "suspect");

  // Gap 15, GST 99, margin 150 alone are invalid
  for (const [label, patch] of [
    ["gap15", { f1: { ...oddDoc.f1, declaredGap: 15 } }],
    ["gst99", { f2: { ...oddDoc.f2, gstRatePct: 99 } }],
    ["margin150", { f2: { ...oddDoc.f2, netMarginAtScale: 150 } }],
  ]) {
    const r = reviewInputs({ ...oddDoc, ...patch });
    assert.equal(r.blocking, true, label);
  }

  console.log("PASS owner testInputReviewSubmit");
} finally {
  for (const id of ids) {
    try {
      await deleteProposition(id);
    } catch {
      /* ignore */
    }
  }
  try {
    await suite.drop?.();
  } catch {
    /* ignore */
  }
}
process.exit(0);

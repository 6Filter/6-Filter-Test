/**
 * Part 138 F (D56) — a hand-entered Filter 4 rating is web-checked and stored as
 * researchFindings.f4.assessments.<dimension> = { status, searchUsed, raw: { rating, supported, source_url, quote }, returnedSources }.
 * Scoring: supported earns the point; contradicted is marked down; no check / failed / stale / not web-checked earns nothing.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { setCallLlmStub } from "./installCallLlmStub.mjs";

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-part138-f4verify-"));
process.env.REQUIRE_AUTH = "false";

const { createProposition, getPropositionById, initDb, updateProposition } = await import("../lib/db.js");
await initDb();

const { TECH_SHIFT_DIMENSIONS } = await import("../lib/techShiftRisk.js");
const { checkF4, ITEM_CODES } = await import("../lib/filterChecks.js");
const { creditSlots, scoreFixedSlots } = await import("../lib/scoreSlots.js");
const { hasGoCap } = await import("../lib/goNoGo.js");
const { buildF4Assessment, failedF4Assessment, reconcileF4Assessments, f4DimensionVerification } = await import(
  "../lib/f4Assessment.js"
);
const { verifyF4Dimension, verifyF4Dimensions, handlePropositionVerifyF4, mergeF4Assessments } = await import(
  "../lib/filters/reassessTechShift.js"
);
const { inputCoverage } = await import("../lib/inputCoverage.js");

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

const SOURCE = "https://part138.example/f4-evidence";
const KEYS = TECH_SHIFT_DIMENSIONS;
const FIRST = KEYS[0];
const SECOND = KEYS[1];

function handRatedF4(risk = "Low") {
  return {
    techShiftRisk: {
      dimensions: Object.fromEntries(KEYS.map((k) => [k, { risk, reason: `Person says ${risk} for ${k}` }])),
      aiSourced: false,
    },
  };
}
const okAssess = (rating, supported, extra = {}) =>
  buildF4Assessment({
    rating,
    supported,
    source_url: SOURCE,
    quote: "evidence quote",
    returnedSources: [SOURCE],
    webSearchEnabled: true,
    ...extra,
  });

const webOk = (obj, { sources = [SOURCE], webSearchRequests = 1 } = {}) => async () => ({
  text: JSON.stringify(obj),
  sources,
  webSearchRequests,
});

// ============================================================ verification path
await check("supported rating → ok assessment in the required shape, searchUsed from the request", async () => {
  let seen = null;
  const a = await verifyF4Dimension({
    dimensionKey: FIRST,
    rating: "low",
    reason: "stable format",
    ideaText: "Probiotic buttermilk",
    callWebCheck: async (opts) => {
      seen = opts;
      return { text: JSON.stringify({ supported: true, source_url: SOURCE, quote: "q", searchUsed: false }), sources: [SOURCE] };
    },
  });
  assert.equal(seen.useWebSearch, true, "the verification request must enable web search");
  assert.equal(a.status, "ok");
  assert.equal(a.searchUsed, true, "set by code, not the model (model said false)");
  assert.deepEqual(Object.keys(a.raw).sort(), ["quote", "rating", "source_url", "supported"]);
  assert.equal(a.raw.rating, "Low");
  assert.equal(a.raw.supported, true);
  assert.equal(a.raw.source_url, SOURCE);
  assert.ok(Array.isArray(a.returnedSources));
  assert.equal(f4DimensionVerification({ risk: "Low" }, a).credit, 1);
});

await check("contradicted rating → ok assessment with supported:false (marked down, not failed)", async () => {
  const a = await verifyF4Dimension({
    dimensionKey: FIRST,
    rating: "Low",
    callWebCheck: webOk({ supported: false, source_url: SOURCE, quote: "Format is already shifting" }),
  });
  assert.equal(a.status, "ok");
  assert.equal(a.raw.supported, false);
  assert.equal(f4DimensionVerification({ risk: "Low" }, a).state, "contradicted");
});

await check("failed checks are status:failed and earn nothing", async () => {
  const cases = {
    throws: async () => {
      throw new Error("provider down");
    },
    empty: async () => ({ text: "", sources: [] }),
    unreadable: async () => ({ text: "Sure, I think it is fine.", sources: [] }),
    "no boolean verdict": webOk({ reason: "dunno" }),
    "supported without a returned source": webOk({ supported: true, source_url: "https://invented.example/x" }),
  };
  for (const [name, callWebCheck] of Object.entries(cases)) {
    const a = await verifyF4Dimension({ dimensionKey: FIRST, rating: "Low", callWebCheck });
    assert.equal(a.status, "failed", name);
    assert.equal(a.searchUsed, true, `${name}: request still enabled web search`);
    assert.ok(a.error, name);
    assert.equal(f4DimensionVerification({ risk: "Low" }, a).credit, 0, name);
  }
  const noRating = await verifyF4Dimension({ dimensionKey: FIRST, rating: "", callWebCheck: webOk({ supported: true }) });
  assert.equal(noRating.status, "failed");
});

await check("verifyF4Dimensions checks only the requested, rated dimensions", async () => {
  const calls = [];
  const out = await verifyF4Dimensions({
    techShiftRisk: { dimensions: { [FIRST]: { risk: "High", reason: "r" }, [SECOND]: { risk: "", reason: "" } } },
    dimensionKeys: [FIRST, SECOND],
    callWebCheck: async (o) => {
      calls.push(o);
      return { text: JSON.stringify({ supported: true, source_url: SOURCE, quote: "q" }), sources: [SOURCE] };
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(out), [FIRST]);
  assert.equal(out[FIRST].raw.rating, "High");
});

// ===================================================================== scoring
function scoreOf(f4, assessments) {
  const findings = assessments ? { assessments } : {};
  const check = checkF4(f4, findings);
  return { check, credit: creditSlots("f4", check) };
}

await check("hand-rated Low with NO check earns nothing (seven dimensions → 0 credit)", () => {
  const { check, credit } = scoreOf(handRatedF4("Low"), null);
  assert.equal(credit, 0);
  assert.equal(check.items.filter((i) => i.status === "done").length, 0);
  assert.ok(check.items.every((i) => i.code === ITEM_CODES.F4_NOT_VERIFIED));
  assert.notEqual(check.checkLabel, "Cleared");
  assert.match(check.items[0].text, /web-checked|web check/i);
});

await check("a supported, web-checked rating earns exactly its own point", () => {
  const assessments = { [FIRST]: okAssess("Low", true), [SECOND]: okAssess("Low", true) };
  const { check, credit } = scoreOf(handRatedF4("Low"), assessments);
  assert.equal(credit, 2);
  assert.equal(check.items.filter((i) => i.status === "done").length, 2);
});

await check("all seven supported → full F4 credit and Cleared", () => {
  const assessments = Object.fromEntries(KEYS.map((k) => [k, okAssess("Low", true)]));
  const { check, credit } = scoreOf(handRatedF4("Low"), assessments);
  assert.equal(credit, 7);
  assert.equal(check.checkLabel, "Cleared");
  const scored = scoreFixedSlots({ f4: check }, ["f4"]);
  assert.equal(scored.byFilter.f4.credit, 7);
});

await check("contradicted rating is marked down: no credit, GO capped", () => {
  const assessments = Object.fromEntries(KEYS.map((k) => [k, okAssess("Low", true)]));
  assessments[FIRST] = okAssess("Low", false);
  const { check, credit } = scoreOf(handRatedF4("Low"), assessments);
  assert.equal(credit, 6);
  const marked = check.items.find((i) => i.code === ITEM_CODES.F4_CONTRADICTED);
  assert.ok(marked, "contradicted item present");
  assert.equal(marked.status, "pending");
  assert.equal(marked.level, "none");
  assert.ok(marked.reasons.includes("MARKED_DOWN"));
  assert.match(marked.text, /marked down/i);
  assert.equal(check.checkLabel, "Marked down");
  assert.equal(hasGoCap({ f4: check }), true);
});

await check("failed check earns nothing and is not a verdict", () => {
  const assessments = Object.fromEntries(KEYS.map((k) => [k, okAssess("Low", true)]));
  assessments[FIRST] = failedF4Assessment("provider down", { webSearchEnabled: true });
  const { check, credit } = scoreOf(handRatedF4("Low"), assessments);
  assert.equal(credit, 6);
  const it = check.items.find((i) => i.code === ITEM_CODES.F4_NOT_VERIFIED);
  assert.ok(it);
  assert.match(it.text, /did not complete/i);
});

await check("an ok assessment without searchUsed:true earns nothing (even a legacy ok one)", () => {
  const notWeb = { ...okAssess("Low", true), searchUsed: false };
  const legacy = { status: "ok", raw: { rating: "Low", supported: true, source_url: SOURCE, quote: "q" }, returnedSources: [SOURCE] };
  for (const a of [notWeb, legacy]) {
    const assessments = Object.fromEntries(KEYS.map((k) => [k, a]));
    assert.equal(scoreOf(handRatedF4("Low"), assessments).credit, 0);
  }
});

await check("editing the rating after a check makes the check stale (credit 0 until re-verified)", () => {
  const assessments = Object.fromEntries(KEYS.map((k) => [k, okAssess("Low", true)]));
  const f4 = handRatedF4("Low");
  f4.techShiftRisk.dimensions[FIRST] = { risk: "Medium", reason: "changed my mind" };
  const { check, credit } = scoreOf(f4, assessments);
  assert.equal(credit, 6);
  const stale = f4DimensionVerification({ risk: "Medium" }, assessments[FIRST]);
  assert.equal(stale.state, "stale");
  assert.equal(check.items.find((i) => /Functional core/i.test(i.text)).status, "pending");
});

await check("AI-run assessments (searchUsed:true) credit the AI's own ratings as before", () => {
  const assessments = Object.fromEntries(KEYS.map((k) => [k, okAssess("Low", true)]));
  assert.equal(scoreOf(handRatedF4("Low"), assessments).credit, 7);
});

await check("a fresh AI run keeps a person's verified rating it does not settle", () => {
  const prior = { [FIRST]: okAssess("High", true) };
  const fresh = { [FIRST]: okAssess("Low", true), [SECOND]: okAssess("Low", true) };
  const out = reconcileF4Assessments({
    fresh,
    prior,
    dimensions: { [FIRST]: { risk: "High" }, [SECOND]: { risk: "Low" } },
  });
  assert.equal(out[FIRST].raw.rating, "High", "verified hand rating kept");
  assert.equal(out[SECOND].raw.rating, "Low");
});

await check("coverage: a hand rating is pending until its web check settles it", () => {
  const f4 = handRatedF4("Low");
  const rows = (assessments) =>
    inputCoverage({ f4, researchFindings: assessments ? { f4: { assessments } } : {} }).filter((r) =>
      r.field.startsWith("f4.")
    );
  assert.equal(rows(null).length, 7);
  assert.ok(rows(null).every((r) => r.status === "pending"));
  const done = rows(Object.fromEntries(KEYS.map((k) => [k, okAssess("Low", true)])));
  assert.ok(done.every((r) => r.status === "assessed"));
  const failed = rows({ [FIRST]: failedF4Assessment("x", { webSearchEnabled: true }) });
  assert.equal(failed.find((r) => r.field === `f4.${FIRST}`).status, "failed");
});

// ================================================== the API path (hand edit → check → stored)
const user = { department: "R&D", role: "ADMIN" };
function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
function capture() {
  return { statusCode: 0, body: "", end(v) { this.body = v; } };
}
const redactSecrets = (m) => String(m || "");

async function newIdea() {
  const created = await createProposition({ submitterDepartment: "R&D" });
  await updateProposition(
    created.id,
    {
      name: "F4 verify idea",
      submitterName: "Tester",
      submitterDepartment: "R&D",
      category: "Buttermilk",
      ideaDescription: "A probiotic buttermilk pouch for urban households.",
      f1: { benchmark: "Amul Probiotic", declaredGap: 3, declaredAttribute: "gut health" },
      f2: { cogsAtScale: 10, netMarginAtScale: 20, grammage: "200 ml" },
      f4: handRatedF4("Low"),
    },
    { writer: "server" }
  );
  return created.id;
}

await check("handler: a hand-edited rating triggers a web-check call and stores the assessment", async () => {
  const id = await newIdea();
  const seen = [];
  setCallLlmStub(async (opts) => {
    seen.push({ label: opts.label, useWebSearch: opts.useWebSearch });
    return { text: JSON.stringify({ supported: true, source_url: SOURCE, quote: "Stable for a decade" }), sources: [SOURCE], webSearchRequests: 1 };
  });
  const before = await getPropositionById(id);
  const handEdited = JSON.parse(JSON.stringify(before.f4.techShiftRisk));
  handEdited.dimensions[FIRST] = { risk: "Medium", reason: "I rate this Medium: pouch format may shift" };

  const res = capture();
  await handlePropositionVerifyF4(
    { method: "POST", user, body: { dimensionKey: FIRST, techShiftRisk: handEdited } },
    res,
    id,
    { sendJson, redactSecrets }
  );
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(seen.length, 1, "exactly one verification call for the edited dimension");
  assert.equal(seen[0].useWebSearch, true);
  assert.equal(seen[0].label, "f4-verify");

  const saved = await getPropositionById(id);
  const a = saved.researchFindings?.f4?.assessments?.[FIRST];
  assert.ok(a, "assessment written to researchFindings.f4.assessments");
  assert.equal(a.status, "ok");
  assert.equal(a.searchUsed, true);
  assert.equal(a.raw.rating, "Medium");
  assert.equal(a.raw.supported, true);
  assert.equal(a.raw.source_url, SOURCE);
  assert.equal(a.raw.quote, "Stable for a decade");
  assert.ok(Array.isArray(a.returnedSources));
  // The typed rating is persisted with its assessment.
  assert.equal(saved.f4.techShiftRisk.dimensions[FIRST].risk, "Medium");
  // The other six were not touched or credited.
  for (const k of KEYS.slice(1)) assert.equal(saved.researchFindings.f4.assessments[k], undefined, k);
  const body = JSON.parse(res.body);
  assert.ok(body.advisoryChecks?.f4, "returns refreshed checks");
});

await check("handler: contradicted verdict is stored and marked down by the F4 check", async () => {
  const id = await newIdea();
  setCallLlmStub(async () => ({
    text: JSON.stringify({ supported: false, source_url: SOURCE, quote: "Format already displaced" }),
    sources: [SOURCE],
    webSearchRequests: 1,
  }));
  const before = await getPropositionById(id);
  const res = capture();
  await handlePropositionVerifyF4(
    { method: "POST", user, body: { dimensionKey: SECOND, techShiftRisk: before.f4.techShiftRisk } },
    res,
    id,
    { sendJson, redactSecrets }
  );
  assert.equal(res.statusCode, 200, res.body);
  const saved = await getPropositionById(id);
  assert.equal(saved.researchFindings.f4.assessments[SECOND].raw.supported, false);
  const f4Check = JSON.parse(res.body).advisoryChecks.f4;
  assert.ok(f4Check.items.some((i) => i.code === ITEM_CODES.F4_CONTRADICTED));
});

await check("handler: a failed web check is stored as failed (earns nothing)", async () => {
  const id = await newIdea();
  setCallLlmStub(async () => {
    throw new Error("search backend unavailable");
  });
  const before = await getPropositionById(id);
  const res = capture();
  await handlePropositionVerifyF4(
    { method: "POST", user, body: { dimensionKey: FIRST, techShiftRisk: before.f4.techShiftRisk } },
    res,
    id,
    { sendJson, redactSecrets }
  );
  assert.equal(res.statusCode, 200, res.body);
  const saved = await getPropositionById(id);
  const a = saved.researchFindings.f4.assessments[FIRST];
  assert.equal(a.status, "failed");
  assert.match(a.error, /unavailable/);
  const f4Check = JSON.parse(res.body).advisoryChecks.f4;
  assert.equal(creditSlots("f4", f4Check), 0);
});

await check("handler: rejects a missing dimension and non-POST", async () => {
  const id = await newIdea();
  const res = capture();
  await handlePropositionVerifyF4({ method: "POST", user, body: {} }, res, id, { sendJson, redactSecrets });
  assert.equal(res.statusCode, 400);
  const get = capture();
  await handlePropositionVerifyF4({ method: "GET", user }, get, id, { sendJson, redactSecrets });
  assert.equal(get.statusCode, 405);
});

await check("mergeF4Assessments keeps other findings and other dimensions", () => {
  const base = { f1: { x: 1 }, f4: { overallRisk: "Low", assessments: { [SECOND]: okAssess("Low", true) } } };
  const next = mergeF4Assessments(base, { [FIRST]: okAssess("High", true) });
  assert.equal(next.f1.x, 1);
  assert.equal(next.f4.overallRisk, "Low");
  assert.deepEqual(Object.keys(next.f4.assessments).sort(), [FIRST, SECOND].sort());
  assert.equal(base.f4.assessments[FIRST], undefined, "input not mutated");
});

// ================================================================ wiring (static)
await check("form, router and api route are wired to verify-f4", () => {
  const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
  assert.match(form, /\/verify-f4/);
  assert.match(form, /onVerifyDimension/);
  assert.match(form, /handleVerifyF4Dimension/);
  const router = readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8");
  assert.match(router, /verify-f4/);
  assert.match(router, /handlePropositionVerifyF4/);
  const api = readFileSync(new URL("../api/propositions/[id]/verify-f4.js", import.meta.url), "utf8");
  assert.match(api, /handlePropositionVerifyF4/);
});

console.log(`PASS testPart138F4HandVerify (${checks} checks)`);
process.exit(0);

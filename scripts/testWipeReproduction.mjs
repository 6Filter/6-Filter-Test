/**
 * Reproduce the Sep–Oct verdict-save wipe on scratch Postgres.
 * c15bdf7 is expected to blank filters on a goNoGo-only save.
 * Any later commit is expected to keep name, F1, F2, and the research F3/F4.
 * Skips when TEST_DATABASE_URL is unset so the file-store suite can still pass.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("wipe reproduction skipped — TEST_DATABASE_URL is not set");
  process.exit(0);
}

function hostAllowed(raw) {
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch {
    return false;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  return false;
}
if (!hostAllowed(testUrl) || /render\.com|neon\.tech|supabase\.co/i.test(testUrl)) {
  console.error("Refusing TEST_DATABASE_URL: host is not a private scratch database.");
  process.exit(1);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
if (!String(process.env.REQUIRE_AUTH || "").trim()) process.env.REQUIRE_AUTH = "false";
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-wipe-${process.pid}`);
for (const key of Object.keys(process.env)) {
  if (key === "ANTHROPIC_API_KEY" || key.startsWith("DEPT_API_KEY")) delete process.env[key];
}
process.env.ANTHROPIC_API_KEY = `sk-${"ant"}-stub-local-only`;

const commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const oldWipe = commit.startsWith("c15bdf7");

const { initDb, createProposition, getPropositionById, updateProposition, saveResearchCache, closeDatabase } = await import("../lib/db.js");
const { handlePropositionById, handlePropositionDraft } = await import("../lib/propositionsApi.js");
const { emptyPropositionDoc } = await import("../lib/propositionFields.js");
const { researchHashFor } = await import("../lib/researchCache.js");

await initDb();

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).includes("api.anthropic.com")) {
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: "{\"status\":\"stub\"}" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(url, options);
};

// Must match the idea team under PLATFORM_TEAM_LOCK (R&D), or Submit returns 404.
const user = { department: "R&D", role: "NPD" };

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}

function present(value) {
  if (value == null || value === "") return false;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return String(value).trim().length > 0;
}

function picture(doc) {
  const filters = {};
  for (const key of ["f1", "f2", "f3", "f4", "f5", "f6"]) {
    const column = doc?.[key] && typeof doc[key] === "object" ? doc[key] : {};
    filters[key] = Object.keys(column).filter((name) => present(column[name]));
  }
  return {
    name: String(doc?.name || "").trim(),
    category: String(doc?.category || "").trim(),
    description: String(doc?.ideaDescription || "").trim(),
    f1: String(doc?.f1?.declaredAttribute || "").trim(),
    f2: doc?.f2?.cogsAtScale ?? "",
    f3: doc?.f3?.marginElasticity?.minMrpInr ?? "",
    f4: doc?.f4?.techShiftRisk?.dimensions?.functionalCoreStability?.risk || "",
    filters,
  };
}

function typedDoc(id, label) {
  const doc = emptyPropositionDoc(id);
  doc.submitterName = "Wipe Tester";
  doc.submitterDepartment = "R&D";
  doc.name = `Wipe ${label}`;
  doc.category = "Hair oils";
  doc.division = "Personal Care";
  doc.ideaDescription = `Wipe fixture ${label}`;
  doc.f1 = {
    ...doc.f1,
    declaredAttribute: "softness",
    benchmark: "Brand Soft 100ml",
    declaredGap: 3,
    gapDerivation: "lasts longer than the benchmark",
    parityExceptions: "none material",
    growthRoute: "penetration",
    growthArgument: "category still adding households",
  };
  doc.f2 = {
    ...doc.f2,
    cogsAtScale: 40,
    netMarginAtScale: 55,
    gstRatePct: 18,
    grammage: "100 ml",
  };
  return doc;
}

const cacheBundle = {
  division: "Personal Care",
  providerUsed: "claude",
  sources: [],
  notCovered: [],
  suggestions: {
    f2: { cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18, grammage: "100ml" },
    f3: { marginElasticity: { minMrpInr: 40, maxMrpInr: 90, minMarginPct: 10, maxMarginPct: 20 } },
    f4: {
      techShiftRisk: {
        dimensions: { functionalCoreStability: { risk: "Low", reason: "stable" } },
      },
    },
  },
  researchFindings: {
    f1: { researchFailed: false, benchmarkEvidence: "stub" },
    f2: { researchFailed: false, costEstimate: { estimatedCogsPerUnitInr: 40, grammage: "100ml" } },
    f3: { researchFailed: false, marginElasticityFound: true },
    f4: { researchFailed: false, techShiftFound: true, overallRisk: "Low" },
    f5: { researchFailed: false, sizingFactorsFound: false },
  },
};

async function submit(id, doc) {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionById(
    { method: "PUT", user, headers: {} },
    res,
    id,
    { readBody: async () => ({ proposition: doc }), sendJson, redactSecrets: (message) => message }
  );
  assert.equal(res.statusCode, 200, `submit ${id} status ${res.statusCode} ${res.body?.error || ""}`);
  return res.body?.proposition || null;
}

async function draft(id, doc) {
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionDraft(
    { method: "POST", user, headers: {} },
    res,
    id,
    { readBody: async () => ({ proposition: doc }), sendJson, redactSecrets: (message) => message }
  );
  assert.equal(res.statusCode, 200, `draft ${id} status ${res.statusCode} ${res.body?.error || ""}`);
}

function keptResearch(shot) {
  return Boolean(shot.name) && shot.f1 === "softness" && Number(shot.f2) === 40 && Number(shot.f3) === 40 && shot.f4 === "Low";
}

function partial(shot) {
  return Boolean(shot.name) && shot.f1 === "softness" && Number(shot.f2) === 40 && shot.f3 === "" && shot.f4 === "";
}

function fullyEmpty(shot) {
  return !shot.name && !shot.category && !shot.description && !shot.f1 && shot.f2 === "" && shot.f3 === "" && shot.f4 === "";
}

console.log(`wipe reproduction commit=${commit} expect=${oldWipe ? "c15bdf7 wipe" : "keep"}`);

const results = [];
for (const kind of ["api-only", "later-save", "browser"]) {
  const row = await createProposition({ submitterDepartment: "R&D" });
  const doc = typedDoc(row.id, kind);
  await updateProposition(row.id, doc, { handler: "wipe-seed", allowFilterReset: true });
  await saveResearchCache(researchHashFor(doc), cacheBundle);
  const before = picture(await getPropositionById(row.id));
  const response = await submit(row.id, doc);
  const held = picture(response);
  const afterSubmit = picture(await getPropositionById(row.id));
  if (kind === "later-save") await draft(row.id, doc);
  if (kind === "browser") await draft(row.id, response);
  const after = picture(await getPropositionById(row.id));
  console.log(`${kind} before ${JSON.stringify(before)}`);
  console.log(`${kind} response ${JSON.stringify(held)}`);
  console.log(`${kind} after-submit ${JSON.stringify(afterSubmit)}`);
  console.log(`${kind} after ${JSON.stringify(after)}`);
  results.push({ kind, before, afterSubmit, after, held });
}

const [apiOnly, later, browser] = results;
if (oldWipe) {
  assert.equal(fullyEmpty(apiOnly.after), true, "api-only did not end fully empty — withdraw the wipe explanation");
  assert.equal(partial(later.after), true, "later typed save did not keep only F1 and F2 — withdraw the wipe explanation");
  assert.equal(keptResearch(browser.after), true, "browser memory save did not restore research filters");
} else {
  for (const row of results) {
    assert.equal(keptResearch(row.after), true, `${row.kind} lost a field on the current tree`);
  }
}
console.log(oldWipe ? "PASS wipe reproduction on c15bdf7" : "PASS wipe reproduction kept on current tree");
await closeDatabase();
await suite.drop();
process.exit(0);

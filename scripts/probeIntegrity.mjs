/**
 * Daily probe check. Submits one fixed idea and reads it back.
 * Identical inputs are a research-cache hit after the first day.
 * Reuse PRIMUS_PROBE_ID so the job does not create a new Log row each morning.
 *
 * Header X-Primus-Probe: 1 marks the row. The Log hides it until "Show probes".
 *
 * Scratch proof (no live call):
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres node scripts/probeIntegrity.mjs
 *
 * Daily automation line:
 *   node scripts/probeIntegrity.mjs
 * with PRIMUS_BASE_URL, PRIMUS_PROBE_DEPARTMENT, PRIMUS_PROBE_PASSWORD, and PRIMUS_PROBE_ID set.
 * The process prints `PROBE INTEGRITY OK` or exits 1.
 */
import assert from "node:assert/strict";

export const PROBE_IDEA = {
  submitterName: "Live Check",
  submitterDepartment: "NPD",
  name: "Probe fixed idea",
  category: "Hair oils",
  division: "Personal Care",
  ideaDescription: "Fixed daily probe. Do not change this text.",
  f1: { declaredAttribute: "softness", benchmark: "Brand", declaredGap: 3 },
  f2: { cogsAtScale: 40, netMarginAtScale: 55, gstRatePct: 18 },
};

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
const baseUrl = String(process.env.PRIMUS_BASE_URL || "").trim();

function populatedFilters(doc) {
  const missing = [];
  if (!String(doc?.name || "").trim()) missing.push("name");
  if (!String(doc?.category || "").trim()) missing.push("category");
  if (!String(doc?.ideaDescription || "").trim()) missing.push("description");
  for (const key of ["f1", "f2", "f3", "f4"]) {
    const column = doc?.[key] && typeof doc[key] === "object" ? doc[key] : {};
    const content = Object.keys(column).filter((name) => {
      if (name === "forumVerdict" || name === "verdictNote") return false;
      const value = column[name];
      return value != null && value !== "" && !(typeof value === "object" && !Object.keys(value).length);
    });
    if (!content.length) missing.push(key);
  }
  return missing;
}

if (baseUrl) {
  if (/onrender\.com/i.test(baseUrl) && process.env.PRIMUS_PROBE_ALLOW_REMOTE !== "1") {
    console.error("Refusing the live host. Set PRIMUS_PROBE_ALLOW_REMOTE=1 on the daily job only.");
    process.exit(1);
  }
  const department = process.env.PRIMUS_PROBE_DEPARTMENT || "NPD";
  const password = process.env.PRIMUS_PROBE_PASSWORD || "";
  if (!password) {
    console.error("PRIMUS_PROBE_PASSWORD is not set.");
    process.exit(1);
  }
  const headers = { "Content-Type": "application/json", "X-Primus-Probe": "1" };
  const unlock = await fetch(`${baseUrl}/api/department-auth/unlock`, {
    method: "POST",
    headers,
    body: JSON.stringify({ department, password }),
  });
  const unlockBody = await unlock.json().catch(() => ({}));
  if (!unlock.ok) {
    console.error(unlockBody.error || "Could not unlock.");
    process.exit(1);
  }
  const cookie = String(unlock.headers.get("set-cookie") || "").split(";")[0];
  const auth = { ...headers, cookie };
  let id = String(process.env.PRIMUS_PROBE_ID || "").trim();
  if (!id) {
    const created = await fetch(`${baseUrl}/api/propositions`, { method: "POST", headers: auth });
    const createdBody = await created.json().catch(() => ({}));
    id = createdBody.id || createdBody.proposition?.id || "";
    if (!created.ok || !id) {
      console.error("Could not create the probe row.");
      process.exit(1);
    }
    console.log(`Created probe id ${id}. Set PRIMUS_PROBE_ID to this value so tomorrow reuses it.`);
  }
  const saved = await fetch(`${baseUrl}/api/propositions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ proposition: { ...PROBE_IDEA, id } }),
  });
  const savedBody = await saved.json().catch(() => ({}));
  if (!saved.ok) {
    console.error(savedBody.error || "Probe submit failed.");
    process.exit(1);
  }
  const read = await fetch(`${baseUrl}/api/propositions/${encodeURIComponent(id)}`, { headers: auth });
  const doc = await read.json().catch(() => ({}));
  const missing = populatedFilters(doc.proposition || doc);
  if (missing.length) {
    console.error(`PROBE INTEGRITY FAIL missing=${missing.join(",")}`);
    process.exit(1);
  }
  console.log("PROBE INTEGRITY OK");
  process.exit(0);
}

if (!testUrl) {
  console.log("probe integrity skipped — set TEST_DATABASE_URL or PRIMUS_BASE_URL");
  process.exit(0);
}

const { initDb, createProposition, getPropositionById, saveResearchCache } = await import("../lib/db.js");
const { handlePropositionById } = await import("../lib/propositionsApi.js");
const { researchHashFor } = await import("../lib/researchCache.js");
const { emptyPropositionDoc } = await import("../lib/propositionFields.js");

delete process.env.DATABASE_URL;
process.env.DATABASE_URL = testUrl;
process.env.ANTHROPIC_API_KEY = `sk-${"ant"}-stub-local-only`;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (String(url).includes("api.anthropic.com")) {
    return new Response(
      JSON.stringify({
        content: [{ type: "text", text: "{\"status\":\"stub\"}" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(url, options);
};

await initDb();
const user = { department: "NPD", role: "NPD" };
const created = await createProposition({ submitterDepartment: "NPD", probe: true });
const doc = { ...emptyPropositionDoc(created.id), ...PROBE_IDEA, id: created.id, f1: { ...emptyPropositionDoc(created.id).f1, ...PROBE_IDEA.f1 }, f2: { ...emptyPropositionDoc(created.id).f2, ...PROBE_IDEA.f2 } };
await saveResearchCache(researchHashFor(doc), {
  division: "Personal Care",
  providerUsed: "claude",
  suggestions: {
    f2: { cogsAtScale: 40, grammage: "100ml" },
    f3: { marginElasticity: { minMrpInr: 40, maxMrpInr: 90 } },
    f4: { techShiftRisk: { dimensions: { functionalCoreStability: { risk: "Low", reason: "stable" } } } },
  },
  researchFindings: {
    f2: { researchFailed: false, costEstimate: { estimatedCogsPerUnitInr: 40, grammage: "100ml" } },
    f3: { researchFailed: false, marginElasticityFound: true },
    f4: { researchFailed: false, techShiftFound: true, overallRisk: "Low" },
  },
});
const res = { statusCode: 0, body: null, end() {} };
await handlePropositionById(
  { method: "PUT", user, headers: { "x-primus-probe": "1" } },
  res,
  created.id,
  {
    readBody: async () => ({ proposition: doc }),
    sendJson(target, status, body) {
      target.statusCode = status;
      target.body = body;
    },
    redactSecrets: (message) => message,
  }
);
assert.equal(res.statusCode, 200, res.body?.error || "submit failed");
const stored = await getPropositionById(created.id);
const missing = populatedFilters(stored);
assert.equal(stored.probe, true);
assert.deepEqual(missing, [], `missing ${missing.join(",")}`);
console.log("PROBE INTEGRITY OK");
process.exit(0);

/**
 * Responses typed inside techShiftRisk survive a server replacement and a stubbed retry.
 * Uses the restored backup and TEST_DATABASE_URL. Never prints the response text.
 */
import assert from "node:assert/strict";
import { createReadStream, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
if (!testUrl) {
  console.log("PASS Part 111 mitigation retry skipped — TEST_DATABASE_URL is not set");
  process.exit(0);
}

delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
const { openSuiteDatabase } = await import("./pgSuiteDb.mjs");
const suite = await openSuiteDatabase(testUrl);
process.env.DATABASE_URL = suite.url;
process.env.PRIMUS_SCHEMA = suite.name;
process.env.PRIMUS_DATA_DIR = path.join(os.tmpdir(), `primus-f4-${process.pid}`);

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const backup = readdirSync(path.join(root, "data", "backups"))
  .filter((name) => /^\d{8}T\d{6}Z$/.test(name))
  .sort()
  .at(-1);

function responsesOf(f4) {
  const dims = f4?.techShiftRisk?.dimensions || {};
  const out = {};
  for (const [key, cell] of Object.entries(dims)) {
    const text = String(cell?.userResponse || "").trim();
    if (text) out[key] = text;
  }
  return out;
}

const saved = [];
const file = path.join(root, "data", "backups", backup, "propositions.jsonl");
const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  const f4 = typeof row.f4_json === "string" ? JSON.parse(row.f4_json) : row.f4_json || {};
  const responses = responsesOf(f4);
  if (Object.keys(responses).length) saved.push({ f4, responses, department: row.submitter_department || "NPD" });
}
assert.ok(saved.length >= 1, "restored copy has no techShiftRisk responses to protect");

const { initDb, createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionRetryStep } = await import("../lib/propositionsApi.js");
await initDb();

for (const key of Object.keys(process.env)) {
  if (key === "ANTHROPIC_API_KEY" || key.startsWith("DEPT_API_KEY")) delete process.env[key];
}
process.env.ANTHROPIC_API_KEY = `sk-${"ant"}-stub-local-only`;
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

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}

try {
  for (const source of saved) {
    const row = await createProposition({ submitterDepartment: source.department });
    await updateProposition(
      row.id,
      {
        name: "Mitigation keep",
        category: "Hair oils",
        ideaDescription: `Mitigation row ${row.id}`,
        f4: source.f4,
      },
      { handler: "seed", writer: "server", allowFilterReset: true }
    );
    const freshRisk = {
      dimensions: { functionalCoreStability: { risk: "Low", reason: "replaced" } },
      overallRisk: "Low",
    };
    await updateProposition(row.id, { f4: { techShiftRisk: freshRisk } }, { handler: "replace-f4", writer: "server" });
    const afterReplace = await getPropositionById(row.id);
    assert.deepEqual(afterReplace.f4.f4MitigationResponses, source.responses);

    const user = { department: source.department, role: source.department };
    for (const body of [{ filter: "f4" }, { missing: true }]) {
      const res = { statusCode: 0, body: null, end() {} };
      await handlePropositionRetryStep(
        { method: "POST", user },
        res,
        row.id,
        { readBody: async () => body, sendJson, redactSecrets: (message) => String(message || "") }
      );
      const after = await getPropositionById(row.id);
      const available = { ...(responsesOf(after.f4)), ...(after.f4.f4MitigationResponses || {}) };
      for (const [key, text] of Object.entries(source.responses)) {
        assert.equal(available[key], text);
      }
    }
  }
} finally {
  globalThis.fetch = realFetch;
}

console.log(`PASS Part 111 mitigation retry rows=${saved.length}`);
const { closeDatabase } = await import("../lib/db.js");
await closeDatabase();
await suite.drop();
process.exit(0);

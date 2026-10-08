/**
 * Replay stored propositions through the production scorers.
 * Read-only. No model calls. Output stays under data/replay/.
 *
 * node scripts/replayScoring.mjs --out data/replay/new.json
 */
process.env.PRIMUS_REPLAY = "1";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input || "");
  if (url.includes("anthropic.com")) throw new Error("REPLAY_MAY_NOT_CALL_LLM");
  return originalFetch(input, init);
};

import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnv(".env.local");

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : "";
}

function argOut() {
  return argValue("--out") || path.join("data", "replay", "replay.json");
}

const storeLocal = argValue("--store") === "local";
if (storeLocal) delete process.env.DATABASE_URL;

const { initDb, query, listPropositions, getPropositionById, isUsingPostgres } = await import("../lib/db.js");
const { scoreReplayRecord } = await import("../lib/replayScore.js");
const { callLlm } = await import("../lib/callLlm.js");

await initDb();
if (storeLocal) {
  if (isUsingPostgres()) throw new Error("Local replay connected to Postgres.");
} else {
  try {
    await query("CREATE TEMP TABLE primus_replay_probe (id int)");
    throw new Error("Replay connection accepted a write.");
  } catch (e) {
    if (e.message === "Replay connection accepted a write.") throw e;
    if (!/read-only|read only/i.test(String(e.message || ""))) throw e;
  }
}
try {
  await callLlm({ userText: "replay", system: "replay" });
  throw new Error("Replay was able to call the model.");
} catch (e) {
  if (!/REPLAY_MAY_NOT_CALL_LLM/.test(String(e.message || ""))) throw e;
}

const rows = await listPropositions(5000);
const records = [];
for (const row of rows) {
  const proposition = await getPropositionById(row.id);
  if (!proposition) continue;
  records.push(await scoreReplayRecord(proposition));
}

records.sort((a, b) => String(a.id).localeCompare(String(b.id)));
const out = path.resolve(argOut());
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(records, null, 2));
console.log(`[primus/replay] propositions=${records.length} out=${out}`);

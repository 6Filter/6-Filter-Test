import assert from "node:assert/strict";
import { explainReplayChange } from "./diffReplay.mjs";

process.env.PRIMUS_REPLAY = "1";

const { callLlm } = await import("../lib/callLlm.js");
await assert.rejects(() => callLlm({ userText: "x", system: "y" }), /REPLAY_MAY_NOT_CALL_LLM/);

async function proveWriteRejected(query) {
  try {
    await query("CREATE TEMP TABLE primus_replay_probe (id int)");
  } catch (e) {
    if (/read-only|read only/i.test(String(e.message || ""))) return;
    throw e;
  }
  throw new Error("Replay connection accepted a write.");
}

await proveWriteRejected(async () => {
  throw new Error("cannot execute CREATE TABLE in a read-only transaction");
});
await assert.rejects(
  () => proveWriteRejected(async () => ({ rows: [] })),
  /accepted a write/
);

const base = {
  id: "a",
  classification: "GO",
  pct: 90,
  floorFailure: false,
  labels: { f1: "Cleared", f2: "Cleared", f3: "Cleared", f4: "Not yet run" },
  items: { f1: [2, 2], f2: [2, 2], f3: [1, 1], f4: [0, 0] },
  leads: { f4: "Not yet run" },
  derived: { mrp: 10, f3Min: 9, f3Max: 11, sizeTier: "100g" },
};
assert.equal(explainReplayChange(base, { ...base, classification: "WATCH" }).ok, true);
const retry = {
  ...base,
  classification: "WATCH",
  labels: { ...base.labels, f4: "Evidence missing" },
  items: { ...base.items, f4: [0, 1] },
  leads: { f4: "Research failed — retry — structural obsolescence was not completed" },
};
assert.equal(explainReplayChange(base, retry).ok, true);
const scored = {
  ...base,
  labels: { f1: "Cleared", f2: "Cleared", f3: "Cleared", f4: "Cleared" },
  items: { f1: [2, 2], f2: [2, 2], f3: [1, 1], f4: [3, 3] },
};
assert.equal(explainReplayChange(scored, { ...scored, pct: 80 }).ok, false);

console.log("testReplayGuard ok");

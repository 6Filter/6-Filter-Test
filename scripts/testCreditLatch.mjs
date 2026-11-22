/**
 * Credit latch: per billing key, 60s TTL, in memory only. Fake Anthropic, no real key.
 * Sets the env it needs and restores the caller's values so a polluted shell cannot fail it.
 */
const savedEnv = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CREDIT_LATCH_TTL_MS: process.env.CREDIT_LATCH_TTL_MS,
  ANTHROPIC_MAX_CONCURRENT: process.env.ANTHROPIC_MAX_CONCURRENT,
  DATABASE_URL: process.env.DATABASE_URL,
  PRIMUS_SCHEMA: process.env.PRIMUS_SCHEMA,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
};
function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
process.env.ANTHROPIC_API_KEY = "sk-ant-api03-LATCHKEYAAAAAAAAAAAAAAAA";
process.env.CREDIT_LATCH_TTL_MS = "80";
delete process.env.ANTHROPIC_MAX_CONCURRENT;
delete process.env.DATABASE_URL;
delete process.env.PRIMUS_SCHEMA;
delete process.env.TEST_DATABASE_URL;
process.on("exit", restoreEnv);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clearCreditLatch,
  creditLatchId,
  DEFAULT_CREDIT_LATCH_TTL_MS,
  isCreditLatched,
  noteCreditExhausted,
  resetCreditExhaustedForTests,
} from "../lib/creditFailureCopy.js";

const KEY_A = "sk-ant-api03-KEYA-not-a-real-secret";
const KEY_B = "sk-ant-api03-KEYB-not-a-real-secret";
resetCreditExhaustedForTests();
assert.equal(DEFAULT_CREDIT_LATCH_TTL_MS, 60_000);
assert.notEqual(creditLatchId(KEY_A), creditLatchId(KEY_B));
noteCreditExhausted(KEY_A);
assert.equal(isCreditLatched(KEY_A), true);
assert.equal(isCreditLatched(KEY_B), false, "one key must not latch another");
clearCreditLatch(KEY_A);
assert.equal(isCreditLatched(KEY_A), false);

const OK = () =>
  new Response(
    JSON.stringify({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
      stop_reason: "end_turn",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
const ERR = (status, body) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let plan = [];
let fetches = 0;
globalThis.fetch = async () => {
  fetches += 1;
  const step = plan.length ? plan.shift() : "ok";
  if (step === "ok") return OK();
  if (typeof step === "function") return step();
  return ERR(step.status, step.body);
};

resetCreditExhaustedForTests();
const { callAnthropic } = await import(new URL("../lib/callAnthropic.js", import.meta.url).href);

async function call(label) {
  try {
    const r = await callAnthropic({
      userText: "latch " + label,
      system: "be brief",
      label,
      tier: "light",
    });
    return { ok: true, r };
  } catch (e) {
    return { ok: false, e };
  }
}

let failed = 0;
const check = (id, n, ok, d = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${n}${d ? "  [" + d + "]" : ""}`);
  if (!ok) failed += 1;
};

plan = [
  {
    status: 402,
    body: { type: "error", error: { type: "billing_error", message: "Payment required. credit balance too low" } },
  },
];
fetches = 0;
const first = await call("c1");
check(
  "L1",
  "a 402 latches: the call fails with BILLING_CREDIT_EXHAUSTED",
  !first.ok && first.e?.code === "BILLING_CREDIT_EXHAUSTED" && fetches === 1,
  `fetches=${fetches} code=${first.e?.code}`
);
fetches = 0;
plan = [{ status: 200 }];
const second = await call("c2");
check(
  "L2",
  "later calls make zero network requests while the latch is up",
  !second.ok && second.e?.code === "BILLING_CREDIT_EXHAUSTED" && fetches === 0,
  `fetches=${fetches}`
);

await new Promise((r) => setTimeout(r, 100));
fetches = 0;
plan = ["ok"];
const afterTtl = await call("c3");
check(
  "L3",
  "after the 60s (here 80ms) TTL the next call goes to the network and succeeds",
  afterTtl.ok && afterTtl.r?.text === "ok" && fetches === 1,
  `fetches=${fetches} ok=${afterTtl.ok}`
);

resetCreditExhaustedForTests();
fetches = 0;
plan = [{ status: 429, body: { type: "error", error: { message: "rate limited, try again later" } } }];
const r429 = await call("c4");
check(
  "L4",
  "a 429 that is not about credit is retried (up to the attempts limit) and never latches",
  r429.ok &&
    r429.e?.code !== "BILLING_CREDIT_EXHAUSTED" &&
    fetches >= 2 &&
    fetches <= 4 &&
    !isCreditLatched(process.env.ANTHROPIC_API_KEY),
  `fetches=${fetches} ok=${r429.ok} code=${r429.e?.code}`
);
fetches = 0;
plan = ["ok"];
const after429 = await call("c5");
check("L4b", "the next call after a plain 429 still hits the network", after429.ok && fetches === 1, `fetches=${fetches}`);

resetCreditExhaustedForTests();
fetches = 0;
plan = [{ status: 401, body: { type: "error", error: { message: "invalid x-api-key" } } }];
const r401 = await call("c6");
check(
  "L5",
  "a 401 that is not about credit does not latch",
  !r401.ok && r401.e?.code !== "BILLING_CREDIT_EXHAUSTED",
  `code=${r401.e?.code}`
);
fetches = 0;
plan = ["ok"];
const after401 = await call("c7");
check("L5b", "the next call after a plain 401 still hits the network", after401.ok && fetches === 1, `fetches=${fetches}`);

const copySrc = readFileSync(new URL("../lib/creditFailureCopy.js", import.meta.url), "utf8");
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
check(
  "L6",
  "the latch is in-process only: no database write, nothing stored on the idea",
  !/query\(|initDb|UPDATE propositions/i.test(copySrc) &&
    !/creditLatch|credit_exhausted|creditExhaustedAt/.test(apiSrc.split("applyResearchFindings")[1] || apiSrc),
  "creditFailureCopy has no DB; findings stamp is researchFailed only"
);

console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nPASS testCreditLatch");
restoreEnv();
process.exitCode = failed ? 1 : 0;

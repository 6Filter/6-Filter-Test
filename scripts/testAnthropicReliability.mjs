/**
 * Anthropic transport: retry, timeout, concurrency, single billing. Fake server only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESEARCH_FAILED_COPY } from "../lib/researchFailureCopy.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PRIMUS_DATA_DIR = path.join(tmpdir(), `primus-reliab-${process.pid}`);
process.env.REQUIRE_AUTH = "false";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-reliability-local-only";
process.env.ANTHROPIC_MAX_CONCURRENT = "4";
process.env.ANTHROPIC_TIMEOUT_MS = "80";
process.env.ANTHROPIC_WEBSEARCH_TIMEOUT_MS = "80";
process.env.ANTHROPIC_QUEUE_WAIT_MS = "5000";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const logs = [];
const origLog = console.log;
const origErr = console.error;
console.log = (...args) => {
  logs.push(args.map(String).join(" "));
  origLog(...args);
};
console.error = (...args) => {
  logs.push(args.map(String).join(" "));
  origErr(...args);
};

function okBody() {
  return {
    content: [{ type: "text", text: "ok" }],
    usage: { input_tokens: 11, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    stop_reason: "end_turn",
  };
}

function jsonRes(status, body, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const realFetch = globalThis.fetch;
let handler = null;
let fetchCalls = 0;
let inFlight = 0;
let maxInFlight = 0;
let usageLogs = 0;

function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason || new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

globalThis.fetch = async (url, options = {}) => {
  fetchCalls += 1;
  const href = String(url);
  if (!href.includes("api.anthropic.com")) return realFetch(url, options);
  inFlight += 1;
  if (inFlight > maxInFlight) maxInFlight = inFlight;
  try {
    return await handler(href, options);
  } finally {
    inFlight -= 1;
  }
};

const {
  callAnthropic,
  resetAnthropicConcurrencyGateForTests,
} = await import("../lib/callAnthropic.js");

async function run(label, fn) {
  resetAnthropicConcurrencyGateForTests();
  fetchCalls = 0;
  maxInFlight = 0;
  usageLogs = 0;
  logs.length = 0;
  await fn();
  const joined = logs.join("\n");
  assert.doesNotMatch(joined, /sk-ant-[A-Za-z0-9\-_]{8,}/, `${label}: secret leaked`);
  origLog(`ok   ${label}`);
}

function countCacheLogs() {
  return logs.filter((l) => l.includes("[primus/prompt-cache]")).length;
}

await run("429 then 200 succeeds", async () => {
  let n = 0;
  handler = async () => {
    n += 1;
    if (n === 1) return jsonRes(429, { error: { type: "rate_limit_error", message: "slow down" } });
    return jsonRes(200, okBody());
  };
  const out = await callAnthropic({ userText: "ping", label: "t-429" });
  assert.equal(out.text, "ok");
  assert.equal(fetchCalls, 2);
  assert.equal(countCacheLogs(), 1);
});

await run("529 twice then 200 succeeds", async () => {
  let n = 0;
  handler = async () => {
    n += 1;
    if (n <= 2) return jsonRes(529, { error: { type: "overloaded_error", message: "overloaded" } });
    return jsonRes(200, okBody());
  };
  const out = await callAnthropic({ userText: "ping", label: "t-529" });
  assert.equal(out.text, "ok");
  assert.equal(fetchCalls, 3);
  assert.equal(countCacheLogs(), 1);
});

await run("timeout then 200 succeeds", async () => {
  let n = 0;
  handler = async (_url, options) => {
    n += 1;
    if (n === 1) {
      await abortableDelay(400, options?.signal);
      return jsonRes(200, okBody());
    }
    return jsonRes(200, okBody());
  };
  const out = await callAnthropic({ userText: "ping", label: "t-timeout" });
  assert.equal(out.text, "ok");
  assert.ok(fetchCalls >= 2);
  assert.equal(countCacheLogs(), 1);
});

await run("persistent 429 fails with existing message", async () => {
  handler = async () => jsonRes(429, { error: { type: "rate_limit_error", message: "slow down" } });
  await assert.rejects(
    () => callAnthropic({ userText: "ping", label: "t-429-fail" }),
    (err) => {
      assert.match(String(err.message), /Claude API failed \(429\)/);
      assert.equal(err.status, 429);
      return true;
    }
  );
  assert.equal(fetchCalls, 4);
  assert.equal(countCacheLogs(), 0);
});

await run("400 is not retried", async () => {
  handler = async () => jsonRes(400, { error: { type: "invalid_request_error", message: "bad" } });
  await assert.rejects(
    () => callAnthropic({ userText: "ping", label: "t-400" }),
    (err) => /Claude API failed \(400\)/.test(String(err.message))
  );
  assert.equal(fetchCalls, 1);
});

await run("401 is not retried", async () => {
  handler = async () => jsonRes(401, { error: { type: "authentication_error", message: "no" } });
  await assert.rejects(
    () => callAnthropic({ userText: "ping", label: "t-401" }),
    (err) => /Claude API failed \(401\)/.test(String(err.message))
  );
  assert.equal(fetchCalls, 1);
});

await run("credit error is not retried", async () => {
  handler = async () =>
    jsonRes(400, { error: { type: "invalid_request_error", message: "Your credit balance is too low" } });
  await assert.rejects(
    () => callAnthropic({ userText: "ping", label: "t-credit" }),
    (err) => err.code === "BILLING_CREDIT_EXHAUSTED" || /out of credit/i.test(String(err.message))
  );
  assert.equal(fetchCalls, 1);
  assert.equal(countCacheLogs(), 0);
});

await run("retry-after is honoured", async () => {
  let n = 0;
  const t0 = Date.now();
  handler = async () => {
    n += 1;
    if (n === 1) return jsonRes(429, { error: { message: "slow" } }, { "retry-after": "1" });
    return jsonRes(200, okBody());
  };
  await callAnthropic({ userText: "ping", label: "t-retry-after" });
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 900, `retry-after wait was ${elapsed}ms`);
  assert.equal(fetchCalls, 2);
});

await run("10 calls with limit 4 never exceed 4 in flight", async () => {
  process.env.ANTHROPIC_MAX_CONCURRENT = "4";
  resetAnthropicConcurrencyGateForTests();
  handler = async () => {
    await new Promise((r) => setTimeout(r, 40));
    return jsonRes(200, okBody());
  };
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => callAnthropic({ userText: "ping", label: `t-conc-${i}` }))
  );
  assert.equal(results.length, 10);
  assert.ok(results.every((r) => r.text === "ok"));
  assert.ok(maxInFlight <= 4, `maxInFlight=${maxInFlight}`);
  assert.equal(results.length, 10);
});

await run("retried success is counted once", async () => {
  let n = 0;
  handler = async () => {
    n += 1;
    if (n === 1) return jsonRes(500, { error: { message: "boom" } });
    return jsonRes(200, okBody());
  };
  await callAnthropic({ userText: "ping", label: "t-once" });
  assert.equal(fetchCalls, 2);
  assert.equal(countCacheLogs(), 1);
});

const formSrc = readFileSync(path.join(root, "src", "PropositionForm.jsx"), "utf8");
assert.match(formSrc, /Screen again/);
assert.equal(RESEARCH_FAILED_COPY, "Research failed — retry");

const callSrc = readFileSync(path.join(root, "lib", "callAnthropic.js"), "utf8");
assert.match(callSrc, /MAX_ATTEMPTS = 4/);
assert.match(callSrc, /AbortController/);
assert.match(callSrc, /retry-after/);
assert.doesNotMatch(callSrc, /console\.(log|error|debug|info)\([^)]*apiKey/);

globalThis.fetch = realFetch;
console.log = origLog;
console.error = origErr;
console.log("PASS testAnthropicReliability");

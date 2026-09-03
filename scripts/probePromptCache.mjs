/**
 * Two Claude calls with the same cached skill block.
 * Confirms cache_read_input_tokens > 0 on the second call.
 */
import { readFileSync } from "node:fs";
import { callAnthropic } from "../lib/callAnthropic.js";
import { sixFilterFullSystem } from "../lib/skills/loadSkill.js";

try {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  /* no .env.local */
}

if (!String(process.env.ANTHROPIC_API_KEY || "").startsWith("sk-ant-")) {
  console.log("SKIP probePromptCache — ANTHROPIC_API_KEY not set");
  process.exit(0);
}

const system = sixFilterFullSystem(
  "Reply with exactly one word: ok. Do not search. Do not explain."
);

async function once(label) {
  const result = await callAnthropic({
    system,
    userText: `${label}: say ok`,
    useWebSearch: false,
    maxTokens: 32,
    temperature: 0,
  });
  const u = result.usage || {};
  console.log(
    `[probe] ${label} cache_creation=${u.cache_creation_input_tokens} ` +
      `cache_read=${u.cache_read_input_tokens} input=${u.input_tokens} output=${u.output_tokens}`
  );
  return u;
}

const first = await once("call-1");
const second = await once("call-2");
const billedFirst = (first.input_tokens || 0) + (first.cache_creation_input_tokens || 0);
const billedSecond = (second.input_tokens || 0) + (second.cache_creation_input_tokens || 0);
console.log(
  `[probe] billed_input_tokens first=${billedFirst} second=${billedSecond} ` +
    `reduction=${billedFirst > 0 ? (((billedFirst - billedSecond) / billedFirst) * 100).toFixed(0) : 0}%`
);
if (!(second.cache_read_input_tokens > 0)) {
  console.error("FAIL: second call cache_read_input_tokens was 0");
  process.exit(1);
}
console.log("PASS probePromptCache — cache reads billed on the second call");

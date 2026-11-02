import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  encryptApiKey,
  decryptApiKey,
  resolveBillingApiKey,
  isAnthropicCreditFailure,
  billingCreditExhaustedError,
  isTeamBillingDepartment,
} from "../lib/departmentApiKeys.js";
import { researchHashFor } from "../lib/researchCache.js";
import { requireUnlockedDepartment, canViewProposition } from "../lib/propositionAccess.js";
import { currentBillingDepartment, runWithLlm } from "../lib/llmContext.js";
import { OPEN_ACCESS_TEAM, PLATFORM_TEAM_LOCK_ENABLED } from "../lib/departmentAuthConstants.js";

// Match the suite default — open-platform visibility checks park named login.
if (!String(process.env.REQUIRE_AUTH || "").trim()) process.env.REQUIRE_AUTH = "false";

// Encrypt round-trip
const plain = "sk-ant-test-key-not-real";
const blob = encryptApiKey(plain);
assert.ok(blob.ciphertext && blob.iv && blob.tag);
assert.equal(decryptApiKey(blob), plain);
assert.notEqual(blob.ciphertext, plain);

// Team vs Master / infra
assert.equal(isTeamBillingDepartment("CIA"), true);
assert.equal(isTeamBillingDepartment("Master"), false);

const prevNpd = process.env.DEPT_API_KEY_NPD;
const prevAnt = process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;
delete process.env.ANTHROPIC_API_KEY;
await assert.rejects(
  () => resolveBillingApiKey(null),
  /Claude API key missing/,
  "open/infra billing must fail closed when ANTHROPIC_API_KEY is unset — otherwise COGS never auto-populates"
);
process.env.ANTHROPIC_API_KEY = "sk-ant-infra-for-autopopulate-test";
const infra = await resolveBillingApiKey(null);
assert.equal(infra.source, "ANTHROPIC_API_KEY");
assert.equal(infra.apiKey, "sk-ant-infra-for-autopopulate-test");
const master = await resolveBillingApiKey("Master");
assert.equal(master.source, "ANTHROPIC_API_KEY");

const npd = await resolveBillingApiKey("NPD");
assert.ok(npd.apiKey, "NPD must resolve a key so F2/F3/F5 numbers can auto-populate");
assert.ok(
  npd.source === "ANTHROPIC_API_KEY" ||
    npd.source === "DEPT_API_KEY_NPD" ||
    String(npd.source).startsWith("department_api_keys:"),
  `unexpected billing source ${npd.source}`
);
if (npd.source === "ANTHROPIC_API_KEY") {
  assert.equal(npd.apiKey, "sk-ant-infra-for-autopopulate-test");
}
if (prevNpd) process.env.DEPT_API_KEY_NPD = prevNpd;
else delete process.env.DEPT_API_KEY_NPD;
if (prevAnt) process.env.ANTHROPIC_API_KEY = prevAnt;
else delete process.env.ANTHROPIC_API_KEY;

const billingSrc = readFileSync(new URL("../lib/departmentApiKeys.js", import.meta.url), "utf8");
assert.match(billingSrc, /using ANTHROPIC_API_KEY so numbers can auto-populate/);

// Credit error attribution — no fallback language
assert.equal(isAnthropicCreditFailure(402, "payment required"), true);
const creditErr = billingCreditExhaustedError("CIA");
assert.match(creditErr.message, /CIA/);
assert.doesNotMatch(creditErr.message, /fallback|another department's key was used/i);
assert.equal(creditErr.code, "BILLING_CREDIT_EXHAUSTED");

// Session / open platform
if (PLATFORM_TEAM_LOCK_ENABLED) {
  assert.throws(() => requireUnlockedDepartment(null), /Unlock with your department password/);
  assert.equal(canViewProposition(null, { submitterDepartment: "CIA" }), false);
} else {
  assert.equal(requireUnlockedDepartment(null), OPEN_ACCESS_TEAM);
  assert.equal(canViewProposition(null, { submitterDepartment: "CIA" }), true);
}
assert.equal(requireUnlockedDepartment({ department: "CIA" }), "CIA");

// ALS billing department
await runWithLlm("claude", async () => {
  assert.equal(currentBillingDepartment(), "Marketing");
}, { department: "Marketing" });

// Cache fingerprint ignores submitter / does not include session department
const base = {
  ideaDescription: "herbal cooling hair oil",
  category: "Hair oils",
  division: "Personal Care",
  submitterDepartment: "CIA",
  f1: { benchmark: "Indulekha", declaredAttribute: "cooling", pureCommodity: false },
};
assert.equal(
  researchHashFor(base),
  researchHashFor({ ...base, submitterDepartment: "Marketing" }),
  "cache must reuse across departments (REUSE policy)"
);

const appSrc = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
assert.match(appSrc, /TeamUnlockScreen/);
assert.match(appSrc, /teamSession/);
assert.match(appSrc, /PLATFORM_TEAM_LOCK_ENABLED/);

const callSrc = readFileSync(new URL("../lib/callAnthropic.js", import.meta.url), "utf8");
assert.match(callSrc, /resolveBillingApiKey/);
assert.match(callSrc, /billingCreditExhaustedError/);
assert.doesNotMatch(callSrc, /submitterDepartment/);

const fieldsSrc = readFileSync(new URL("../lib/propositionFields.js", import.meta.url), "utf8");
assert.match(fieldsSrc, /platform session|unlocked team session/);

const policySrc = readFileSync(new URL("../docs/PART93_BILLING.md", import.meta.url), "utf8");
assert.match(policySrc, /REUSE/);

console.log("PASS Part 93: session billing gate, encrypted keys, cache REUSE policy");

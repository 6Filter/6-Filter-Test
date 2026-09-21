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

// Encrypt round-trip
const plain = "sk-ant-test-key-not-real";
const blob = encryptApiKey(plain);
assert.ok(blob.ciphertext && blob.iv && blob.tag);
assert.equal(decryptApiKey(blob), plain);
assert.notEqual(blob.ciphertext, plain);

// Team vs Master / infra
assert.equal(isTeamBillingDepartment("CIA"), true);
assert.equal(isTeamBillingDepartment("Master"), false);

const infra = await resolveBillingApiKey(null);
assert.equal(infra.source, "ANTHROPIC_API_KEY");
const master = await resolveBillingApiKey("Master");
assert.equal(master.source, "ANTHROPIC_API_KEY");

// Credit error attribution — no fallback language
assert.equal(isAnthropicCreditFailure(402, "payment required"), true);
const creditErr = billingCreditExhaustedError("CIA");
assert.match(creditErr.message, /CIA/);
assert.doesNotMatch(creditErr.message, /fallback|another department's key was used/i);
assert.equal(creditErr.code, "BILLING_CREDIT_EXHAUSTED");

// Session required
assert.throws(() => requireUnlockedDepartment(null), /Unlock with your department password/);
assert.equal(requireUnlockedDepartment({ department: "CIA" }), "CIA");
assert.equal(canViewProposition(null, { submitterDepartment: "CIA" }), false);

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

const callSrc = readFileSync(new URL("../lib/callAnthropic.js", import.meta.url), "utf8");
assert.match(callSrc, /resolveBillingApiKey/);
assert.match(callSrc, /billingCreditExhaustedError/);
assert.doesNotMatch(callSrc, /submitterDepartment/);

const fieldsSrc = readFileSync(new URL("../lib/propositionFields.js", import.meta.url), "utf8");
assert.match(fieldsSrc, /unlocked team session/);

const policySrc = readFileSync(new URL("../docs/PART93_BILLING.md", import.meta.url), "utf8");
assert.match(policySrc, /REUSE/);

console.log("PASS Part 93: session billing gate, encrypted keys, cache REUSE policy");

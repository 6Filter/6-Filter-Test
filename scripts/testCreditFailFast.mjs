/**
 * Credit empty: ordinary users see one line; later AI calls skip the network.
 * Display-only for the message. Does not change scoring or submit gates.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CREDIT_EXHAUSTED_USER_COPY,
  creditMessageForViewer,
  isCreditExhaustedError,
  isPlatformCreditExhausted,
  noteCreditExhausted,
  resetCreditExhaustedForTests,
} from "../lib/creditFailureCopy.js";

resetCreditExhaustedForTests();
assert.equal(isPlatformCreditExhausted(), false);
noteCreditExhausted();
assert.equal(isPlatformCreditExhausted(), true);
resetCreditExhaustedForTests();
assert.equal(isPlatformCreditExhausted(), false);

assert.match(CREDIT_EXHAUSTED_USER_COPY, /run out of credit/i);
assert.match(CREDIT_EXHAUSTED_USER_COPY, /tell your admin/i);
assert.equal(creditMessageForViewer(false, "dept X is out of credit"), CREDIT_EXHAUSTED_USER_COPY);
assert.equal(creditMessageForViewer(true, "dept X is out of credit"), "dept X is out of credit");

const billed = { code: "BILLING_CREDIT_EXHAUSTED", message: "x" };
assert.equal(isCreditExhaustedError(billed), true);
assert.equal(isCreditExhaustedError(new Error("timeout")), false);

const callSrc = readFileSync(new URL("../lib/callAnthropic.js", import.meta.url), "utf8");
assert.match(callSrc, /isPlatformCreditExhausted/);
assert.match(callSrc, /noteCreditExhausted/);
assert.match(callSrc, /maybeAlertCreditExhausted/);

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
assert.match(apiSrc, /CREDIT_EXHAUSTED_USER_COPY/);
assert.match(apiSrc, /creditExhausted:/);
assert.match(apiSrc, /creditMessageForViewer/);

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /creditExhausted/);
assert.match(formSrc, /run out of credit/);

console.log("PASS testCreditFailFast");

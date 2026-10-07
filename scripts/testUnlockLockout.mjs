import assert from "node:assert/strict";
import { hashPassword } from "../lib/auth.js";
import { handleDepartmentUnlock } from "../lib/departmentAuthApi.js";
import { checkRateLimit, clearRateLimits, rateLimitKey } from "../lib/rateLimit.js";
import {
  UNLOCK_MAX_FAILURES,
  UNLOCK_WINDOW_MS,
  clearDepartmentUnlockFailures,
  departmentUnlockLocked,
  isUnlockLocked,
  nextUnlockFailureState,
  recordDepartmentUnlockFailure,
} from "../lib/unlockLockout.js";

clearRateLimits();
const realIp = "203.0.113.50";
const spoofedA = { headers: { "x-forwarded-for": `1.2.3.4, ${realIp}` } };
const spoofedB = { headers: { "x-forwarded-for": `8.8.8.8, ${realIp}` } };
assert.equal(rateLimitKey(spoofedA, "dept-unlock"), rateLimitKey(spoofedB, "dept-unlock"));

const edgeA = {
  headers: { "cf-connecting-ip": realIp, "x-forwarded-for": "9.9.9.9, 1.1.1.1" },
};
const edgeB = {
  headers: { "cf-connecting-ip": realIp, "x-forwarded-for": "7.7.7.7" },
};
assert.equal(rateLimitKey(edgeA, "dept-unlock"), rateLimitKey(edgeB, "dept-unlock"));

const key = rateLimitKey(spoofedA, "dept-unlock");
for (let i = 0; i < 20; i += 1) {
  assert.equal(checkRateLimit(key, { max: 20, windowMs: 60_000 }), true);
}
assert.equal(checkRateLimit(rateLimitKey(spoofedB, "dept-unlock"), { max: 20, windowMs: 60_000 }), false);

const t0 = 1_700_000_000_000;
let state = null;
for (let i = 0; i < UNLOCK_MAX_FAILURES - 1; i += 1) {
  state = nextUnlockFailureState(state, t0 + i);
  assert.equal(state.locked, false);
}
state = nextUnlockFailureState(state, t0 + UNLOCK_MAX_FAILURES);
assert.equal(state.locked, true);
assert.equal(isUnlockLocked(state, state.lockedUntil - 1), true);
assert.equal(isUnlockLocked(state, state.lockedUntil), false);

const later = nextUnlockFailureState(nextUnlockFailureState(null, t0), t0 + UNLOCK_WINDOW_MS + 1);
assert.equal(later.failureCount, 1);

const dept = "NPD";
await clearDepartmentUnlockFailures(dept);
for (let i = 0; i < UNLOCK_MAX_FAILURES; i += 1) {
  await recordDepartmentUnlockFailure(dept, t0 + i);
}
assert.equal(await departmentUnlockLocked(dept, t0 + UNLOCK_MAX_FAILURES), true);
assert.equal(await departmentUnlockLocked(dept, t0 + UNLOCK_WINDOW_MS + UNLOCK_MAX_FAILURES), false);

const password = `throwaway-${dept}-lockout-check`;
process.env.DEPT_PASSWORD_HASH_NPD = hashPassword(password);
const now = Date.now();
await clearDepartmentUnlockFailures(dept);
for (let i = 0; i < UNLOCK_MAX_FAILURES; i += 1) {
  await recordDepartmentUnlockFailure(dept, now);
}

function jsonReq(body) {
  const chunks = [Buffer.from(JSON.stringify(body))];
  return {
    method: "POST",
    headers: {},
    on(event, cb) {
      if (event === "data") chunks.forEach((chunk) => cb(chunk));
      if (event === "end") cb();
    },
  };
}
function jsonRes() {
  const out = { status: 0, body: null };
  return {
    out,
    statusCode: 0,
    setHeader() {},
    end(body) {
      out.status = this.statusCode;
      out.body = JSON.parse(body);
    },
  };
}

const lockedRes = jsonRes();
await handleDepartmentUnlock(jsonReq({ department: dept, password }), lockedRes);
assert.equal(lockedRes.out.status, 401);
assert.equal(lockedRes.out.body.error, "That password does not unlock this department.");

await clearDepartmentUnlockFailures(dept);
const openRes = jsonRes();
await handleDepartmentUnlock(jsonReq({ department: dept, password }), openRes);
assert.equal(openRes.out.status, 200);
assert.equal(openRes.out.body.department, dept);

console.log("PASS spoofed forwarded-for does not reset unlock limits, and team lockout expires");

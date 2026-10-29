/**
 * Password register/login retired — replaced by Slack OTP coverage in testPart114SlackAccess.mjs.
 * This file keeps the suite green and asserts the old paths are gone.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const router = readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8");
assert.match(router, /\/api\/auth\/request-code/);
assert.match(router, /\/api\/auth\/verify-code/);
assert.doesNotMatch(router, /handleRegister/);
assert.doesNotMatch(router, /await handleLogin/);

const login = readFileSync(new URL("../src/LoginScreen.jsx", import.meta.url), "utf8");
assert.doesNotMatch(login, /type=\"password\"/);
assert.doesNotMatch(login, /Create an account/);
assert.match(login, /request-code/);
assert.match(login, /verify-code/);

const authApi = readFileSync(new URL("../lib/authApi.js", import.meta.url), "utf8");
assert.doesNotMatch(authApi, /hashPassword\(/);
assert.doesNotMatch(authApi, /verifyPassword\(/);

console.log("PASS password register/login removed; Slack code routes present");

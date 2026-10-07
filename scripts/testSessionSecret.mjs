import assert from "node:assert/strict";
import { sessionSecretConfigured, signSession } from "../lib/auth.js";

const prevEnv = process.env.NODE_ENV;
const prevSecret = process.env.SESSION_SECRET;
const prevRender = process.env.RENDER;

delete process.env.SESSION_SECRET;
delete process.env.RENDER;
process.env.NODE_ENV = "production";
assert.equal(sessionSecretConfigured(), false);
assert.throws(
  () => signSession({ department: "Master" }),
  /SESSION_SECRET must be set/
);

process.env.SESSION_SECRET = "unit-test-secret-not-a-deploy-value";
assert.equal(sessionSecretConfigured(), true);
const token = signSession({ department: "R&D" });
assert.equal(typeof token, "string");
assert.ok(token.includes("."));

if (prevSecret == null) delete process.env.SESSION_SECRET;
else process.env.SESSION_SECRET = prevSecret;
if (prevRender == null) delete process.env.RENDER;
else process.env.RENDER = prevRender;
process.env.NODE_ENV = prevEnv;

console.log("PASS production start refuses to sign sessions without SESSION_SECRET");

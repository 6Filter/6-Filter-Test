/**
 * Self-register with email username, then sign in with the chosen password.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-register-"));
process.env.REQUIRE_AUTH = "true";
process.env.SESSION_SECRET = "test-personal-register-secret";
process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.RENDER;

const { authRequired, DEFAULT_REGISTER_ROLE } = await import("../lib/auth.js");
const { handleRegister, handleLogin } = await import("../lib/authApi.js");
const { SUBMITTER_DEPARTMENTS } = await import("../lib/propositionFields.js");
const { PLATFORM_TEAM_LOCK_ENABLED } = await import("../lib/departmentAuthConstants.js");
const loginSrc = readFileSync(path.join(root, "src", "LoginScreen.jsx"), "utf8");

assert.equal(authRequired(), true);
assert.equal(PLATFORM_TEAM_LOCK_ENABLED, false);
assert.ok(SUBMITTER_DEPARTMENTS.includes("CIA"));
assert.ok(SUBMITTER_DEPARTMENTS.includes("Sales and Distribution - PPD"));
assert.match(loginSrc, /Create an account|Create your Primus account/);
assert.match(loginSrc, /\/api\/auth\/register/);

function capture() {
  const captured = [];
  return {
    captured,
    res: {
      statusCode: 0,
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      end(body) {
        captured.push({ status: this.statusCode, body, headers: { ...this.headers } });
      },
    },
  };
}

async function post(handler, body) {
  const box = capture();
  const stream = Readable.from([JSON.stringify(body)]);
  stream.method = "POST";
  stream.headers = { "content-type": "application/json" };
  await handler(stream, box.res);
  const hit = box.captured[0];
  return { status: hit.status, json: JSON.parse(hit.body), headers: hit.headers };
}

const stamp = Date.now();
const email = `person.${stamp}@cavinkare.com`;
const password = "choose-a-password";

const shortPw = await post(handleRegister, {
  name: "Test Person",
  email,
  password: "short",
});
assert.equal(shortPw.status, 400);

const created = await post(handleRegister, {
  name: "Test Person",
  email,
  password,
});
assert.equal(created.status, 201, created.json?.error || "");
assert.equal(created.json.user.email, email);
assert.equal(created.json.user.name, "Test Person");
assert.equal(created.json.user.role, DEFAULT_REGISTER_ROLE);
assert.match(String(created.headers["Set-Cookie"] || ""), /primus_session=/);

const dup = await post(handleRegister, { name: "Other", email, password });
assert.equal(dup.status, 409);

const wrong = await post(handleLogin, { email, password: "wrong-password-here" });
assert.equal(wrong.status, 401);

const ok = await post(handleLogin, { email, password });
assert.equal(ok.status, 200);
assert.equal(ok.json.user.email, email);
assert.match(String(ok.headers["Set-Cookie"] || ""), /primus_session=/);

console.log("PASS personal register + login with email username");

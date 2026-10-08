/**
 * Log list, one idea, and the log banner fail closed when the database is down.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-reads-"));
process.env.PRIMUS_DB_QUERY_STUB = "down";
process.env.DATABASE_URL = "postgres://127.0.0.1:1/primus";
delete process.env.POSTGRES_URL;
delete process.env.RENDER;
process.env.NODE_ENV = "test";

const { databaseUnavailableMessage } = await import("../lib/logStatus.js");
const { handlePropositionsCollection, handlePropositionById } = await import("../lib/propositionsApi.js");
const { handleInvalidateResearchCache } = await import("../lib/adminApi.js");

function sendJson(res, status, body) {
  res.statusCode = status;
  res.end(JSON.stringify(body));
}
function redactSecrets(message) {
  return String(message || "");
}
function capture() {
  const captured = [];
  return {
    captured,
    res: {
      statusCode: 0,
      setHeader() {},
      end(body) {
        captured.push({ status: this.statusCode, body });
      },
    },
  };
}

assert.equal(databaseUnavailableMessage("Database unavailable, nothing was saved."), true);
assert.equal(databaseUnavailableMessage("Could not load propositions."), false);

const user = { department: "R&D" };
const list = capture();
await handlePropositionsCollection({ method: "GET", user, url: "/api/propositions?limit=10" }, list.res, {
  sendJson,
  redactSecrets,
});
assert.equal(list.captured[0].status, 503);
assert.equal(JSON.parse(list.captured[0].body).error, "Database unavailable. Try again shortly.");
assert.equal(JSON.parse(list.captured[0].body).propositions, undefined);

const one = capture();
await handlePropositionById({ method: "GET", user }, one.res, "00000000-0000-4000-8000-000000000104", {
  sendJson,
  redactSecrets,
});
assert.equal(one.captured[0].status, 503);
assert.equal(JSON.parse(one.captured[0].body).error, "Database unavailable. Try again shortly.");

const locked = capture();
await handlePropositionsCollection({ method: "GET", user: {}, url: "/api/propositions" }, locked.res, {
  sendJson,
  redactSecrets,
});
assert.equal(locked.captured[0].status, 401);

const stranger = capture();
await handleInvalidateResearchCache({ method: "POST", user: { department: "NPD" } }, stranger.res);
assert.equal(stranger.captured[0].status, 403);

const page = readFileSync(path.join(root, "src", "LogPage.jsx"), "utf8");
assert.match(page, /Database unavailable/);
assert.match(page, /unavailable \?/);
assert.doesNotMatch(page, /unavailable \?[\s\S]{0,80}stats\.total/);

const form = readFileSync(path.join(root, "src", "PropositionForm.jsx"), "utf8");
assert.match(form, /Retry this step/);
assert.match(form, /window\.confirm/);
assert.match(form, /retry-step/);

console.log("PASS read paths return 503 and the log shows Database unavailable");

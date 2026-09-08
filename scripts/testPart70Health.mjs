import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pingDatabase } from "../lib/db.js";
import { handleHealth } from "../lib/healthApi.js";

const workflow = readFileSync(new URL("../.github/workflows/keep-alive.yml", import.meta.url), "utf8");
assert.match(workflow, /https:\/\/ck-6-filter-test\.onrender\.com(?!\/)/);
assert.match(workflow, /https:\/\/ck-6-filter-test\.onrender\.com\/api\/health/);
assert.match(workflow, /Ping Render App \(web \+ db\)/);

const router = readFileSync(new URL("../lib/apiRouter.js", import.meta.url), "utf8");
assert.match(router, /url === "\/api\/health"/);
assert.match(router, /auth: false/);

const vercel = readFileSync(new URL("../api/health.js", import.meta.url), "utf8");
assert.match(vercel, /handleHealth/);
assert.match(vercel, /auth: false/);

const ping = await pingDatabase();
assert.deepEqual(ping, { ok: true, db: "warm" });

const captured = [];
const res = {
  statusCode: 0,
  headers: {},
  setHeader(k, v) {
    this.headers[k] = v;
  },
  end(body) {
    captured.push({ status: this.statusCode, body });
  },
};
await handleHealth({ method: "GET" }, res);
assert.equal(captured[0].status, 200);
const healthBody = JSON.parse(captured[0].body);
assert.equal(healthBody.ok, true);
assert.equal(healthBody.db, "warm");
assert.equal(typeof healthBody.propositions, "number");

console.log("PASS Part 70 health route warms the database");

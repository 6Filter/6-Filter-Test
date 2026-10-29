import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { redactSecrets, sendJson } from "../lib/http.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbHref = pathToFileURL(path.join(root, "lib", "db.js")).href;
// Prefer suite PRIMUS_DATA_DIR so we never write into the repo's gitignored data/.
const { dataDir } = await import("../lib/dataDir.js");
const storeDir = dataDir();
const propFile = path.join(storeDir, "propositions.json");
const userFile = path.join(storeDir, "users.json");

/** Fresh clones have no store files. Seed empty JSON before fail-closed checks. */
async function ensureEmptyJsonStore(file) {
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await access(file);
  } catch {
    await writeFile(file, "[]\n", "utf8");
  }
}

function runNode(code, { cwd, env }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function baseEnv(extra, { dropDatabaseUrl = false } = {}) {
  const env = { ...process.env, ...extra };
  delete env.POSTGRES_URL;
  delete env.PRIMUS_DB_QUERY_STUB;
  delete env.SLACK_WEBHOOK_URL;
  if (!Object.prototype.hasOwnProperty.call(extra, "RENDER")) delete env.RENDER;
  if (dropDatabaseUrl) delete env.DATABASE_URL;
  return env;
}

const emptyDir = await mkdtemp(path.join(tmpdir(), "primus-102-"));
const down = await runNode(
  `import { initDb } from ${JSON.stringify(dbHref)};
await initDb();
console.log("SERVED");`,
  {
    cwd: emptyDir,
    env: baseEnv({
      RENDER: "true",
      NODE_ENV: "production",
      DATABASE_URL: "postgres://127.0.0.1:1/primus",
      PRIMUS_PG_CONNECT_BUDGET_MS: "200",
    }),
  }
);
assert.notEqual(down.code, 0);
assert.equal(down.stdout.includes("SERVED"), false);
await assert.rejects(access(path.join(emptyDir, "data", "propositions.json")));
await assert.rejects(access(path.join(emptyDir, "data", "users.json")));

const noUrlDir = await mkdtemp(path.join(tmpdir(), "primus-102-nourl-"));
const noUrl = await runNode(
  `import { initDb } from ${JSON.stringify(dbHref)};
await initDb();
console.log("SERVED");`,
  {
    cwd: noUrlDir,
    env: baseEnv(
      {
        RENDER: "true",
        NODE_ENV: "production",
      },
      { dropDatabaseUrl: true }
    ),
  }
);
assert.notEqual(noUrl.code, 0);
assert.match(noUrl.stderr, /\[primus\/db\] FILE MODE IN PRODUCTION/);
assert.equal(noUrl.stdout.includes("SERVED"), false);
await assert.rejects(access(path.join(noUrlDir, "data", "propositions.json")));

const local = await runNode(
  `import { initDb, isUsingPostgres, countPropositions } from ${JSON.stringify(dbHref)};
await initDb();
if (isUsingPostgres()) process.exit(2);
const n = await countPropositions();
if (typeof n !== "number") process.exit(3);
console.log("FILE_OK");`,
  {
    cwd: root,
    env: baseEnv({ NODE_ENV: "development" }, { dropDatabaseUrl: true }),
  }
);
assert.equal(local.code, 0, local.stderr);
assert.match(local.stdout, /FILE_OK/);

process.env.PRIMUS_DB_QUERY_STUB = "down";
delete process.env.RENDER;
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgres://127.0.0.1:1/primus";
delete process.env.POSTGRES_URL;

await ensureEmptyJsonStore(propFile);
await ensureEmptyJsonStore(userFile);
const beforeProps = await readFile(propFile);
const beforeUsers = await readFile(userFile);
const { createProposition, createUser } = await import("../lib/db.js");
const { handleHealth } = await import("../lib/healthApi.js");
const { handlePropositionsCollection, handlePropositionById, handlePropositionDraft } = await import(
  "../lib/propositionsApi.js"
);

await assert.rejects(createProposition({ submitterDepartment: "R&D" }), (err) => err.status === 503 && err.message === "Database unavailable, nothing was saved.");
await assert.rejects(
  createUser({ name: "Part 102", email: "part102@example.com", passwordHash: "hash", role: "BM" }),
  (err) => err.status === 503
);

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

// Signed-in user with a team so handlers reach the DB check (not a 403 unlock wall).
const user = {
  id: "part102-user",
  email: "part102@cavinkare.com",
  role: "BM",
  team: "R&D",
  department: "R&D",
  status: "active",
};
process.env.REQUIRE_AUTH = "true";
const createHit = capture();
await handlePropositionsCollection(
  { method: "POST", user },
  createHit.res,
  { sendJson, redactSecrets }
);
assert.equal(createHit.captured[0].status, 503);
assert.equal(JSON.parse(createHit.captured[0].body).error, "Database unavailable, nothing was saved.");

const saveHit = capture();
await handlePropositionById(
  { method: "PUT", user, body: { name: "x", submitterName: "A", submitterDepartment: "R&D", ideaDescription: "y" } },
  saveHit.res,
  "00000000-0000-4000-8000-000000000102",
  { readBody: async () => ({ name: "x", submitterName: "A", submitterDepartment: "R&D", ideaDescription: "y" }), sendJson, redactSecrets }
);
assert.equal(saveHit.captured[0].status, 503);
assert.equal(JSON.parse(saveHit.captured[0].body).error, "Database unavailable, nothing was saved.");

const draftHit = capture();
await handlePropositionDraft(
  { method: "POST", user },
  draftHit.res,
  "00000000-0000-4000-8000-000000000102",
  { readBody: async () => ({ name: "x" }), sendJson, redactSecrets }
);
assert.equal(draftHit.captured[0].status, 503);

const healthHit = capture();
await handleHealth({ method: "GET" }, healthHit.res);
assert.equal(healthHit.captured[0].status, 503);
const healthBody = JSON.parse(healthHit.captured[0].body);
assert.equal(healthBody.db, "unavailable");
assert.equal(healthBody.ok, false);

assert.equal(await readFile(propFile, "utf8"), beforeProps.toString("utf8"));
assert.equal(await readFile(userFile, "utf8"), beforeUsers.toString("utf8"));

console.log("PASS Part 102 production fails closed");

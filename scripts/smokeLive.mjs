/**
 * Read-only check of the live site. Creates nothing and reads no secrets.
 */
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.env.PRIMUS_LIVE_URL || "https://ck-6-filter-test.onrender.com").replace(/\/$/, "");

function fail(message) {
  console.error(`smokeLive: ${message}`);
  process.exitCode = 1;
}

const healthRes = await fetch(`${base}/api/health`);
const health = await healthRes.json().catch(() => ({}));
if (!healthRes.ok || health.db !== "postgres" || !Number.isFinite(Number(health.propositions))) {
  fail(`/api/health db=${health.db || "?"} propositions=${health.propositions ?? "?"}`);
} else if (!Number.isFinite(Number(health.researchIncomplete))) {
  fail("/api/health is missing researchIncomplete");
} else {
  console.log(`health db=postgres propositions=${health.propositions} researchIncomplete=${health.researchIncomplete}`);
}

const head = execSync("git rev-parse HEAD", { cwd: root, encoding: "utf8" }).trim();
const liveCommit = String(health.commit || "").trim();
if (!liveCommit || liveCommit !== head) {
  fail(`live commit ${liveCommit || "(missing)"} != HEAD ${head}`);
} else {
  console.log(`commit ${liveCommit}`);
}

const wrong = await fetch(`${base}/api/department-auth/unlock`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ department: "NPD", password: "wrong-password" }),
});
if (wrong.ok) fail("wrong team password was accepted");
else console.log(`wrong password status=${wrong.status}`);

const open = await fetch(`${base}/api/propositions`);
if (open.ok) fail("GET /api/propositions with no cookie was accepted");
else console.log(`no cookie status=${open.status}`);

const home = await fetch(`${base}/`);
const headers = home.headers;
for (const name of ["x-content-type-options", "x-frame-options", "referrer-policy", "content-security-policy"]) {
  if (!headers.get(name)) fail(`missing header ${name}`);
}
const html = await home.text();
const served = html.match(/assets\/(index-[^"]+\.js)/)?.[1] || "";
const built = readdirSync(path.join(root, "dist", "assets")).filter((name) => name.startsWith("index-") && name.endsWith(".js"));
if (!served || !built.includes(served)) fail(`served bundle ${served || "(none)"} is not in ${built.join(", ") || "(no local build)"}`);
else console.log(`bundle ${served}`);

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS smokeLive");

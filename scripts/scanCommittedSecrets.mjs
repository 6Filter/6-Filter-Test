/**
 * Fail if a tracked file contains a team-password shape.
 * Gitignored local files and history are out of scope. Password rotation is deferred.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PATTERN = /ck-[a-z&]+-[0-9a-f]{6}/;

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

const hits = [];
for (const rel of tracked) {
  let text = "";
  try {
    text = readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue;
  if (PATTERN.test(text)) hits.push(rel);
}

if (hits.length) {
  console.error("Secret scan found team-password text:");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log("scanCommittedSecrets: no team-password text in tracked files");

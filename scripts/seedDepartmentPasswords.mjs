/**
 * Seed / rotate department Log passwords in Postgres (or local file store).
 * Never commits plaintext. Run manually only:
 *
 *   set DEPT_PASSWORD_RD=...
 *   set DEPT_PASSWORD_CIA=...
 *   set DEPT_PASSWORD_MARKETING=...
 *   set DEPT_PASSWORD_NPD=...
 *   set DEPT_PASSWORD_MASTER=...
 *   set DATABASE_URL=...   # required for production Postgres
 *   node scripts/seedDepartmentPasswords.mjs
 *
 * Or put the same keys in .env.local / .department-passwords.local (gitignored).
 */
import { readFileSync, existsSync } from "node:fs";
import { scryptHash } from "../lib/auth.js";
import { initDb, isUsingPostgres, upsertDepartmentPasswordHash } from "../lib/db.js";
import { LOG_UNLOCK_OPTIONS, LOG_MASTER_UNLOCK } from "../lib/departmentAuthConstants.js";

function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1].trim()] = val;
  }
  return out;
}

const local = { ...loadEnvFile(".env.local"), ...loadEnvFile(".department-passwords.local") };
for (const [k, v] of Object.entries(local)) {
  if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
}

const passwords = {
  "R&D": process.env.DEPT_PASSWORD_RD || "",
  CIA: process.env.DEPT_PASSWORD_CIA || "",
  Marketing: process.env.DEPT_PASSWORD_MARKETING || "",
  NPD: process.env.DEPT_PASSWORD_NPD || "",
  [LOG_MASTER_UNLOCK]: process.env.DEPT_PASSWORD_MASTER || "",
};

await initDb();
const store = isUsingPostgres() ? "postgres" : "file";
let written = 0;
for (const dept of LOG_UNLOCK_OPTIONS) {
  const plaintext = String(passwords[dept] || "").trim();
  if (!plaintext) {
    console.warn(`skip ${dept}: no plaintext in DEPT_PASSWORD_*`);
    continue;
  }
  await upsertDepartmentPasswordHash(dept, scryptHash(plaintext));
  written += 1;
  console.log(`upserted ${dept} (${store})`);
}
console.log(`seedDepartmentPasswords: wrote ${written} hash(es) to ${store}`);
if (!written) process.exit(1);

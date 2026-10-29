/**
 * Break-glass when Slack is down.
 * Usage: node scripts/issueLoginCode.mjs <email>
 * Prints a one-time 10-minute code for ADMIN accounts only. Audited.
 */
import { readFileSync } from "node:fs";
import { getUserByEmail, initDb, usingPostgres } from "../lib/db.js";
import { replaceLoginCode, writeUserAudit } from "../lib/accessDb.js";
import { normalizeEmail } from "../lib/auth.js";

function loadLocalEnv() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    /* no .env.local */
  }
}

loadLocalEnv();

const email = normalizeEmail(process.argv[2]);
if (!email) {
  console.error("Usage: node scripts/issueLoginCode.mjs <email>");
  process.exit(1);
}

await initDb();
if (!usingPostgres()) {
  console.error("Postgres required.");
  process.exit(1);
}

const user = await getUserByEmail(email);
if (!user || user.role !== "ADMIN") {
  console.error("Refusing: email is not an ADMIN account.");
  process.exit(1);
}
if (String(user.status) === "disabled") {
  console.error("Refusing: account is disabled.");
  process.exit(1);
}

const { code, expiresAt } = await replaceLoginCode(email);
await writeUserAudit({
  action: "break-glass-login-code",
  targetUserId: user.id,
  targetEmail: email,
  detail: { expiresAt },
});
console.log(`One-time code for ${email} (expires ${expiresAt}):`);
console.log(code);

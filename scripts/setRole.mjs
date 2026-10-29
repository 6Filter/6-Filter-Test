/**
 * Usage: node scripts/setRole.mjs <email> <ROLE>
 * Sets role on an existing Slack-signed-in user. Never prints secrets.
 */
import { readFileSync } from "node:fs";
import { USER_ROLES } from "../lib/auth.js";
import { adminUpdateUser, getUserByEmail, initDb, usingPostgres } from "../lib/db.js";
import { writeUserAudit } from "../lib/accessDb.js";

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

const [email, role] = process.argv.slice(2);
if (!email || !role) {
  console.error("Usage: node scripts/setRole.mjs <email> <ROLE>");
  console.error(`ROLE is one of: ${USER_ROLES.join(", ")}`);
  process.exit(1);
}
if (!USER_ROLES.includes(role)) {
  console.error(`Unknown role "${role}". Use one of: ${USER_ROLES.join(", ")}`);
  process.exit(1);
}

await initDb();
if (!usingPostgres()) {
  console.error("Postgres required.");
  process.exit(1);
}
const user = await getUserByEmail(email);
if (!user) {
  console.error("No user with that email. They must sign in with Slack first.");
  process.exit(1);
}
const updated = await adminUpdateUser(user.id, { role });
await writeUserAudit({
  action: "set-role-script",
  targetUserId: user.id,
  targetEmail: user.email,
  detail: { role },
});
console.log(`Updated ${updated.email} → role ${updated.role}`);

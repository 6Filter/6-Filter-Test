import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { USER_ROLES, hashPassword } from "../lib/auth.js";
import { createUser, initDb } from "../lib/db.js";

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

const [name, email, password, role, division] = process.argv.slice(2);
if (!name || !email || !password || !role) {
  console.error('Usage: node scripts/seedUser.js "Name" email@ck.com password ROLE [division]');
  console.error(`ROLE is one of: ${USER_ROLES.join(", ")}`);
  process.exit(1);
}

if (!USER_ROLES.includes(role)) {
  console.error(`Unknown role "${role}". Use one of: ${USER_ROLES.join(", ")}`);
  process.exit(1);
}

await initDb();
const user = await createUser({
  id: randomUUID(),
  name,
  email,
  passwordHash: hashPassword(password),
  role,
  division: division || "",
});
console.log(`Seeded ${user.name} <${user.email}> as ${user.role}${user.division ? ` (${user.division})` : ""}`);

/**
 * Print a scrypt hash for a department Log password. Paste the hash into
 * Render as DEPT_PASSWORD_HASH_RD / _CIA / _MARKETING / _NPD.
 *
 *   node scripts/hashDepartmentPassword.mjs "the-password"
 *
 * Never commit the password or the hash.
 */
import { scryptHash } from "../lib/auth.js";

const password = String(process.argv[2] || "");
if (!password) {
  console.error("Usage: node scripts/hashDepartmentPassword.mjs <password>");
  process.exit(1);
}
process.stdout.write(scryptHash(password) + "\n");

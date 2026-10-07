import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { rewriteRenderDatabaseUrl } from "../lib/db.js";
import { verifyDepartmentPassword } from "../lib/departmentAuth.js";

const rewritten = rewriteRenderDatabaseUrl(
  "postgresql://primus:secret@dpg-da62njrm8hqs73ecgv2g-a/primus_a97s"
);
assert.match(rewritten, /dpg-da62njrm8hqs73ecgv2g-a\.oregon-postgres\.render\.com/);
assert.match(rewritten, /sslmode=require/);
assert.equal(
  rewriteRenderDatabaseUrl("postgresql://u:p@example.com/db"),
  "postgresql://u:p@example.com/db"
);

const issued = {
  "R&D": `throwaway-${randomBytes(9).toString("hex")}`,
  CIA: `throwaway-${randomBytes(9).toString("hex")}`,
  Marketing: `throwaway-${randomBytes(9).toString("hex")}`,
  NPD: `throwaway-${randomBytes(9).toString("hex")}`,
};
process.env.DEPT_PASSWORD_HASH_RD = hashPassword(issued["R&D"]);
process.env.DEPT_PASSWORD_HASH_CIA = hashPassword(issued.CIA);
process.env.DEPT_PASSWORD_HASH_MARKETING = hashPassword(issued.Marketing);
process.env.DEPT_PASSWORD_HASH_NPD = hashPassword(issued.NPD);

for (const [dept, password] of Object.entries(issued)) {
  const envName =
    dept === "R&D"
      ? "DEPT_PASSWORD_HASH_RD"
      : dept === "Marketing"
        ? "DEPT_PASSWORD_HASH_MARKETING"
        : `DEPT_PASSWORD_HASH_${dept}`;
  assert.equal(verifyPassword(password, process.env[envName]), true, `${dept} hash must match the throwaway password`);
  assert.equal(verifyPassword("wrong-password", process.env[envName]), false);
  assert.equal(await verifyDepartmentPassword(dept, password), true, `${dept} unlock must accept the throwaway password`);
  assert.equal(await verifyDepartmentPassword(dept, "wrong-password"), false);
}

assert.equal(await verifyDepartmentPassword("Master", "wrong-password"), false);

console.log("PASS department unlock credentials + Render DB hostname rewrite");

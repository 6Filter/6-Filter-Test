import assert from "node:assert/strict";
import { verifyPassword } from "../lib/auth.js";
import { rewriteRenderDatabaseUrl, departmentPasswordHashFallbacks } from "../lib/db.js";
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

const known = {
  "R&D": "ck-rd-297327",
  CIA: "ck-cia-e0bc1f",
  Marketing: "ck-marketing-d58aa1",
  NPD: "ck-npd-04ef33",
};
const hashes = departmentPasswordHashFallbacks();
for (const [dept, password] of Object.entries(known)) {
  assert.ok(hashes[dept], `${dept} must have a fallback hash`);
  assert.equal(verifyPassword(password, hashes[dept]), true, `${dept} builtin hash must match the issued password`);
  assert.equal(verifyPassword("wrong-password", hashes[dept]), false);
  assert.equal(await verifyDepartmentPassword(dept, password), true, `${dept} unlock must accept the issued password`);
  assert.equal(await verifyDepartmentPassword(dept, "wrong-password"), false);
}

assert.equal(await verifyDepartmentPassword("Master", "wrong-password"), false);

console.log("PASS department unlock credentials + Render DB hostname rewrite");

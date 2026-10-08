import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { createProposition, deleteProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
const dbSrc = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");

assert.doesNotMatch(apiSrc, /f2FillKeys = \[[^\]]*mrpInr/);
assert.match(apiSrc, /computeDerivedMrp/);
assert.match(apiSrc, /getPropositionById\(id\)/);
assert.match(dbSrc, /name: String\(body\.name \?\? ""\)\.trim\(\) \|\| prev\.name/);
assert.match(dbSrc, /COALESCE\(NULLIF\(TRIM\(\$2\), ''\), name\)/);

const created = await createProposition();
try {
  const named = await updateProposition(created.id, {
    ...created,
    name: "Keep this name",
    category: "Bathing soaps",
    ideaDescription: "A sandal soap that must keep its identity.",
    f2: { ...(created.f2 || {}), cogsAtScale: 18, netMarginAtScale: 52, gstRatePct: 18, mrpInr: 44.25 },
  });
  assert.equal(named.name, "Keep this name");
  assert.equal(named.category, "Bathing soaps");
  const wiped = await updateProposition(created.id, {
    ...named,
    name: "",
    category: "",
    ideaDescription: "",
    f2: { ...(named.f2 || {}), grammage: "75g" },
  });
  assert.equal(wiped.name, "Keep this name");
  assert.equal(wiped.category, "Bathing soaps");
  assert.match(String(wiped.ideaDescription || ""), /sandal soap/);
  assert.equal(wiped.f2.grammage, "75g");
  assert.equal(wiped.f2.mrpInr, 44.25);
  const loaded = await getPropositionById(created.id);
  assert.equal(loaded.name, "Keep this name");
  assert.equal(loaded.f2.mrpInr, 44.25);
} finally {
  await deleteProposition(created.id);
}

console.log("PASS persist identity + MRP stay on blank updates");

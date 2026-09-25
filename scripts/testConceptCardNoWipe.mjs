import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { chdir } from "node:process";

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");

assert.doesNotMatch(
  form,
  /setDoc\(mergeProposition\(data\.proposition\)\)/,
  "concept-card success must not replace the live form"
);
assert.match(form, /conceptCardName: nextName/);
assert.match(api, /setPropositionConceptCardName\(id, conceptCardName\)/);
assert.doesNotMatch(api, /\.\.\.current,\s*f1:/);

const dir = mkdtempSync(path.join(tmpdir(), "primus-cc-"));
chdir(dir);
const db = await import(new URL("../lib/db.js", import.meta.url));

const created = await db.createProposition({ submitterDepartment: "NPD" });
await db.updateProposition(
  created.id,
  {
    name: "Keep me",
    category: "Hair oils",
    ideaDescription: "do not wipe",
    submitterName: "Live Check",
    submitterDepartment: "NPD",
    f1: { evidenceSourceFile: { name: "evidence.csv", data: "abc" } },
    f2: { cogsAtScale: "70", netMarginAtScale: "22", gstRatePct: 18, mrpInr: "105.90" },
  },
  { bumpVersion: false }
);

const patched = await db.setPropositionConceptCardName(created.id, "card.csv");
assert.equal(patched.name, "Keep me");
assert.equal(patched.category, "Hair oils");
assert.equal(patched.ideaDescription, "do not wipe");
assert.equal(patched.submitterName, "Live Check");
assert.equal(patched.f2.cogsAtScale, "70");
assert.equal(patched.f2.mrpInr, "105.90");
assert.equal(patched.f1.conceptCardName, "card.csv");
assert.equal(patched.f1.evidenceSourceFile.data, "abc");

const again = await db.getPropositionById(created.id);
assert.equal(again.f2.gstRatePct, 18);
assert.equal(again.f1.evidenceSourceFile.name, "evidence.csv");
assert.equal(again.f1.conceptCardName, "card.csv");

console.log("concept card name patch leaves typed fields and evidence bytes in place");

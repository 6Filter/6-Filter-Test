/**
 * Part 143 author test — benefits 2 and 3 stay in export and research hashes
 * even when the form UI hides them behind "+ Add another benefit".
 */
import assert from "node:assert/strict";
import { FULL_EXPORT_COLUMNS, flattenProposition } from "../lib/logExport.js";
import { emptyPropositionDoc } from "../lib/propositionFields.js";
import { researchHashFor } from "../lib/researchCache.js";

let checks = 0;
function check(name, fn) {
  try {
    fn();
    checks += 1;
  } catch (e) {
    console.error(`FAIL: ${name}`);
    throw e;
  }
}

check("export columns still include attribute 2 and 3", () => {
  assert.ok(FULL_EXPORT_COLUMNS.includes("f1.declaredAttribute2"));
  assert.ok(FULL_EXPORT_COLUMNS.includes("f1.declaredAttribute3"));
});

check("a doc with benefits 2 and 3 flattens into the export row", () => {
  const doc = emptyPropositionDoc("ben-2-3");
  doc.name = "Cooling oil";
  doc.category = "Hair oils";
  doc.f1.declaredAttribute = "Soft hair";
  doc.f1.declaredAttribute2 = "Fragrance that lasts";
  doc.f1.declaredAttribute3 = "No residue feel";
  const row = flattenProposition(doc);
  assert.equal(row["f1.declaredAttribute"], "Soft hair");
  assert.equal(row["f1.declaredAttribute2"], "Fragrance that lasts");
  assert.equal(row["f1.declaredAttribute3"], "No residue feel");
});

check("research hash changes when benefit 2 or 3 is filled", () => {
  const base = emptyPropositionDoc("k");
  base.f1.declaredAttribute = "Soft hair";
  const h1 = researchHashFor(base);
  const with2 = structuredClone(base);
  with2.f1.declaredAttribute2 = "Fragrance that lasts";
  const h2 = researchHashFor(with2);
  assert.notEqual(h1, h2, "attribute 2 must affect research hash");
  const with3 = structuredClone(with2);
  with3.f1.declaredAttribute3 = "No residue feel";
  const h3 = researchHashFor(with3);
  assert.notEqual(h2, h3, "attribute 3 must affect research hash");
});

console.log(`PASS testBenefitsExtraExport — ${checks} checks`);
process.exit(0);

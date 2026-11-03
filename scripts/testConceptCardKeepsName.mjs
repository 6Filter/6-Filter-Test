/**
 * A concept-card upload stores the file name before extraction.
 * A missing model key returns extractError and leaves the typed row in place.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
process.env.REQUIRE_AUTH = "false";

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const form = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(form, /ideaDescription: doc\.ideaDescription/);
assert.match(form, /SUBMITTER_DEPARTMENTS\.map/);
assert.doesNotMatch(form, /setConceptCardName\(""\)/);
assert.match(form, /advisoryChecks\?\.\[spec\.key\]/);

const created = await createProposition({ submitterDepartment: "R&D" });
const evidence = {
  name: "qa-evidence.csv",
  mediaType: "text/csv",
  data: Buffer.from("evidence,cooling feel\n", "utf8").toString("base64"),
};
const typed = await updateProposition(
  created.id,
  {
    name: "Live Check herbal cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil for summer scalp comfort.",
    submitterName: "Live Tester",
    submitterDepartment: "R&D",
    f1: { declaredAttribute: "cooling feel", evidenceSourceFile: evidence },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, mrpInr: "105.90", grammage: "10g" },
  },
  { writer: "server" }
);
assert.equal(typed.name, "Live Check herbal cooling hair oil");

const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionConceptCard(
  { method: "POST", user: { department: "R&D", role: "ADMIN" } },
  res,
  created.id,
  {
    readBody: async () => ({
      attachment: {
        name: "qa-concept-card.csv",
        mediaType: "text/csv",
        data: Buffer.from("Category,Hair oils\nIdea,Herbal cooling hair oil\n", "utf8").toString("base64"),
      },
    }),
    sendJson(response, status, body) {
      response.statusCode = status;
      response.body = body;
      response.end(JSON.stringify(body));
    },
    redactSecrets: (message) => String(message || ""),
  }
);

assert.equal(res.statusCode, 200);
const body = JSON.parse(res.body);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.match(body.extractError, /API key/);
const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.f1.declaredAttribute, "cooling feel");
assert.equal(stored.f1.evidenceSourceFile.name, "qa-evidence.csv");
assert.equal(stored.f1.evidenceSourceFile.data, evidence.data);
assert.equal(stored.name, "Live Check herbal cooling hair oil");
assert.equal(stored.category, "Hair oils");
assert.equal(stored.ideaDescription, "A herbal cooling hair oil for summer scalp comfort.");
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.mrpInr, "105.90");
assert.equal(stored.submitterName, "Live Tester");
assert.equal(stored.submitterDepartment, "R&D");

console.log("PASS concept card keeps the file name when extraction fails");

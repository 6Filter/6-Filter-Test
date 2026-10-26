/**
 * A concept card keeps its file name when extraction fails, and does not
 * replace the idea already on the row.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.REQUIRE_AUTH;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const created = await createProposition({ submitterDepartment: "NPD" });
const evidence = Buffer.from("evidence,note\nkept,yes\n").toString("base64");
await updateProposition(
  created.id,
  {
    name: "Live Check herbal cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil for daily scalp comfort.",
    submitterName: "Live Tester",
    submitterDepartment: "NPD",
    f1: {
      declaredAttribute: "cooling",
      evidenceSourceFile: { name: "qa-evidence.csv", mediaType: "text/csv", data: evidence },
    },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, mrpInr: 105.9, grammage: "10g" },
  },
  { writer: "server" }
);

const csv = Buffer.from("category,idea\nHair oils,Herbal cooling hair oil\n").toString("base64");
const res = { statusCode: 0, body: null, end() {} };
await handlePropositionConceptCard(
  { method: "POST", user: { department: "NPD" } },
  res,
  created.id,
  {
    readBody: async () => ({
      attachment: { name: "qa-concept-card.csv", mediaType: "text/csv", data: csv },
      provider: "claude",
    }),
    sendJson(target, status, body) {
      target.statusCode = status;
      target.body = body;
      target.end(JSON.stringify(body));
    },
    redactSecrets: (message) => String(message || ""),
  }
);

assert.equal(res.statusCode, 200);
assert.equal(res.body.conceptCardName, "qa-concept-card.csv");
assert.match(String(res.body.extractError || ""), /API key/i);

const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.name, "Live Check herbal cooling hair oil");
assert.equal(stored.category, "Hair oils");
assert.equal(stored.ideaDescription, "A herbal cooling hair oil for daily scalp comfort.");
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.mrpInr, 105.9);
assert.equal(stored.f1.evidenceSourceFile.name, "qa-evidence.csv");
assert.equal(stored.f1.evidenceSourceFile.data, evidence);
assert.equal(stored.f1.declaredAttribute, "cooling");

console.log("PASS concept card keeps the file name and the typed idea");

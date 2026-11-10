/**
 * A concept-card upload keeps the file name and the typed row
 * when the reader has no API key.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
process.env.REQUIRE_AUTH = "false";

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const created = await createProposition({ submitterDepartment: "R&D" });
const evidence = {
  name: "qa-evidence.csv",
  mediaType: "text/csv",
  data: Buffer.from("source,note\nbrief,kept\n").toString("base64"),
};
await updateProposition(
  created.id,
  {
    name: "Concept card keep name",
    category: "Hair oils",
    ideaDescription: "Herbal cooling hair oil.",
    submitterName: "Live Tester",
    submitterDepartment: "R&D",
    f1: { declaredAttribute: "cooling feel", evidenceSourceFile: evidence },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, grammage: "10g" },
  },
  { writer: "server" }
);

const csv = Buffer.from("category,idea\nHair oils,Herbal cooling hair oil\n").toString("base64");
const res = { statusCode: 0, body: null };
function sendJson(response, status, body) {
  response.statusCode = status;
  response.body = body;
}
await handlePropositionConceptCard(
  {
    method: "POST",
    user: {},
    body: {
      attachment: { name: "qa-concept-card.csv", mediaType: "text/csv", data: csv },
      provider: "claude",
    },
  },
  res,
  created.id,
  { readBody: async (req) => req.body, sendJson, redactSecrets: (m) => m }
);

assert.equal(res.statusCode, 200);
assert.match(String(res.body.extractError || ""), /API key/i);
assert.equal(res.body.conceptCardName, "qa-concept-card.csv");

const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.name, "Concept card keep name");
assert.equal(stored.category, "Hair oils");
assert.equal(stored.ideaDescription, "Herbal cooling hair oil.");
assert.equal(stored.submitterName, "Live Tester");
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.netMarginAtScale, 22);
assert.equal(stored.f2.gstRatePct, 18);
assert.equal(stored.f2.grammage, "10g");
assert.equal(stored.f1.evidenceSourceFile.name, "qa-evidence.csv");
assert.equal(stored.f1.declaredAttribute, "cooling feel");

const form = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8")
);
assert.match(form, /data\.extractError/);
assert.doesNotMatch(
  form.slice(form.indexOf("async function handleConceptCardFile"), form.indexOf("function setTop")),
  /setConceptCardName\(""\)/
);

console.log("PASS concept card keeps its file name when reading fails");

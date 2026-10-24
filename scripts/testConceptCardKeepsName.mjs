/**
 * A concept card keeps its file name when extraction cannot run.
 * Typed fields and an evidence file already on the row stay put.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
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

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const cardFn = formSrc.slice(formSrc.indexOf("async function handleConceptCardFile"), formSrc.indexOf("function setTop"));
assert.doesNotMatch(cardFn, /setConceptCardName\(""\)/);
assert.doesNotMatch(cardFn, /setDoc\(mergeProposition\(data\.proposition\)\)/);
assert.match(cardFn, /extractError/);
assert.match(cardFn, /conceptCardName: data\.conceptCardName/);

const evidence = {
  name: "qa-evidence.csv",
  mediaType: "text/csv",
  data: Buffer.from("source,date\nNielsen,2024\n").toString("base64"),
};
const created = await createProposition({ submitterDepartment: "NPD" });
await updateProposition(
  created.id,
  {
    name: "Keep this name",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil.",
    f1: { declaredAttribute: "cooling feel", evidenceSourceFile: evidence },
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, mrpInr: 105.9, grammage: "10g" },
  },
  { writer: "server" }
);

const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionConceptCard(
  { method: "POST", user: { department: "NPD" } },
  res,
  created.id,
  {
    readBody: async () => ({
      attachment: {
        name: "qa-concept-card.csv",
        mediaType: "text/csv",
        data: Buffer.from("category,Hair oils\n").toString("base64"),
      },
    }),
    sendJson(response, status, body) {
      response.statusCode = status;
      response.body = JSON.stringify(body);
    },
    redactSecrets: (message) => String(message || ""),
  }
);

const body = JSON.parse(res.body);
assert.equal(res.statusCode, 200);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.match(body.extractError, /API key/i);
const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(stored.f1.evidenceSourceFile.name, evidence.name);
assert.equal(stored.f1.evidenceSourceFile.data, evidence.data);
assert.equal(stored.f1.declaredAttribute, "cooling feel");
assert.equal(stored.name, "Keep this name");
assert.equal(stored.category, "Hair oils");
assert.equal(stored.ideaDescription, "A herbal cooling hair oil.");
assert.equal(stored.f2.cogsAtScale, 70);
assert.equal(stored.f2.mrpInr, 105.9);

console.log("PASS concept card keeps qa-concept-card.csv when extraction has no key");

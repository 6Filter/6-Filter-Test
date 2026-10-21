/**
 * A concept card keeps its file name when extraction has no model key,
 * and the open row's typed fields stay put.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-concept-card-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEPT_API_KEY_NPD;
delete process.env.REQUIRE_AUTH;

const { createProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
const uploadStart = formSrc.indexOf("async function handleConceptCardFile");
const uploadEnd = formSrc.indexOf("function setTop", uploadStart);
const uploadFn = formSrc.slice(uploadStart, uploadEnd);
assert.equal(uploadFn.includes('setConceptCardName("")'), false);
assert.match(uploadFn, /conceptCardName: storedName/);
assert.doesNotMatch(uploadFn, /setDoc\(mergeProposition\(data\.proposition\)\)/);

const created = await createProposition({ submitterDepartment: "NPD" });
const named = await updateProposition(
  created.id,
  {
    name: "Live Check herbal cooling hair oil",
    category: "Hair oils",
    ideaDescription: "A herbal cooling hair oil for daily scalp comfort.",
    submitterName: "Live Tester",
    submitterDepartment: "NPD",
    f2: { cogsAtScale: 70, netMarginAtScale: 22, gstRatePct: 18, mrpInr: 105.9, grammage: "10g" },
  },
  { writer: "server" }
);
assert.equal(named.f1?.conceptCardName || "", "");

const csv = "Category,Idea\nHair oils,Herbal cooling hair oil\n";
const res = { statusCode: 0, body: "", end(value) { this.body = value; } };
await handlePropositionConceptCard(
  { method: "POST", user: { department: "NPD" } },
  res,
  created.id,
  {
    readBody: async () => ({
      provider: "claude",
      attachment: {
        name: "qa-concept-card-21oct.csv",
        mediaType: "text/csv",
        data: Buffer.from(csv).toString("base64"),
      },
    }),
    sendJson(response, status, body) {
      response.statusCode = status;
      response.end(JSON.stringify(body));
    },
    redactSecrets: (message) => String(message || ""),
  }
);

assert.equal(res.statusCode, 200);
const body = JSON.parse(res.body);
assert.match(String(body.extractError || ""), /API key/i);
assert.equal(body.conceptCardName, "qa-concept-card-21oct.csv");
assert.equal(body.proposition.name, "Live Check herbal cooling hair oil");
assert.equal(body.proposition.category, "Hair oils");
assert.match(body.proposition.ideaDescription, /herbal cooling hair oil/);
assert.equal(body.proposition.f2.cogsAtScale, 70);
assert.equal(body.proposition.f2.mrpInr, 105.9);

const stored = await getPropositionById(created.id);
assert.equal(stored.f1.conceptCardName, "qa-concept-card-21oct.csv");
assert.equal(stored.name, "Live Check herbal cooling hair oil");
assert.equal(stored.f2.grammage, "10g");
assert.equal(stored.f2.netMarginAtScale, 22);

console.log("PASS concept card keeps qa-concept-card-21oct.csv when extraction has no key");

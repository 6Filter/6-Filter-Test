/**
 * A concept card keeps its file name when extraction cannot run,
 * and does not replace the fields already on the row.
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

const { createProposition, deleteProposition, getPropositionById, updateProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(formSrc, /conceptCardName: keptName/);
assert.match(formSrc, /data\.extractError/);
assert.doesNotMatch(formSrc, /setConceptCardName\(""\)/);
const cardFn = formSrc.slice(formSrc.indexOf("async function handleConceptCardFile"), formSrc.indexOf("function setTop"));
assert.doesNotMatch(cardFn, /setDoc\(mergeProposition\(data\.proposition\)\)/);

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
  res.end(JSON.stringify(body));
}

const created = await createProposition({ submitterDepartment: "NPD" });
try {
  await updateProposition(
    created.id,
    {
      name: "Keep me",
      category: "Hair oils",
      ideaDescription: "A herbal cooling hair oil",
      f2: { cogsAtScale: 70, netMarginAtScale: 22, mrpInr: 105.9, grammage: "10g" },
    },
    { writer: "server" }
  );
  const csv = Buffer.from("category,Hair oils\nidea,herbal cooling hair oil\n", "utf8").toString("base64");
  const res = { statusCode: 0, body: null, end() {} };
  await handlePropositionConceptCard(
    {
      method: "POST",
      user: { department: "NPD" },
      body: {
        provider: "claude",
        attachment: { name: "qa-concept-card-27oct.csv", mediaType: "text/csv", data: csv },
      },
    },
    res,
    created.id,
    { readBody: async (req) => req.body, sendJson, redactSecrets: (message) => String(message || "") }
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.conceptCardName, "qa-concept-card-27oct.csv");
  assert.match(String(res.body.extractError || ""), /API key|Could not read/i);
  const stored = await getPropositionById(created.id);
  assert.equal(stored.f1.conceptCardName, "qa-concept-card-27oct.csv");
  assert.equal(stored.name, "Keep me");
  assert.equal(stored.category, "Hair oils");
  assert.match(stored.ideaDescription, /herbal cooling hair oil/);
  assert.equal(stored.f2.cogsAtScale, 70);
  assert.equal(stored.f2.mrpInr, 105.9);
  assert.equal(stored.division, "");
} finally {
  await deleteProposition(created.id, "NPD");
}

console.log("PASS concept card keeps the file name when extraction fails");

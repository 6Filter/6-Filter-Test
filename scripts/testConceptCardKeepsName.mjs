/**
 * A concept-card upload keeps the file name when the model key is missing.
 * Typed fields on the row are not cleared.
 */
import assert from "node:assert/strict";

process.env.REQUIRE_AUTH = "false";
delete process.env.ANTHROPIC_API_KEY;

import { createProposition, deleteProposition, getPropositionById } from "../lib/db.js";
import { handlePropositionConceptCard } from "../lib/propositionsApi.js";

function sendJson(res, status, body) {
  res.statusCode = status;
  res.body = body;
}

const created = await createProposition({ submitterDepartment: "R&D" });
try {
  await (await import("../lib/db.js")).updateProposition(created.id, {
    name: "Keep me",
    category: "Hair oils",
    ideaDescription: "Cooling hair oil",
    submitterName: "Live Tester",
    submitterDepartment: "R&D",
    f2: { cogsAtScale: "70", netMarginAtScale: "22", gstRatePct: "18" },
  });

  const res = { statusCode: 0, body: null };
  const req = {
    method: "POST",
    user: { department: "Open" },
    body: {
      attachment: {
        name: "qa-concept-card.csv",
        mediaType: "text/csv",
        data: Buffer.from("category,Hair oils\n", "utf8").toString("base64"),
      },
      provider: "claude",
    },
  };
  await handlePropositionConceptCard(req, res, created.id, {
    readBody: async () => req.body,
    sendJson,
    redactSecrets: (message) => String(message || ""),
  });

  assert.equal(res.statusCode, 200);
  assert.match(String(res.body?.extractError || ""), /API key missing/i);
  assert.equal(res.body?.conceptCardName, "qa-concept-card.csv");
  const stored = await getPropositionById(created.id);
  assert.equal(stored.f1?.conceptCardName, "qa-concept-card.csv");
  assert.equal(stored.name, "Keep me");
  assert.equal(stored.category, "Hair oils");
  assert.equal(stored.ideaDescription, "Cooling hair oil");
  assert.equal(String(stored.f2?.cogsAtScale), "70");
  assert.equal(stored.division, "");
} finally {
  await deleteProposition(created.id);
}

console.log("PASS concept card keeps its file name when reading fails");

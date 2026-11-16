/**
 * The same hair-oil numbers score once, whether the stored division is blank
 * or Personal Care. An uploaded shelf MRP is kept. A concept-card name is
 * stored before the model is asked to read the file.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PRIMUS_DATA_DIR = mkdtempSync(path.join(tmpdir(), "primus-stable-"));
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.ANTHROPIC_API_KEY;
process.env.REQUIRE_AUTH = "false";

const { divisionForScore } = await import("../lib/divisionForScore.js");
const { computeAllAdvisoryChecks } = await import("../lib/propositionScoring.js");
const { previewAdvisoryChecks, scoreAdvisoryChecks } = await import("../lib/goNoGo.js");
const { formatMinimumMarginHint } = await import("../lib/divisionMargin.js");
const { createImportedDraft } = await import("../lib/ideaImportApi.js");
const { getPropositionById, createProposition } = await import("../lib/db.js");
const { handlePropositionConceptCard } = await import("../lib/propositionsApi.js");

const hair = {
  name: "Live Check herbal cooling hair oil",
  category: "Hair oils",
  ideaDescription: "A light hair oil with menthol and amla that cools the scalp in summer.",
  f1: {
    declaredAttribute: "Cools the scalp for hours",
    benchmark: "Parachute Advansed",
    declaredGap: 3,
    growthRoute: "penetration",
    growthArgument: "Summer occasions bring new buyers.",
  },
  f2: {
    cogsAtScale: 70,
    netMarginAtScale: 22,
    gstRatePct: 18,
    grammage: "10g",
    qcomTrajectory: "flat",
    mrpInr: 105.89,
  },
};

assert.equal(divisionForScore(hair), "Personal Care");
assert.equal(divisionForScore({ ...hair, division: "Foods" }), "Foods");
assert.match(formatMinimumMarginHint(hair), /Personal Care: 50%/);

const blank = await computeAllAdvisoryChecks({ ...hair, division: "" });
const personal = await computeAllAdvisoryChecks({ ...hair, division: "Personal Care" });
const preview = previewAdvisoryChecks({ ...hair, division: "" });
assert.equal(blank.f2.checkLabel, "Marked down");
assert.equal(personal.f2.checkLabel, blank.f2.checkLabel);
assert.equal(preview.f2.checkLabel, blank.f2.checkLabel);
assert.match(preview.f2.items.map((item) => item.text).join(" "), /below the 50% minimum for Personal Care/);
assert.equal(scoreAdvisoryChecks(blank).pct, scoreAdvisoryChecks(personal).pct);
assert.equal(scoreAdvisoryChecks(preview).pct, scoreAdvisoryChecks(blank).pct);

const imported = await createImportedDraft(
  {
    fields: {
      name: "Imported shelf price oil",
      category: "Hair oils",
      ideaDescription: "A cooling hair oil.",
      "f2.cogsAtScale": 70,
      "f2.netMarginAtScale": 22,
      "f2.gstRatePct": 18,
      "f2.grammage": "10g",
      "f2.mrpInr": 149,
    },
    fieldSources: { "f2.mrpInr": { source: "upload", cell: "H2" } },
  },
  { name: "Live Tester", team: "R&D" }
);
assert.equal(imported.f2.mrpOverride, true);
assert.equal(imported.f2.mrpInr, 149);
const reloaded = await getPropositionById(imported.id);
assert.equal(reloaded.f2.mrpInr, 149);
assert.equal(reloaded.division, "");

const cardRow = await createProposition({ submitterDepartment: "R&D" });
const sent = [];
await handlePropositionConceptCard(
  {
    method: "POST",
    user: { department: "R&D", role: "ADMIN", name: "Live Tester" },
    body: {
      attachment: {
        name: "qa-concept-card.csv",
        mediaType: "text/csv",
        data: Buffer.from("category: Hair oils\n").toString("base64"),
      },
      provider: "claude",
    },
  },
  { statusCode: 0, end(value) { sent.push(value); } },
  cardRow.id,
  {
    readBody: async (req) => req.body,
    sendJson: (res, status, body) => {
      res.statusCode = status;
      sent.push(body);
    },
    redactSecrets: (message) => String(message || ""),
  }
);
const body = sent.at(-1);
assert.equal(body.conceptCardName, "qa-concept-card.csv");
assert.match(body.extractError || "", /API key/i);
const kept = await getPropositionById(cardRow.id);
assert.equal(kept.f1.conceptCardName, "qa-concept-card.csv");
assert.equal(kept.name, "");

const apiSrc = readFileSync(new URL("../lib/propositionsApi.js", import.meta.url), "utf8");
const formSrc = readFileSync(new URL("../src/PropositionForm.jsx", import.meta.url), "utf8");
assert.match(apiSrc, /conceptCardName[\s\S]{0,400}extractConceptCardFields/);
assert.doesNotMatch(formSrc, /setConceptCardName\(""\)/);

console.log("PASS score stays put, shelf MRP kept, concept-card name kept");

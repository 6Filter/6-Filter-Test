/**
 * Part 138 B/G — concept-card grounding: a value the AI "extracts" survives only if the document
 * text actually contains it. Runs the real extractor over a generated Word, PDF and Excel file
 * (LLM stubbed to also return invented values), plus the pure grounding function on mocked text.
 */
import assert from "node:assert/strict";

import { setCallLlmStub } from "./installCallLlmStub.mjs";

import { Document, Packer, Paragraph, TextRun } from "docx";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";

const { extractConceptCardFields, groundConceptCardFields, normalizeForMatch } = await import(
  "../lib/filters/extractConceptCard.js"
);

let checks = 0;
async function check(name, fn) {
  try {
    await fn();
    checks += 1;
  } catch (e) {
    e.message = `${name}: ${e.message}`;
    throw e;
  }
}

const STATED = {
  category: "Hair oils",
  ideaDescription: "Herbal cooling hair oil with pearl extract",
  benchmark: "Dabur Amla 90ml",
  declaredAttribute: "Cooling relief for scalp heat",
  declaredGap: 4,
};
const LINES = [
  `Category: ${STATED.category}`,
  `Idea: ${STATED.ideaDescription}`,
  `Benchmark: ${STATED.benchmark}`,
  `Attribute: ${STATED.declaredAttribute}`,
  `Declared gap: ${STATED.declaredGap} points`,
];

// What a careless model returns: every stated value PLUS invented ones.
const INVENTED = {
  benchmark: "Parachute Advansed Jasmine 200ml", // brand never mentioned
  declaredAttribute: "Clinically proven dandruff removal", // claim never made
  declaredGap: 9, // number never stated
};

function stubModel(reply) {
  setCallLlmStub(async () => ({ text: JSON.stringify(reply) }));
}

// ---------------------------------------------------------------- file builders
async function wordFile() {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: "Concept card", bold: true })] }),
          ...LINES.map((line) => new Paragraph(line)),
        ],
      },
    ],
  });
  const buf = await Packer.toBuffer(doc);
  return {
    name: "card.docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    data: Buffer.from(buf).toString("base64"),
  };
}

function pdfFile() {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument();
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () =>
      resolve({
        name: "card.pdf",
        mediaType: "application/pdf",
        data: Buffer.concat(chunks).toString("base64"),
      })
    );
    pdf.on("error", reject);
    pdf.fontSize(12).text("Concept card");
    for (const line of LINES) pdf.text(line);
    pdf.end();
  });
}

function excelFile() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Category", STATED.category],
      ["Idea", STATED.ideaDescription],
      ["Benchmark", STATED.benchmark],
      ["Attribute", STATED.declaredAttribute],
      ["Declared gap", STATED.declaredGap],
    ]),
    "Concept"
  );
  return {
    name: "card.xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    data: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })).toString("base64"),
  };
}

const files = {
  Word: await wordFile(),
  PDF: await pdfFile(),
  Excel: excelFile(),
};

// ---------------------------------------------------------- real files, stubbed model
for (const [kind, attachment] of Object.entries(files)) {
  await check(`${kind}: stated values are kept, values not in the document are dropped`, async () => {
    stubModel({ ...STATED, ...INVENTED });
    const out = await extractConceptCardFields({ attachment });
    // Invented values never reach the form.
    assert.equal(out.benchmark, undefined, "invented benchmark must be dropped");
    assert.equal(out.declaredAttribute, undefined, "invented attribute must be dropped");
    assert.equal(out.declaredGap, undefined, "invented gap must be dropped");
    // The model's other values were never in the file either (the file states different ones).
    // Only values the document really contains survive.
    assert.equal(out.category, STATED.category);
    assert.equal(out.ideaDescription, STATED.ideaDescription);
    assert.deepEqual(
      [...out.grounding.droppedKeys].sort(),
      ["benchmark", "declaredAttribute", "declaredGap"].sort()
    );
    assert.equal(out.grounding.droppedCount, 3);
  });

  await check(`${kind}: every stated value survives when the model is honest`, async () => {
    stubModel(STATED);
    const out = await extractConceptCardFields({ attachment });
    for (const [k, v] of Object.entries(STATED)) assert.equal(out[k], v, `${kind} ${k}`);
    assert.equal(out.grounding.droppedCount, 0);
    for (const k of Object.keys(STATED)) {
      assert.equal(out.grounding.provenance[k].aiSuggested, true, `${k} stays an AI suggestion to confirm`);
    }
  });

  await check(`${kind}: a model that returns only invented values yields nothing`, async () => {
    stubModel({
      category: "Frozen pizza",
      ideaDescription: "Self-heating pizza box with lunar crust",
      benchmark: "Domino's Pan Deluxe",
      declaredAttribute: "Cooks in 30 seconds",
      declaredGap: 7,
    });
    const out = await extractConceptCardFields({ attachment });
    assert.deepEqual({ ...out }, {});
    assert.equal(out.grounding.droppedCount, 5);
  });
}

// ----------------------------------------------------------- pure grounding on mocked text
const TEXT = `Concept card
Category: Hair oils
Idea: Herbal cooling hair oil with pearl extract
Benchmark: Dabur Amla 90 ml
Expected gap 3.5 points on the 10-pt scale; trial cost ₹1,250 per outlet.`;

await check("pure: punctuation and case do not defeat a real match", () => {
  const { kept, droppedKeys } = groundConceptCardFields(
    { category: "HAIR OILS", benchmark: "dabur amla 90ml".replace("90ml", "90 ml"), ideaDescription: "Herbal, cooling hair-oil with pearl extract!" },
    TEXT
  );
  assert.deepEqual(droppedKeys, []);
  assert.equal(Object.keys(kept).length, 3);
});

await check("pure: values not in the text are dropped and counted", () => {
  const out = groundConceptCardFields(
    { category: "Hair oils", benchmark: "Parachute Gold", declaredAttribute: "Anti-dandruff", ideaDescription: "Pearl extract oil that cures baldness" },
    TEXT
  );
  assert.deepEqual(Object.keys(out.kept), ["category"]);
  assert.deepEqual(out.droppedKeys.sort(), ["benchmark", "declaredAttribute", "ideaDescription"]);
  assert.equal(out.droppedCount, 3);
});

await check("pure: declared gap needs its number in the text (whole number, not a fragment)", () => {
  assert.equal(groundConceptCardFields({ declaredGap: 3.5 }, TEXT).droppedCount, 0);
  assert.equal(groundConceptCardFields({ declaredGap: "3.5" }, TEXT).droppedCount, 0);
  assert.equal(groundConceptCardFields({ declaredGap: 9 }, TEXT).droppedCount, 1);
  // 1 appears only inside 1,250 and 10-pt; a bare 1 is not stated
  assert.equal(groundConceptCardFields({ declaredGap: 1 }, TEXT).droppedCount, 1);
  assert.equal(groundConceptCardFields({ declaredGap: 0 }, TEXT).droppedCount, 1);
});

await check("pure: empty document grounds nothing; empty fields are dropped", () => {
  const out = groundConceptCardFields({ category: "Hair oils", benchmark: "" }, "");
  assert.deepEqual(out.kept, {});
  assert.equal(out.droppedCount, 2);
  assert.equal(groundConceptCardFields({}, TEXT).droppedCount, 0);
});

await check("normalizeForMatch ignores punctuation, case and spacing", () => {
  assert.equal(normalizeForMatch("  Dabur-Amla,  90 ML! "), "dabur amla 90 ml");
});

await check("unreadable file → clear error, no model call", async () => {
  let called = false;
  setCallLlmStub(async () => {
    called = true;
    return { text: "{}" };
  });
  await assert.rejects(() => extractConceptCardFields({}), /Upload a concept-card/);
  assert.equal(called, false);
});

console.log(`PASS testPart138ConceptCardGrounding (${checks} checks)`);
process.exit(0);

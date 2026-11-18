/**
 * Part 140 D — Word and PDF idea uploads. A "Field name: answer" document is read with no AI call;
 * a free-form one gets exactly ONE PRIMUS_IDEA_IMPORT call (no web search) and only values the file
 * states are kept.
 */
import assert from "node:assert/strict";
import { Document, Packer, Paragraph } from "docx";
import PDFDocument from "pdfkit";
import { clearCallLlmStub, setCallLlmStub } from "./installCallLlmStub.mjs";

const { importIdeasFromAttachment, IDEA_IMPORT_LLM_LABEL } = await import("../lib/ideaImport.js");

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

async function wordFile(lines, name = "idea.docx") {
  const doc = new Document({ sections: [{ children: lines.map((l) => new Paragraph(l)) }] });
  const buf = await Packer.toBuffer(doc);
  return {
    name,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    data: Buffer.from(buf).toString("base64"),
  };
}

function pdfFile(lines, name = "idea.pdf") {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument();
    const chunks = [];
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve({ name, mediaType: "application/pdf", data: Buffer.concat(chunks).toString("base64") }));
    pdf.on("error", reject);
    for (const line of lines) pdf.fontSize(12).text(line);
    pdf.end();
  });
}

const user = { id: "u1", email: "bm@example.com", name: "Asha", team: "PC" };
const LABELLED = [
  "Proposition name: Herbal cooling hair oil",
  "Category: Hair oils",
  "Idea description: A light oil with menthol and amla.",
  "Benchmark: Dabur Amla 90 ml",
  "Declared gap: 3",
  "GST rate: 18%",
];

// A model call here is a failure: labelled documents must not need one.
let calls = [];
function stub(reply) {
  calls = [];
  setCallLlmStub(async (opts) => {
    calls.push(opts);
    if (reply instanceof Error) throw reply;
    return { text: JSON.stringify(reply) };
  });
}

await check("labelled Word file: read without any AI call", async () => {
  stub(new Error("must not be called"));
  const out = await importIdeasFromAttachment({ attachment: await wordFile(LABELLED), user });
  assert.equal(calls.length, 0);
  assert.equal(out.usedAi, false);
  assert.equal(out.ideas.length, 1);
  const idea = out.ideas[0];
  assert.equal(idea.fields.name, "Herbal cooling hair oil");
  assert.equal(idea.fields.category, "Hair oils");
  assert.equal(idea.fields["f1.benchmark"], "Dabur Amla 90 ml");
  assert.equal(idea.fields["f1.declaredGap"], 3);
  assert.equal(idea.fields["f2.gstRatePct"], 18);
  assert.equal(idea.fieldSources.name.source, "upload");
  assert.match(idea.fieldSources.name.cell, /^line \d+$/);
  for (const present of ["Proposition name", "Category", "Idea description"]) {
    assert.ok(!idea.missingRequired.includes(present), `${present} is present`);
  }
  assert.ok(!idea.missingRequired.some((l) => /name$|team/i.test(l) && /your|team/i.test(l)), "Part 145: name and team are not boxes");
});

await check("labelled PDF: read without any AI call", async () => {
  stub(new Error("must not be called"));
  const out = await importIdeasFromAttachment({ attachment: await pdfFile(LABELLED), user });
  assert.equal(calls.length, 0);
  assert.equal(out.ideas.length, 1);
  assert.equal(out.ideas[0].fields["f1.benchmark"], "Dabur Amla 90 ml");
  assert.equal(out.ideas[0].fields["f2.gstRatePct"], 18);
});

await check("two ideas in one labelled Word file", async () => {
  stub(new Error("must not be called"));
  const out = await importIdeasFromAttachment({
    attachment: await wordFile([...LABELLED, "", "Proposition name: Protein bar", "Category: Snacks", "Idea description: A 20 g protein bar."]),
    user,
  });
  assert.equal(out.ideas.length, 2);
  assert.equal(out.ideas[1].fields.name, "Protein bar");
});

const PROSE = [
  "We want to launch a Herbal cooling hair oil for hot summers.",
  "It would sit in Hair oils and compete with Dabur Amla 90 ml.",
  "The pack would be 100 ml.",
];

await check("free-form Word: ONE labelled call, no web search, invented values dropped", async () => {
  stub({
    ideas: [
      {
        name: "Herbal cooling hair oil",
        category: "Hair oils",
        benchmark: "Dabur Amla 90 ml",
        grammage: "100 ml",
        declaredAttribute: "Clinically proven dandruff removal", // never stated
        declaredGap: 9, // never stated
        mrpInr: 249, // never stated
      },
    ],
  });
  const out = await importIdeasFromAttachment({ attachment: await wordFile(PROSE), user });
  assert.equal(calls.length, 1, "exactly one model call");
  assert.equal(calls[0].label, IDEA_IMPORT_LLM_LABEL);
  assert.equal(calls[0].label, "PRIMUS_IDEA_IMPORT");
  assert.equal(calls[0].useWebSearch, false);
  assert.match(calls[0].system, /PRIMUS_IDEA_IMPORT/);
  assert.equal(out.usedAi, true);
  const idea = out.ideas[0];
  assert.deepEqual(Object.keys(idea.fields).sort(), ["category", "f1.benchmark", "f2.grammage", "name"]);
  // mrpInr is system-filled (Part 145 D106) and no longer an import column, so it is not read at all.
  assert.deepEqual(idea.dropped.sort(), ["f1.declaredAttribute", "f1.declaredGap", "mrpInr"]);
  assert.equal(idea.fieldSources.name.aiSuggested, true, "AI-read values are marked");
  assert.ok(idea.missingRequired.includes("Idea description"), "the AI is not asked to fill what the file does not say");
});

await check("free-form PDF goes the same way", async () => {
  stub({ ideas: [{ name: "Herbal cooling hair oil", benchmark: "Parachute Gold 200 ml" }] });
  const out = await importIdeasFromAttachment({ attachment: await pdfFile(PROSE), user });
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(out.ideas[0].fields), ["name"], "a competitor the file never names is dropped");
  assert.deepEqual(out.ideas[0].dropped, ["f1.benchmark"]);
});

await check("a few labels (<3): labels win, the AI only adds what the file states", async () => {
  stub({ ideas: [{ name: "Something else entirely", category: "Hair oils", benchmark: "Dabur Amla 90 ml" }] });
  const out = await importIdeasFromAttachment({
    attachment: await wordFile(["Proposition name: Herbal cooling hair oil", "Category: Hair oils", ...PROSE]),
    user,
  });
  assert.equal(calls.length, 1);
  const f = out.ideas[0].fields;
  assert.equal(f.name, "Herbal cooling hair oil", "the person's own label beats the AI");
  assert.equal(f["f1.benchmark"], "Dabur Amla 90 ml");
  assert.equal(out.ideas[0].fieldSources.name.aiSuggested, undefined);
});

await check("model failure on a free-form file is a rejected row, not a crash", async () => {
  stub(new Error("upstream down"));
  const out = await importIdeasFromAttachment({ attachment: await wordFile(PROSE), user });
  assert.equal(out.ideas.length, 0);
  assert.equal(out.rejected.length, 1);
  assert.match(out.rejected[0].reason, /could not be read automatically/);
});

await check("an image or unknown file is refused in plain words", async () => {
  await assert.rejects(
    importIdeasFromAttachment({ attachment: { name: "x.png", data: Buffer.from("x").toString("base64"), mediaType: "image/png" }, user }),
    (e) => e.status === 400 && /Excel, Word or PDF/.test(e.message)
  );
});

clearCallLlmStub();
console.log(`testIdeaImportWordPdf: ${checks} checks passed`);

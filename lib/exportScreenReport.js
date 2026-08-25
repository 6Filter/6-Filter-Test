import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import PDFDocument from "pdfkit";
import { hideFilterTalk } from "./publicCopy.js";
import { deriveMoves, gateCardsFor, heroVerdict, scoreOutOf100 } from "./weightage/deriveMoves.js";

function txt(value, fallback = "—") {
  const s = hideFilterTalk(String(value ?? "").replace(/\s+/g, " ").trim());
  return s || fallback;
}

function isProcess(result) {
  return result?.ideaType === "process" || Boolean(result?.efficiency && result?.feasibility);
}

function overallPassFail(result) {
  if (result?.overallVerdict === "CLEARED") return { label: "Passed" };
  if (result?.overallVerdict === "FAIL") return { label: "Failed" };
  if (result?.overallVerdict === "NEEDS_INPUT") return { label: "Needs input" };
  const max = Number(result?.phase1Max) > 0 ? Number(result.phase1Max) : isProcess(result) ? 40 : 60;
  const pts = Number(result?.phase1) || 0;
  const approvedCut = (40 / 60) * max;
  const promisingCut = (30 / 60) * max;
  if (pts > approvedCut) return { label: "Passed" };
  if (pts >= promisingCut) return { label: "Needs input" };
  return { label: "Failed" };
}

function datedLine(result) {
  const ts = Number(result?.ts);
  const d = Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
  return `Generated ${d.toLocaleString("en-IN")}`;
}

export function buildReportSections(result) {
  const process = isProcess(result);
  const sections = [];
  sections.push({
    heading: "6 Filter Test — screen report",
    body: [datedLine(result)],
  });
  sections.push({
    heading: "Idea",
    body: [txt(result.idea).slice(0, 2500)],
  });

  if (process) {
    const verdict = overallPassFail(result);
    sections.push({
      heading: "Verdict",
      body: [
        `${verdict.label} · Phase 1 ${Number(result.phase1 || 0).toFixed(1)} / ${result.phase1Max || 40}`,
        txt(result.oneLiner || result.analysisSummary),
      ],
    });
    sections.push({
      heading: "Scores",
      body: [
        `Efficiency ${txt(result.efficiency?.score)} · ${txt(result.efficiency?.rationale)}`,
        `Feasibility ${txt(result.feasibility?.score)} · ${txt(result.feasibility?.rationale)}`,
        `Scalability ${txt(result.scalability?.score)} · ${txt(result.scalability?.rationale)}`,
      ],
    });
    if (result.analysisSummary) {
      sections.push({ heading: "Analysis", body: [txt(result.analysisSummary).slice(0, 2000)] });
    }
    return sections;
  }

  const hero = heroVerdict(result);
  const score = scoreOutOf100(result);
  const npd = result.npdInputs || {};
  sections.push({
    heading: "Verdict",
    body: [
      `${hero.word} · ${score}/100 · ${txt(result.overallVerdict, "")}`.replace(/\s·\s$/, ""),
      txt(result.oneLiner || result.analysisSummary),
      [
        npd.pricePerUnit != null ? `Price ₹${npd.pricePerUnit}` : null,
        npd.division || null,
        result.gramClass || result.ideaWeight || null,
      ]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
  });

  const cards = gateCardsFor(result);
  if (cards.length) {
    sections.push({
      heading: "Checks 1–4",
      body: cards.map(
        (c) => `${c.n} ${c.title} — ${c.badge}. ${txt(c.metric)}. ${txt(c.detail)}`
      ),
    });
  }

  const moves = deriveMoves({
    filter1: result.filter1,
    filter2: result.filter2,
    filter3: result.filter3,
    filter4: result.filter4,
  });
  if (moves.length) {
    sections.push({
      heading: "What would change the verdict",
      body: moves.map((m) => `${m.tag}: ${m.text}`),
    });
  }

  sections.push({
    heading: "Scorecard",
    body: [
      `Novelty ${txt(result.novelty?.score)} · ${txt(result.novelty?.rationale)}`,
      `Relevance ${txt(result.market?.score)} · ${txt(result.market?.rationale)}`,
      `Evidence ${txt(result.evidence?.score)} · ${txt(result.evidence?.rationale)}`,
      result.tamValuation ? `TAM: ${result.tamValuation}` : null,
      result.revenuePotentialRange || result.revenuePotentialCrores != null
        ? `Revenue: ${result.revenuePotentialRange || `${result.revenuePotentialCrores} Cr`}`
        : null,
      result.analysisSummary ? txt(result.analysisSummary).slice(0, 2000) : null,
    ].filter(Boolean),
  });

  return sections;
}

function slugName(result) {
  const id = String(result.id || "report").slice(0, 8);
  return `6-filter-test-${id}`;
}

function headingParagraph(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 120 },
  });
}

function bodyParagraph(line) {
  return new Paragraph({
    children: [new TextRun({ text: String(line), size: 22 })],
    spacing: { after: 80 },
  });
}

export async function buildDocxBuffer(result) {
  const sections = buildReportSections(result);
  const children = [];
  for (const block of sections) {
    children.push(headingParagraph(block.heading));
    for (const line of block.body) {
      children.push(bodyParagraph(line));
    }
  }
  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  const packed = await Packer.toBuffer(doc);
  return Buffer.isBuffer(packed) ? packed : Buffer.from(packed);
}

export async function buildPdfBuffer(result) {
  const sections = buildReportSections(result);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    for (const block of sections) {
      doc.font("Helvetica-Bold").fontSize(14).text(block.heading, { paragraphGap: 6 });
      doc.font("Helvetica").fontSize(11);
      for (const line of block.body) {
        doc.text(String(line), { paragraphGap: 8, width: 495 });
      }
      doc.moveDown(0.6);
    }
    doc.end();
  });
}

export function exportFilename(result, format) {
  const ext = format === "docx" ? "docx" : "pdf";
  return `${slugName(result)}.${ext}`;
}

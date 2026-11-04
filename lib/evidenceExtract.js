/**
 * Part 131 — evidence document extraction with ranked passages and hostile-file guards.
 * Reuses exceljs/mammoth/unpdf; never uses the SheetJS xlsx package.
 */
import { createHash } from "node:crypto";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import {
  EVIDENCE_EXTRACT_CHARS,
  EVIDENCE_FILE_MAX_BYTES,
} from "./lockedConstants.js";

const MAX_ZIP_ENTRIES = 200;
const MAX_UNCOMPRESSED = 40 * 1024 * 1024;
const PARSE_MS = 20_000;
const ZIP_LOCAL_HEADER_SIZE = 30; // PKZIP local file header fixed size

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function tidy(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function sniffEvidenceMagic(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "pdf";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return "zip"; // docx/xlsx
  const head = buffer.slice(0, 256).toString("utf8");
  if (/^\s*</.test(head) && /html/i.test(head)) return "html";
  if (/^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]+$/u.test(head.slice(0, 80)) && (head.includes(",") || head.includes("\t"))) {
    return "csv";
  }
  return null;
}

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(httpError(400, `${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Light zip bomb guard for OOXML (docx/xlsx). */
export function assertSafeZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer[0] !== 0x50 || buffer[1] !== 0x4b) return;
  let entries = 0;
  let uncompressed = 0;
  let offset = 0;
  while (offset + ZIP_LOCAL_HEADER_SIZE <= buffer.length && entries < MAX_ZIP_ENTRIES + 1) {
    if (buffer[offset] !== 0x50 || buffer[offset + 1] !== 0x4b) break;
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // local file header
    const comp = buffer.readUInt16LE(offset + 8);
    const uncompSize = buffer.readUInt32LE(offset + 22);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);
    const compSize = buffer.readUInt32LE(offset + 18);
    entries += 1;
    uncompressed += uncompSize;
    if (entries > MAX_ZIP_ENTRIES) {
      throw httpError(400, "That archive has too many entries to read safely.");
    }
    if (uncompressed > MAX_UNCOMPRESSED) {
      throw httpError(400, "That archive expands too large to read safely.");
    }
    // Store (0) or deflate (8) only — encrypted bit
    if (comp & 0x1 || (buffer[offset + 6] & 0x1) === 0x1) {
      throw httpError(400, "Password-protected files cannot be read. Remove the password and upload again.");
    }
    offset += ZIP_LOCAL_HEADER_SIZE + nameLen + extraLen + compSize;
  }
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9₹%]+/i)
    .filter((t) => t.length > 2);
}

function scorePassage(passage, seeds) {
  const words = new Set(tokenize(passage));
  let hit = 0;
  for (const s of seeds) {
    if (words.has(s)) hit += 1;
    else if (passage.toLowerCase().includes(s)) hit += 0.5;
  }
  // Prefer passages with numbers/tables for category size
  if (/\d/.test(passage)) hit += 0.25;
  if (/₹|rs\.?|crore|cr\b|market size|cagr|nielsen|kantar/i.test(passage)) hit += 0.5;
  return hit;
}

/**
 * Split whole document into passages and keep the highest-overlap ones up to budget.
 */
export function rankPassages(fullText, { idea = "", category = "", benchmark = "", attributes = [] } = {}, budget = EVIDENCE_EXTRACT_CHARS) {
  const text = tidy(fullText);
  if (!text) return { text: "", pagesApprox: 0, selected: 0, total: 0 };
  const seeds = tokenize([idea, category, benchmark, ...(attributes || [])].join(" "));
  const chunks = text
    .split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)
    .map((c) => tidy(c))
    .filter((c) => c.length > 40);
  const pool = chunks.length ? chunks : [text];
  const ranked = pool
    .map((p, i) => ({ p, i, score: scorePassage(p, seeds) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);

  const kept = [];
  let used = 0;
  for (const row of ranked) {
    if (used >= budget) break;
    const slice = row.p.slice(0, Math.min(row.p.length, budget - used));
    kept.push({ i: row.i, text: slice });
    used += slice.length + 2;
  }
  kept.sort((a, b) => a.i - b.i);
  const out = kept.map((k) => k.text).join("\n\n");
  return {
    text: out,
    pagesApprox: Math.max(1, Math.round(text.length / 3000)),
    selected: kept.length,
    total: pool.length,
    fullLength: text.length,
  };
}

async function extractPdf(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return tidy(Array.isArray(text) ? text.join("\n") : text);
}

async function extractDocx(buffer) {
  assertSafeZip(buffer);
  const out = await mammoth.extractRawText({ buffer });
  return tidy(out?.value);
}

async function extractXlsx(buffer) {
  assertSafeZip(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const parts = [];
  let rows = 0;
  let cells = 0;
  workbook.eachSheet((sheet) => {
    const lines = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows += 1;
      if (rows > 5000) throw httpError(400, "That spreadsheet has too many rows to read.");
      const vals = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        cells += 1;
        if (cells > 50_000) throw httpError(400, "That spreadsheet has too many cells to read.");
        const text = cell.text != null && cell.text !== "" ? cell.text : cell.value;
        vals.push(String(text ?? "").trim());
      });
      if (vals.length) lines.push(vals.join("\t"));
    });
    const body = tidy(lines.join("\n"));
    if (body) parts.push(`Sheet ${sheet.name}:\n${body}`);
  });
  return tidy(parts.join("\n\n"));
}

function extractCsv(buffer) {
  const lines = buffer.toString("utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length > 5000) throw httpError(400, "That CSV has too many rows to read.");
  return tidy(lines.join("\n"));
}

function extractHtml(buffer) {
  const raw = buffer.toString("utf8");
  return tidy(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
  );
}

/**
 * @returns {{ kind, text, ranked, sha256, unreadable?, reason?, advice?, pdfDocument? }}
 */
export async function extractEvidenceBuffer(buffer, { name = "", mime = "", ideaContext = {} } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { kind: null, text: "", ranked: null, unreadable: true, reason: "empty file", advice: "Upload a PDF, Word (.docx), Excel (.xlsx), or CSV." };
  }
  if (buffer.length > EVIDENCE_FILE_MAX_BYTES) {
    return {
      kind: null,
      text: "",
      ranked: null,
      unreadable: true,
      reason: "file exceeds 8 MB",
      advice: "Upload a smaller file.",
    };
  }

  const magic = sniffEvidenceMagic(buffer);
  const lower = String(name || "").toLowerCase();
  if (/\.xls$/i.test(lower) && !/\.xlsx$/i.test(lower)) {
    return {
      kind: "xls",
      text: "",
      ranked: null,
      unreadable: true,
      reason: "legacy .xls",
      advice: "Save as .xlsx and upload again.",
    };
  }
  if (/\.doc$/i.test(lower) && !/\.docx$/i.test(lower)) {
    return {
      kind: "doc",
      text: "",
      ranked: null,
      unreadable: true,
      reason: "legacy .doc",
      advice: "Save as .docx and upload again.",
    };
  }

  let kind = magic;
  if (magic === "zip") {
    if (/\.docx$/i.test(lower) || /wordprocessingml/i.test(mime)) kind = "docx";
    else if (/\.xlsx?/i.test(lower) || /spreadsheetml/i.test(mime)) kind = "xlsx";
    else kind = "docx"; // try docx first
  }
  if (!kind) {
    return {
      kind: null,
      text: "",
      ranked: null,
      unreadable: true,
      reason: "unsupported file type",
      advice: "Upload a PDF, Word (.docx), Excel (.xlsx), or CSV.",
    };
  }

  try {
    let text = "";
    if (kind === "pdf") text = await withTimeout(extractPdf(buffer), PARSE_MS, "PDF parse");
    else if (kind === "docx") text = await withTimeout(extractDocx(buffer), PARSE_MS, "Word parse");
    else if (kind === "xlsx") text = await withTimeout(extractXlsx(buffer), PARSE_MS, "Excel parse");
    else if (kind === "csv") text = extractCsv(buffer);
    else if (kind === "html") text = extractHtml(buffer);
    else if (kind === "zip") {
      try {
        text = await withTimeout(extractDocx(buffer), PARSE_MS, "Word parse");
        kind = "docx";
      } catch {
        text = await withTimeout(extractXlsx(buffer), PARSE_MS, "Excel parse");
        kind = "xlsx";
      }
    }

    const ranked = rankPassages(text, ideaContext, EVIDENCE_EXTRACT_CHARS);
    const sha256 = sha256Buffer(buffer);
    if (!ranked.text && kind === "pdf") {
      return {
        kind,
        text: "",
        ranked,
        sha256,
        unreadable: false,
        pdfDocument: true,
        reason: "little extractable text — will send PDF pages to the model",
      };
    }
    if (!ranked.text) {
      return {
        kind,
        text: "",
        ranked,
        sha256,
        unreadable: true,
        reason: "no readable text in file",
        advice: "Upload a text-based PDF, Word, or Excel, or paste a readable link.",
      };
    }
    return { kind, text: ranked.text, ranked, sha256, unreadable: false };
  } catch (e) {
    const msg = String(e?.message || "could not read file");
    return {
      kind,
      text: "",
      ranked: null,
      sha256: sha256Buffer(buffer),
      unreadable: true,
      reason: msg.slice(0, 160),
      advice: /password/i.test(msg)
        ? "Remove the password and upload again."
        : "Try a different export (PDF/DOCX/XLSX) or upload again.",
    };
  }
}

/** Normalise quote/text for verification (case, whitespace, punctuation). */
export function normalizeEvidenceText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9₹%.\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function quoteFoundInText(quote, extractedText) {
  const q = normalizeEvidenceText(quote);
  if (!q || q.length < 8) return false;
  const hay = normalizeEvidenceText(extractedText);
  return hay.includes(q);
}

export function figuresInQuote(figure, quote) {
  if (figure == null || figure === "") return true;
  const q = String(quote || "");
  const n = Number(figure);
  if (!Number.isFinite(n)) {
    return q.toLowerCase().includes(String(figure).toLowerCase());
  }
  const variants = [
    String(n),
    String(n).replace(/\.0+$/, ""),
    n.toLocaleString("en-IN"),
    n.toLocaleString("en-US"),
  ];
  return variants.some((v) => q.includes(v));
}

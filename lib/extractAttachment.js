import { sanitizeImageBase64, sniffImageMediaType } from "./mediaType.js";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import ExcelJS from "exceljs";

const MAX_EXTRACT_CHARS = 12_000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_SHEET_ROWS = 2000;
const MAX_SHEET_CELLS = 20_000;
const IMAGE_PLACEHOLDER =
  "(Idea attached as an image — transcribe and score the concept in the file.)";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function classifyAttachment(att) {
  const name = String(att?.name || "").toLowerCase();
  const mime = String(att?.mediaType || att?.type || "").toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic|heif|tif|tiff|avif|svg)$/i.test(name)) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("wordprocessingml") || mime.includes("officedocument.word") || name.endsWith(".docx")) {
    return "docx";
  }
  if (mime === "application/msword" || name.endsWith(".doc")) return "doc";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv" ||
    /\.(xlsx?|xlsm|csv)$/i.test(name)
  ) {
    return "xlsx";
  }
  return "unknown";
}

function decodeBuffer(att) {
  const data = String(att?.data || "").replace(/\s/g, "");
  if (!data) throw httpError(400, "The uploaded file was empty.");
  const buffer = Buffer.from(data, "base64");
  if (buffer.length > MAX_UPLOAD_BYTES) throw httpError(413, "The uploaded file is too large.");
  return buffer;
}

function tidy(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractPdfText(buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return tidy(Array.isArray(text) ? text.join("\n") : text);
}

async function extractDocxText(buffer) {
  const out = await mammoth.extractRawText({ buffer });
  return tidy(out?.value);
}

async function extractDocText(buffer) {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  return tidy(doc?.getBody?.() || "");
}

function extractCsvText(buffer) {
  const lines = buffer.toString("utf8").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > MAX_SHEET_ROWS) {
    throw httpError(400, "That spreadsheet has too many rows to screen. Upload a smaller sheet.");
  }
  let cells = 0;
  for (const line of lines) {
    cells += line.split(",").length;
    if (cells > MAX_SHEET_CELLS) {
      throw httpError(400, "That spreadsheet has too many cells to screen. Upload a smaller sheet.");
    }
  }
  return tidy(lines.join("\n"));
}

async function extractSpreadsheetText(buffer, name = "") {
  if (/\.csv$/i.test(name)) return extractCsvText(buffer);
  if (/\.xls$/i.test(name) && !/\.xlsx$/i.test(name) && !/\.xlsm$/i.test(name)) {
    throw httpError(400, "Save this spreadsheet as .xlsx and upload it again.");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const parts = [];
  let rows = 0;
  let cells = 0;
  workbook.eachSheet((sheet) => {
    const lines = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      rows += 1;
      const vals = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        cells += 1;
        const text = cell.text != null && cell.text !== "" ? cell.text : cell.value;
        vals.push(String(text ?? "").trim());
      });
      if (vals.length) lines.push(vals.join(","));
    });
    const text = tidy(lines.join("\n"));
    if (text) parts.push(workbook.worksheets.length > 1 ? `Sheet ${sheet.name}:\n${text}` : text);
  });
  if (rows > MAX_SHEET_ROWS || cells > MAX_SHEET_CELLS) {
    throw httpError(400, "That spreadsheet has too many rows to screen. Upload a smaller sheet.");
  }
  return tidy(parts.join("\n\n"));
}

/**
 * Turn optional typed idea + optional upload into the idea string and LLM media.
 * Images stay as vision. PDFs go as documents (plus extracted text). Word and Excel are text-only.
 */
export async function prepareIdeaInput(ideaText, attachment) {
  const typed = String(ideaText || "").trim();
  if (!attachment?.data) {
    return { idea: typed, image: null };
  }

  const kind = classifyAttachment(attachment);
  if (kind === "unknown") {
    throw httpError(400, "Upload a PDF, Word (.doc / .docx), Excel (.xls / .xlsx), or image.");
  }

  const mediaType = String(attachment.mediaType || "").trim();
  const name = attachment.name || `upload.${kind}`;

  if (kind === "image") {
    const data = sanitizeImageBase64(attachment.data);
    if (!data) throw httpError(400, "The uploaded image was empty.");
    const media = sniffImageMediaType(data, name, mediaType);
    console.error(
      `[primus/image] name=${name} declared=${mediaType || "none"} sniffed=${media} b64_chars=${data.length}`
    );
    return {
      idea: typed || IMAGE_PLACEHOLDER,
      image: {
        name,
        mediaType: media,
        data,
        kind: "image",
      },
    };
  }

  let extracted = "";
  try {
    const buffer = decodeBuffer(attachment);
    if (kind === "pdf") extracted = await extractPdfText(buffer);
    else if (kind === "docx") extracted = await extractDocxText(buffer);
    else if (kind === "xlsx") extracted = await extractSpreadsheetText(buffer, name);
    else extracted = await extractDocText(buffer);
  } catch (e) {
    if (e?.status) throw e;
    throw httpError(
      400,
      `Could not read the uploaded file. ${e?.message || "Try a text PDF, Word, Excel, or paste the idea."}`
    );
  }

  if (extracted.length > MAX_EXTRACT_CHARS) {
    extracted = `${extracted.slice(0, MAX_EXTRACT_CHARS)}\n\n[Document truncated for screening.]`;
  }

  const labelled = extracted
    ? `--- Uploaded document (${name}) ---\n${extracted}`
    : "";
  const idea = typed && labelled ? `${typed}\n\n${labelled}` : typed || labelled;

  if (!idea && kind !== "pdf") {
    throw httpError(
      400,
      "That file had no readable text. Paste the idea, or upload a text-based PDF, Word, or Excel file."
    );
  }

  return {
    idea: idea || IMAGE_PLACEHOLDER.replace("image", "document"),
    image:
      kind === "pdf"
        ? {
            name,
            mediaType: "application/pdf",
            data: attachment.data,
            kind: "pdf",
          }
        : null,
  };
}

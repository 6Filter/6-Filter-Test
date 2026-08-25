import { sanitizeImageBase64, sniffImageMediaType } from "./mediaType.js";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";

const MAX_EXTRACT_CHARS = 12_000;
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
  return "unknown";
}

function decodeBuffer(att) {
  const data = String(att?.data || "").replace(/\s/g, "");
  if (!data) throw httpError(400, "The uploaded file was empty.");
  return Buffer.from(data, "base64");
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

/**
 * Turn optional typed idea + optional upload into the idea string and LLM media.
 * Images stay as vision. PDFs go as documents (plus extracted text). Word is text-only.
 */
export async function prepareIdeaInput(ideaText, attachment) {
  const typed = String(ideaText || "").trim();
  if (!attachment?.data) {
    return { idea: typed, image: null };
  }

  const kind = classifyAttachment(attachment);
  if (kind === "unknown") {
    throw httpError(400, "Upload a PDF, Word document (.doc / .docx), or image.");
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
    else extracted = await extractDocText(buffer);
  } catch (e) {
    if (e?.status) throw e;
    throw httpError(
      400,
      `Could not read the uploaded file. ${e?.message || "Try a text PDF, .docx, or paste the idea."}`
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
      "That file had no readable text. Paste the idea, or upload a text-based PDF / Word file."
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

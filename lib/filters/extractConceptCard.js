import { prepareIdeaInput } from "../extractAttachment.js";
import { callLlm } from "../callLlm.js";
import { parseStrictJson } from "../llmJson.js";

const KEYS = ["declaredAttribute", "benchmark", "declaredGap", "category", "ideaDescription"];

const SYSTEM =
  "You extract fields that a concept-card document actually states. Return ONLY minified JSON:\n" +
  '{"declaredAttribute":null,"benchmark":null,"declaredGap":null,"category":null,"ideaDescription":null}\n' +
  "Rules:\n" +
  "- Copy only values the document explicitly states. Never infer, never invent, never complete a missing field.\n" +
  "- If a field is not named or quoted in the document, set it to null.\n" +
  "- declaredAttribute is a consumer-language USP the document names.\n" +
  "- benchmark is a named brand / variant / pack the document names.\n" +
  "- declaredGap is a numeric gap on a 10-pt scale only if the document states a number.\n" +
  "- category is the product category the document names.\n" +
  "- ideaDescription is a short product idea the document states, not a paraphrase you wrote.\n" +
  "- Do not search the web. Use only the uploaded text.";

function cleanText(value) {
  const s = String(value ?? "").replace(/\s+/g, " ").trim();
  return s || null;
}

function cleanGap(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : cleanText(value);
}

/** Lower case, punctuation ignored, spaces collapsed. */
export function normalizeForMatch(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function numberAppearsIn(value, documentText) {
  const candidates = new Set();
  const n = Number(value);
  if (Number.isFinite(n)) {
    candidates.add(String(n));
    candidates.add(n.toFixed(1));
  }
  const raw = String(value ?? "").trim();
  if (raw) candidates.add(raw);
  const doc = String(documentText ?? "").replace(/(\d),(?=\d{3}\b)/g, "$1");
  for (const cand of candidates) {
    const esc = cand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\d.])${esc}(?!\\d|\\.\\d)`).test(doc)) return true;
  }
  return false;
}

/**
 * Part 138 B — grounding. A suggested value stays only if its normalized text appears in the document text;
 * a declared gap stays only if its number appears. Everything else is dropped and counted.
 * @returns {{ kept: object, droppedKeys: string[], droppedCount: number, provenance: object }}
 */
export function groundConceptCardFields(fields = {}, documentText = "") {
  const docNorm = normalizeForMatch(documentText);
  const kept = {};
  const droppedKeys = [];
  const provenance = {};
  for (const [key, value] of Object.entries(fields || {})) {
    const numeric = key === "declaredGap" && (typeof value === "number" || /^-?\d+(?:\.\d+)?$/.test(String(value).trim()));
    const v = normalizeForMatch(value);
    const ok = numeric ? numberAppearsIn(value, documentText) : Boolean(v) && docNorm.includes(v);
    if (ok) {
      kept[key] = value;
      provenance[key] = { source: "concept-card", aiSuggested: true };
    } else {
      droppedKeys.push(key);
    }
  }
  return { kept, droppedKeys, droppedCount: droppedKeys.length, provenance };
}

/**
 * Pull stated concept-card fields. Missing keys stay omitted so chips never invent.
 */
export async function extractConceptCardFields({ attachment, provider = "claude" } = {}) {
  if (!attachment?.data) {
    const err = new Error("Upload a concept-card PDF, Word, or Excel file.");
    err.status = 400;
    throw err;
  }

  const prepared = await prepareIdeaInput("", attachment);
  const idea = String(prepared?.idea || "").trim();
  if (!idea) {
    const err = new Error("That file had no readable text to extract.");
    err.status = 400;
    throw err;
  }

  const { text, stopReason, contentTypes } = await callLlm({
    provider,
    system: SYSTEM,
    userText: `CONCEPT CARD TEXT:\n${idea.slice(0, 10000)}\n\nExtract only stated fields. Null for anything not written.`,
    image: prepared.image,
    useWebSearch: false,
    maxTokens: 800,
    temperature: 0,
  });

  const parsed = parseStrictJson(text, { label: "concept-card", stopReason, contentTypes });
  const out = {};
  for (const key of KEYS) {
    const raw = parsed?.[key];
    const value = key === "declaredGap" ? cleanGap(raw) : cleanText(raw);
    if (value != null) out[key] = value;
  }
  // Part 138 B — keep a suggestion only when the document text actually contains it.
  const grounded = groundConceptCardFields(out, idea);
  const result = { ...grounded.kept };
  Object.defineProperty(result, "grounding", {
    value: {
      droppedCount: grounded.droppedCount,
      droppedKeys: grounded.droppedKeys,
      provenance: grounded.provenance,
    },
    enumerable: false,
  });
  return result;
}

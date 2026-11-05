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

const STATED_LABELS = [
  [/^(category)$/i, "category"],
  [/^(idea|idea description|description|product idea)$/i, "ideaDescription"],
  [/^(benchmark|benchmark brand)$/i, "benchmark"],
  [/^(declared attribute|declared attribute 1|attribute|usp)$/i, "declaredAttribute"],
  [/^(declared gap|gap)$/i, "declaredGap"],
];

function splitStatedLine(line) {
  const raw = String(line || "").trim();
  if (!raw) return [];
  if (raw.includes(":") && !raw.includes(",")) {
    const idx = raw.indexOf(":");
    return [raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()].filter(Boolean);
  }
  return raw.split(/[,|\t]/).map((cell) => cell.trim()).filter(Boolean);
}

/**
 * Fields a concept card writes as a label plus a value. Nothing is inferred.
 * Used when the model cannot be called, so an uploaded card still yields what it states.
 */
export function statedFieldsFromConceptText(text) {
  const out = {};
  for (const line of String(text || "").split(/\n/)) {
    const cells = splitStatedLine(line);
    if (cells.length < 2) continue;
    for (const [re, key] of STATED_LABELS) {
      if (out[key] != null || !re.test(cells[0])) continue;
      const value = key === "declaredGap" ? cleanGap(cells[1]) : cleanText(cells[1]);
      if (value != null) out[key] = value;
    }
  }
  return out;
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

  let parsed = null;
  try {
    const { text, stopReason, contentTypes } = await callLlm({
      provider,
      system: SYSTEM,
      userText: `CONCEPT CARD TEXT:\n${idea.slice(0, 10000)}\n\nExtract only stated fields. Null for anything not written.`,
      image: prepared.image,
      useWebSearch: false,
      maxTokens: 800,
      temperature: 0,
    });
    parsed = parseStrictJson(text, { label: "concept-card", stopReason, contentTypes });
  } catch (err) {
    const stated = statedFieldsFromConceptText(idea);
    if (Object.keys(stated).length) return stated;
    throw err;
  }
  const out = {};
  for (const key of KEYS) {
    const raw = parsed?.[key];
    const value = key === "declaredGap" ? cleanGap(raw) : cleanText(raw);
    if (value != null) out[key] = value;
  }
  if (!Object.keys(out).length) {
    return statedFieldsFromConceptText(idea);
  }
  return out;
}

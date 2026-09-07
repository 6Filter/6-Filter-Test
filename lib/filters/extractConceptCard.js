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

/**
 * Pull stated concept-card fields. Missing keys stay omitted so chips never invent.
 */
export async function extractConceptCardFields({ attachment, provider = "claude" } = {}) {
  if (!attachment?.data) {
    const err = new Error("Upload a concept-card PDF or Word document.");
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
  return out;
}

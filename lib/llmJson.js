import { callLlm } from "./callLlm.js";
import { extractJsonObject, repairJson, repairTruncatedJson } from "./scoring.js";

export const JSON_FAIL = {
  truncated:
    "The AI's answer was cut off before it finished — retrying usually fixes this, it isn't about your idea being too long.",
  malformed:
    "The AI hit a tool-use hiccup formatting its answer — retrying should resolve it.",
};

export function jsonFail(kind, cause) {
  const message = kind === "truncated" ? JSON_FAIL.truncated : JSON_FAIL.malformed;
  const err = new Error(message);
  err.failureKind = kind === "truncated" ? "truncated" : "malformed";
  if (cause) err.cause = cause;
  return err;
}

export function logModelParseFailure({ label, stopReason, contentTypes, raw, extra }) {
  const types = Array.isArray(contentTypes) ? contentTypes : [];
  const snippet = String(raw ?? "");
  console.error(
    `[primus/json-fail] ${label} stop_reason=${stopReason ?? "null"} ` +
      `blocks=[${types.join(",") || "none"}] parser_input_chars=${snippet.length}` +
      (extra ? ` extra=${JSON.stringify(extra)}` : "")
  );
  console.error(`[primus/json-fail] ${label} parser_input=${snippet}`);
}

export function parseStrictJson(raw, { label, stopReason, contentTypes } = {}) {
  if (stopReason === "max_tokens") {
    logModelParseFailure({ label, stopReason, contentTypes, raw });
    throw jsonFail("truncated");
  }
  const text = String(raw || "");
  if (!text.trim()) {
    logModelParseFailure({ label, stopReason, contentTypes, raw: text });
    throw jsonFail("malformed");
  }

  const attempts = [text];
  try {
    attempts.push(extractJsonObject(text));
  } catch (e) {
    if (/truncated/i.test(e?.message || "")) {
      logModelParseFailure({ label, stopReason, contentTypes, raw: text });
      throw jsonFail("truncated", e);
    }
  }

  let lastErr;
  for (const candidate of attempts) {
    const variants = [candidate];
    try {
      variants.push(repairJson(candidate));
    } catch {
      /* skip */
    }
    try {
      variants.push(repairTruncatedJson(candidate));
    } catch {
      /* skip */
    }
    for (const jsonStr of variants) {
      try {
        const obj = JSON.parse(jsonStr);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
      } catch (e) {
        lastErr = e;
      }
    }
  }

  logModelParseFailure({ label, stopReason, contentTypes, raw: text });
  throw jsonFail("malformed", lastErr);
}

/**
 * Tool-enabled research (no JSON constraint), then a tool-free JSON-only call.
 * Never ask one call to both search and emit strict JSON.
 */
export async function researchThenJson({
  label,
  researchSystem,
  researchUser,
  jsonSystem,
  jsonUserSuffix = "",
  image = null,
  researchMaxTokens = 4096,
  jsonMaxTokens = 8192,
  maxUses = 4,
}) {
  const research = await callLlm({
    userText: researchUser,
    system: researchSystem,
    image,
    useWebSearch: true,
    maxTokens: researchMaxTokens,
    maxUses,
  });

  if (research.stopReason === "max_tokens") {
    logModelParseFailure({
      label: `${label}/research`,
      stopReason: research.stopReason,
      contentTypes: research.contentTypes,
      raw: research.text,
    });
    return {
      parsed: null,
      sources: research.sources || [],
      error: "truncated",
      stopReason: research.stopReason,
    };
  }

  const findings = String(research.text || "").trim();
  if (!findings) {
    logModelParseFailure({
      label: `${label}/research`,
      stopReason: research.stopReason,
      contentTypes: research.contentTypes,
      raw: research.text,
    });
    return { parsed: null, sources: research.sources || [], error: "empty" };
  }

  const sourcesNote = (research.sources || [])
    .map((s) => `${s.title || ""} ${s.url || ""}`.trim())
    .filter(Boolean)
    .join("\n");

  const structured = await callLlm({
    userText:
      `Research findings (do not search the web; structure only — do not invent numbers that were not found):\n\n` +
      `${findings}\n\n` +
      (sourcesNote ? `Cited sources:\n${sourcesNote}\n\n` : "") +
      jsonUserSuffix,
    system: jsonSystem,
    useWebSearch: false,
    maxTokens: jsonMaxTokens,
  });

  if (structured.stopReason === "max_tokens") {
    logModelParseFailure({
      label: `${label}/json`,
      stopReason: structured.stopReason,
      contentTypes: structured.contentTypes,
      raw: structured.text,
    });
    return {
      parsed: null,
      sources: research.sources || [],
      error: "truncated",
      stopReason: structured.stopReason,
    };
  }

  try {
    const parsed = parseStrictJson(structured.text, {
      label: `${label}/json`,
      stopReason: structured.stopReason,
      contentTypes: structured.contentTypes,
    });
    return { parsed, sources: research.sources || [], researchText: findings };
  } catch (e) {
    return {
      parsed: null,
      sources: research.sources || [],
      error: e?.failureKind === "truncated" ? "truncated" : "parse",
      stopReason: structured.stopReason,
    };
  }
}

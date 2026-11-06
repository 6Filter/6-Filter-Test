import { callLlm } from "./callLlm.js";
import { extractJsonObject, repairJson, repairTruncatedJson } from "./scoring.js";
import { researchTrace } from "./researchTrace.js";

/** Enough prose to structure even if the research call hit max_tokens mid-sentence. */
export function researchTextIsUsable(text) {
  return String(text || "").trim().length >= 400;
}

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
  image: _image = null,
  researchMaxTokens = 4096,
  jsonMaxTokens = 8192,
  maxUses = 4,
  researchTier = "heavy",
  structureTier = "light",
  callResearch = null,
  callStructure = null,
}) {
  // searchesUsed is usage.server_tool_use.web_search_requests from the model response, not maxUses.
  const searches = Number(maxUses) > 0;
  researchTrace("research-call", {
    label,
    input: String(researchUser || "").slice(0, 800),
    toolsRequested: searches,
  });

  const runResearch = callResearch || callLlm;
  const runStructure = callStructure || callLlm;
  const research = await runResearch({
    userText: researchUser,
    system: researchSystem,
    image: null,
    useWebSearch: searches,
    maxTokens: researchMaxTokens,
    maxUses: searches ? maxUses : 0,
    temperature: 0,
    tier: researchTier,
    label: label || "research",
  });

  researchTrace("research-call RAW RESPONSE", {
    label,
    stopReason: research.stopReason,
    contentTypes: research.contentTypes,
    textChars: String(research.text || "").length,
    content: research.content || research.text,
  });

  const findings = String(research.text || "").trim();
  if (research.stopReason === "max_tokens" && !researchTextIsUsable(findings)) {
    logModelParseFailure({
      label: `${label}/research`,
      stopReason: research.stopReason,
      contentTypes: research.contentTypes,
      raw: research.text,
    });
    researchTrace("research-call EMPTY", { label, error: "truncated", contentTypes: research.contentTypes });
    return {
      parsed: null,
      sources: research.sources || [],
      searchesUsed: Number(research.webSearchRequests) || 0,
      webSearchEnabled: searches,
      error: "truncated",
      stopReason: research.stopReason,
    };
  }

  if (!findings) {
    logModelParseFailure({
      label: `${label}/research`,
      stopReason: research.stopReason,
      contentTypes: research.contentTypes,
      raw: research.text,
    });
    researchTrace("research-call EMPTY", { label, error: "empty", contentTypes: research.contentTypes });
    return {
      parsed: null,
      sources: research.sources || [],
      searchesUsed: Number(research.webSearchRequests) || 0,
      webSearchEnabled: searches,
      error: "empty",
    };
  }

  const sourcesNote = (research.sources || [])
    .map((s) => `${s.title || ""} ${s.url || ""}`.trim())
    .filter(Boolean)
    .join("\n");

  const structureUser =
    `Research findings (do not search the web; structure only — do not invent numbers that were not found):\n\n` +
    `${findings}\n\n` +
    (sourcesNote ? `Cited sources:\n${sourcesNote}\n\n` : "") +
    jsonUserSuffix;

  researchTrace("structuring-call INPUT (from research)", { label, researchText: findings.slice(0, 2000) });

  const structured = await runStructure({
    userText: structureUser,
    system: jsonSystem,
    useWebSearch: false,
    maxTokens: jsonMaxTokens,
    temperature: 0,
    tier: structureTier,
    label: label ? `${label}-json` : "structure",
  });

  researchTrace("structuring-call RAW RESPONSE", {
    label,
    stopReason: structured.stopReason,
    contentTypes: structured.contentTypes,
    text: structured.text,
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
      searchesUsed: Number(research.webSearchRequests) || 0,
      webSearchEnabled: searches,
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
    researchTrace("final-parsed OUTPUT", { label, parsed });
    return {
      parsed,
      sources: research.sources || [],
      searchesUsed: Number(research.webSearchRequests) || 0,
      webSearchEnabled: searches,
      researchText: findings,
    };
  } catch (e) {
    researchTrace("final-parsed OUTPUT", {
      label,
      parsed: null,
      error: e?.failureKind === "truncated" ? "truncated" : "parse",
    });
    return {
      parsed: null,
      sources: research.sources || [],
      searchesUsed: Number(research.webSearchRequests) || 0,
      webSearchEnabled: searches,
      error: e?.failureKind === "truncated" ? "truncated" : "parse",
      stopReason: structured.stopReason,
    };
  }
}

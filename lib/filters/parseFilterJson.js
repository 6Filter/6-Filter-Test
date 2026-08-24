import { extractJsonObject, repairJson, repairTruncatedJson } from "../scoring.js";

export function parseFilterJson(raw) {
  const text = String(raw || "");
  const attempts = [text];
  try {
    attempts.push(extractJsonObject(text));
  } catch {
    /* fall through */
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
  throw lastErr || new Error("Could not parse filter JSON.");
}

export function mergeSources(modelSources, searchSources) {
  const out = [];
  const seen = new Set();
  for (const src of [...(Array.isArray(modelSources) ? modelSources : []), ...(searchSources || [])]) {
    const url = String(src?.url || "").trim();
    const title = String(src?.title || url).trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: title || url, url });
    if (out.length >= 8) break;
  }
  return out;
}

import { createHash } from "node:crypto";

function sha(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function canonNum(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stable key for “same query → same score”.
 * Uses typed/extracted idea, attachment bytes, NPD numbers, type, and model — not LLM output.
 * Numbers are coerced so "100" and 100 hash the same.
 */
export function screenFingerprint({ idea, image, ideaType, npd, provider }) {
  const payload = JSON.stringify({
    idea: String(idea || "").trim(),
    ideaType: ideaType === "process" ? "process" : "product",
    provider: String(provider || "claude").trim().toLowerCase(),
    price: canonNum(npd?.pricePerUnit),
    pointsBeat: canonNum(npd?.pointsBeat),
    benchmarkExists: Boolean(npd?.benchmarkExists),
    imageHash: image?.data ? sha(String(image.data).replace(/\s/g, "")) : null,
    imageKind: image?.mediaType || image?.kind || null,
  });
  return sha(payload);
}

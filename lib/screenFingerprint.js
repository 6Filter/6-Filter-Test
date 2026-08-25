import { createHash } from "node:crypto";

function sha(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

/**
 * Stable key for “same query → same score”.
 * Uses typed/extracted idea, attachment bytes, NPD numbers, type, and model — not LLM output.
 */
export function screenFingerprint({ idea, image, ideaType, npd, provider }) {
  const payload = JSON.stringify({
    idea: String(idea || "").trim(),
    ideaType: ideaType === "process" ? "process" : "product",
    provider: String(provider || "claude").trim().toLowerCase(),
    price: npd?.pricePerUnit ?? null,
    pointsBeat: npd?.pointsBeat ?? null,
    benchmarkExists: Boolean(npd?.benchmarkExists),
    imageHash: image?.data ? sha(String(image.data).replace(/\s/g, "")) : null,
    imageKind: image?.mediaType || image?.kind || null,
  });
  return sha(payload);
}

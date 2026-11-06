/** Part 138 F — test helper: stored web-check assessments that SUPPORT the given dimension ratings. */
import { buildF4Assessment } from "../lib/f4Assessment.js";

/** @param {Record<string,{risk:string}>} dimensions  @returns findings.f4-shaped `{ assessments }` */
export function supportedF4Findings(dimensions = {}) {
  const assessments = {};
  for (const [key, d] of Object.entries(dimensions || {})) {
    if (!d?.risk) continue;
    assessments[key] = buildF4Assessment({
      rating: d.risk,
      supported: true,
      source_url: "https://example.com/f4-source",
      quote: `${key} web-checked`,
      returnedSources: [{ url: "https://example.com/f4-source" }],
      webSearchEnabled: true,
      searchesUsed: 1,
    });
  }
  return { assessments };
}

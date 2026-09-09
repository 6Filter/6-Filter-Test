/**
 * Fingerprint-cached Category Sizing for the standalone HTTP endpoint.
 * Filter 1 still calls `runCategorySizing` directly (cached one level up in propositionsApi).
 */

import { getResearchCache, saveResearchCache } from "../db.js";
import {
  fingerprintCategorySizingInput,
  logResearchCacheLookup,
} from "../researchCache.js";
import { runCategorySizing } from "./runSizing.js";

/**
 * @param {object} inputs — same fields as `runCategorySizing` (resolved ideaText, not ideaId)
 * @param {{ runFn?: typeof runCategorySizing, persist?: boolean }} [opts]
 * @returns {Promise<{ parsed: object|null, error?: string, fromCache?: boolean }>}
 */
export async function getOrRunCategorySizing(inputs = {}, { runFn = runCategorySizing, persist = true } = {}) {
  const hash = fingerprintCategorySizingInput(inputs);

  try {
    const cached = await getResearchCache(hash);
    const parsed = cached?.researchFindings?.categorySizing;
    logResearchCacheLookup(hash, parsed ? cached : null);
    if (parsed && typeof parsed === "object") {
      return { parsed, fromCache: true };
    }
  } catch (e) {
    console.warn(`[primus/category-sizing] cache lookup failed: ${e.message || e}`);
    logResearchCacheLookup(hash, null);
  }

  const result = await runFn({ ...inputs, persist });
  if (result?.parsed) {
    try {
      await saveResearchCache(hash, {
        researchFindings: { categorySizing: result.parsed },
        sources: Array.isArray(result.parsed.sources) ? result.parsed.sources : [],
      });
    } catch (e) {
      console.warn(`[primus/category-sizing] cache save failed: ${e.message || e}`);
    }
  }
  return { ...result, fromCache: false };
}

export { fingerprintCategorySizingInput };

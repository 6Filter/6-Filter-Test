import { syndicatedPromptBlock, maxUsesForMatch } from "./syndicatedLookup.js";
import { scopedSearchInstruction } from "./scopedSearch.js";
import { resolveCategoryFamily } from "./categoryFamily.js";

export { maxUsesForMatch };

const DEFAULT_QUERY = "Nielsen Kantar category size competitors India";

/**
 * Append category-scoped local syndicated rows and search queries to a research
 * user prompt. Family is the only fallback; unrelated categories never enter context.
 * @returns {Promise<{ text: string, nielsenMatchedOn: string, kantarMatchedOn: string }>}
 */
export async function withCategoryScope(
  userText,
  { category = "", baseQuery = DEFAULT_QUERY, label = "research", brand = "" } = {}
) {
  const cat = String(category || "").trim();
  const family = resolveCategoryFamily(cat);
  const syndicated = await syndicatedPromptBlock("", { category: cat });
  const search = scopedSearchInstruction(baseQuery, cat, { brand });
  console.log(
    `[primus/search-scope] label=${label} category=${cat || "(none)"} family=${family || "(none)"} brand=${String(brand || "").trim() || "(none)"}`
  );
  return {
    text: `${String(userText || "").trim()}\n\n${syndicated.text}\n\n${search}`,
    nielsenMatchedOn: syndicated.nielsenMatchedOn,
    kantarMatchedOn: syndicated.kantarMatchedOn,
    nielsenAsOf: syndicated.nielsenAsOf || "",
    kantarAsOf: syndicated.kantarAsOf || "",
  };
}

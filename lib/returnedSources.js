/**
 * Part 133 — extract URLs from Anthropic web_search_tool_result blocks.
 * A source_url in the model's own JSON is ignored for citation; only these count.
 */
export function extractReturnedSourcesFromContent(content) {
  const sources = [];
  const seen = new Set();
  const push = (url, title) => {
    const href = String(url || "").trim();
    if (!href || seen.has(href)) return;
    seen.add(href);
    sources.push({ title: String(title || href).trim() || href, url: href });
  };

  for (const block of content || []) {
    if (block?.type === "web_search_tool_result") {
      const items = Array.isArray(block.content) ? block.content : [];
      for (const item of items) {
        if (item?.url) push(item.url, item.title);
        // Some payloads nest results
        if (Array.isArray(item?.content)) {
          for (const nested of item.content) {
            if (nested?.url) push(nested.url, nested.title);
          }
        }
      }
    }
    if (block?.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c?.url) push(c.url, c.title);
      }
    }
  }
  return sources;
}

export function extractReturnedSourcesFromLlmResult(result) {
  const fromBlocks = extractReturnedSourcesFromContent(result?.content || result?.rawContent || []);
  if (fromBlocks.length) return fromBlocks;
  const fallback = [];
  for (const list of [result?.sources, result?.webSearchSources, result?.citations]) {
    if (!Array.isArray(list)) continue;
    for (const s of list) {
      if (typeof s === "string" && s.trim()) fallback.push({ title: s.trim(), url: s.trim() });
      else if (s?.url) fallback.push({ title: String(s.title || s.url), url: String(s.url) });
    }
  }
  // Dedupe
  const seen = new Set();
  return fallback.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

export function returnedSourceUrls(sources) {
  return (Array.isArray(sources) ? sources : [])
    .map((s) => (typeof s === "string" ? s : s?.url))
    .map((u) => String(u || "").trim())
    .filter(Boolean);
}

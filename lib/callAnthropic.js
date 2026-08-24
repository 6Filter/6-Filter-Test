/**
 * Shared Anthropic Claude caller (server-side only).
 * Key never goes to the browser.
 */

function extractWebSearchSources(content) {
  const sources = [];
  const seen = new Set();
  const push = (title, url) => {
    const href = String(url || "").trim();
    if (!href || seen.has(href)) return;
    seen.add(href);
    sources.push({ title: String(title || href).trim() || href, url: href });
  };

  for (const block of content || []) {
    if (block?.type === "web_search_tool_result") {
      const items = Array.isArray(block.content) ? block.content : [];
      for (const item of items) {
        if (item?.url) push(item.title, item.url);
      }
    }
    if (block?.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c?.url) push(c.title, c.url);
      }
    }
  }
  return sources.slice(0, 8);
}

export async function callAnthropic({
  userText,
  system,
  image = null,
  useWebSearch = false,
  maxTokens,
}) {
  const rawKey =
    process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY || "";
  // Env paste mistakes (newlines / duplicated key) break HTTP headers
  const apiKey = String(rawKey).replace(/\r/g, "").split("\n").map((s) => s.trim()).filter(Boolean)[0] || "";
  const model = (
    process.env.ANTHROPIC_MODEL ||
    process.env.VITE_ANTHROPIC_MODEL ||
    "claude-sonnet-4-5-20250929"
  )
    .toString()
    .trim()
    .split(/\s+/)[0];

  if (!apiKey || apiKey.includes("your-key")) {
    const onVercel = Boolean(process.env.VERCEL);
    const err = new Error(
      onVercel
        ? "Claude API key missing. Set ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables (one line, no spaces), then Redeploy."
        : "Claude API key missing. Put your real key in .env.local as ANTHROPIC_API_KEY=sk-ant-... (replace the placeholder), then restart npm run dev."
    );
    err.status = 500;
    throw err;
  }

  if (!apiKey.startsWith("sk-ant-")) {
    const err = new Error(
      "ANTHROPIC_API_KEY looks invalid. Paste the key once as a single line (starts with sk-ant-)."
    );
    err.status = 500;
    throw err;
  }

  const userContent = image?.data
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: image.mediaType || "image/png",
            data: image.data,
          },
        },
        { type: "text", text: userText },
      ]
    : userText;

  const body = {
    model,
    max_tokens: Number(maxTokens) > 0 ? Number(maxTokens) : useWebSearch ? 4096 : 1200,
    temperature: 0,
    system,
    messages: [{ role: "user", content: userContent }],
  };

  if (useWebSearch) {
    body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    // Never echo secrets that might appear in provider errors
    const safe = errBody.replace(/sk-ant-[A-Za-z0-9\-_]+/g, "[redacted]").slice(0, 220);
    const err = new Error(`Claude API failed (${res.status}). ${safe}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text =
    data.content?.filter((b) => b.type === "text").map((b) => b.text).join("\n") ?? "";
  const sources = useWebSearch ? extractWebSearchSources(data.content) : [];
  return { text, sources };
}

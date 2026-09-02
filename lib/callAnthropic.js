/**
 * Shared Anthropic Claude caller (server-side only).
 * Key never goes to the browser.
 */

import { sanitizeImageBase64, sniffImageMediaType } from "./mediaType.js";
import { readProviderKey, readProviderModel } from "./llmContext.js";

/** Sonnet 5 / Opus 5 / Fable 5 reject temperature, top_p, top_k. */
function rejectsSamplingParams(model) {
  const id = String(model || "");
  return /claude-(sonnet-5|opus-5|fable-5|opus-4-[789]|sonnet-4-6)/.test(id);
}

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
  maxUses,
}) {
  // Only ANTHROPIC_API_KEY — never a VITE_ browser key or a second Anthropic alias.
  const apiKey = readProviderKey("claude");
  const model = readProviderModel("claude");

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

  const rawImageData = image?.data ? sanitizeImageBase64(image.data) : "";
  const imageMediaType = rawImageData
    ? sniffImageMediaType(rawImageData, image.name, image.mediaType)
    : null;

  const userContent = !rawImageData
    ? userText
    : image.kind === "pdf" || image.mediaType === "application/pdf"
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: rawImageData,
            },
          },
          { type: "text", text: userText },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageMediaType || "image/png",
              data: rawImageData,
            },
          },
          { type: "text", text: userText },
        ];

  // Thinking tokens count toward max_tokens on Sonnet 5 — leave room for the answer.
  const tokens = Number(maxTokens) > 0 ? Number(maxTokens) : useWebSearch ? 4096 : 2048;
  const body = {
    model,
    max_tokens: tokens,
    system,
    messages: [{ role: "user", content: userContent }],
  };
  if (!rejectsSamplingParams(model)) {
    body.temperature = 0;
  } else {
    body.output_config = { effort: "low" };
  }

  if (useWebSearch) {
    const uses = Number(maxUses) > 0 ? Math.min(8, Math.floor(Number(maxUses))) : 3;
    body.tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: uses,
        user_location: {
          type: "approximate",
          city: "Chennai",
          region: "Tamil Nadu",
          country: "IN",
          timezone: "Asia/Kolkata",
        },
      },
    ];
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(image?.kind === "pdf" || image?.mediaType === "application/pdf"
        ? { "anthropic-beta": "pdfs-2024-09-25" }
        : {}),
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
  const content = Array.isArray(data.content) ? data.content : [];
  const text =
    content.filter((b) => b.type === "text").map((b) => b.text).join("\n") ?? "";
  const sources = useWebSearch ? extractWebSearchSources(content) : [];
  return {
    text,
    sources,
    stopReason: data.stop_reason || null,
    contentTypes: content.map((b) => b?.type).filter(Boolean),
  };
}

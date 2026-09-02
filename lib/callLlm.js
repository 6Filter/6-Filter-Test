/**
 * Provider-agnostic LLM caller. Keys stay on the server.
 * Claude keeps native web search; other models run the same prompts without it.
 */
import { callAnthropic } from "./callAnthropic.js";
import { sanitizeImageBase64, sniffImageMediaType } from "./mediaType.js";
import {
  currentLlm,
  providerMeta,
  readProviderKey,
  readProviderModel,
} from "./llmContext.js";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
}

function missingKeyError(label) {
  return httpError(
    500,
    `${label} API key is not configured. Add it to .env.local (local) or Render → Environment, then restart / redeploy.`
  );
}

async function readErrorSnippet(res) {
  const raw = await res.text();
  return raw.slice(0, 280);
}

/** Groq free-plan gpt-oss models count max_tokens toward an 8k TPM budget. */
const GROQ_TPM_HEADROOM = 7000;

function approxTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function clipToTokens(text, tokenBudget) {
  const raw = String(text || "");
  const maxChars = Math.max(200, tokenBudget * 4);
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n\n[truncated to fit the Groq token budget]`;
}

function fitGroqRequest(system, userText, maxTokens) {
  const outCap = Math.min(Number(maxTokens) > 0 ? Number(maxTokens) : 600, 600);
  const inBudget = Math.max(800, GROQ_TPM_HEADROOM - outCap);
  let sys = String(system || "");
  let user = String(userText || "");
  const sysTok = approxTokens(sys);
  const userTok = approxTokens(user);
  if (sysTok + userTok <= inBudget) {
    return { system: sys, userText: user, maxTokens: outCap };
  }
  const sysCap = Math.min(sysTok, Math.floor(inBudget * 0.45));
  const userCap = inBudget - sysCap;
  return {
    system: clipToTokens(sys, sysCap),
    userText: clipToTokens(user, userCap),
    maxTokens: outCap,
  };
}

let groqQueue = Promise.resolve();
function enqueueGroq(fn) {
  const run = groqQueue.then(fn, fn);
  groqQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function withSearchNote(system, useWebSearch, provider) {
  if (!useWebSearch || provider === "claude") return system;
  return (
    String(system || "") +
    "\nYou do not have a live web-search tool. Use your knowledge, avoid inventing URLs, " +
    "and mark TAM / CAGR / share figures as estimates when you cannot cite a source."
  );
}

async function callGemini({ apiKey, model, system, userText, image, maxTokens }) {
  const parts = [];
  if (image?.data) {
    const data = sanitizeImageBase64(image.data);
    parts.push({
      inline_data: {
        mime_type:
          image.kind === "pdf" || image.mediaType === "application/pdf"
            ? "application/pdf"
            : sniffImageMediaType(data, image.name, image.mediaType),
        data,
      },
    });
  }
  parts.push({ text: userText });

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: Number(maxTokens) > 0 ? Number(maxTokens) : 2048,
      },
    }),
  });

  if (res.ok) {
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join("\n") ?? "";
    return { text, sources: [], stopReason: null, contentTypes: ["text"] };
  }

  const nativeErr = await readErrorSnippet(res);
  // Some Google keys work on the OpenAI-compatible Gemini endpoint instead.
  try {
    return await callChatCompletions({
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey,
      model,
      system,
      userText,
      image,
      maxTokens,
      label: "Gemini",
      vision: Boolean(image?.data),
    });
  } catch {
    httpError(res.status, `Gemini API failed (${res.status}). ${nativeErr}`);
  }
}

async function callChatCompletions({
  url,
  apiKey,
  model,
  system,
  userText,
  image,
  maxTokens,
  label,
  vision,
}) {
  const b64 = image?.data ? sanitizeImageBase64(image.data) : "";
  const media = b64 ? sniffImageMediaType(b64, image.name, image.mediaType) : "image/png";
  const userContent =
    vision && b64
      ? [
          {
            type: "image_url",
            image_url: {
              url: `data:${media};base64,${b64}`,
            },
          },
          { type: "text", text: userText },
        ]
      : image?.data
        ? `${userText}\n\n(An image was attached but this model cannot read images.)`
        : userText;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: Number(maxTokens) > 0 ? Number(maxTokens) : 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const safe = await readErrorSnippet(res);
    httpError(res.status, `${label} API failed (${res.status}). ${safe}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return { text: String(text), sources: [], stopReason: null, contentTypes: ["text"] };
}

export async function callLlm({
  provider,
  userText,
  system,
  image = null,
  useWebSearch = false,
  maxTokens,
  maxUses,
}) {
  const id = provider || currentLlm();
  const meta = providerMeta(id);
  const apiKey = readProviderKey(id);
  const model = readProviderModel(id);
  const tokens = Number(maxTokens) > 0 ? Number(maxTokens) : useWebSearch ? 2048 : 1200;
  const sys = withSearchNote(system, useWebSearch, id);

  if (!apiKey) missingKeyError(meta.label);

  if (id === "claude") {
    return callAnthropic({
      userText,
      system: sys,
      image,
      useWebSearch,
      maxTokens: tokens,
      maxUses,
    });
  }

  if (id === "gemini") {
    return callGemini({ apiKey, model, system: sys, userText, image, maxTokens: tokens });
  }

  if (id === "groq") {
    const fitted = fitGroqRequest(sys, userText, tokens);
    return enqueueGroq(() =>
      callChatCompletions({
        url: "https://api.groq.com/openai/v1/chat/completions",
        apiKey,
        model,
        system: fitted.system,
        userText: fitted.userText,
        image: null,
        maxTokens: fitted.maxTokens,
        label: "Groq",
        vision: false,
      })
    );
  }

  if (id === "deepseek") {
    return callChatCompletions({
      url: "https://api.deepseek.com/chat/completions",
      apiKey,
      model,
      system: sys,
      userText,
      image,
      maxTokens: tokens,
      label: "DeepSeek",
      vision: false,
    });
  }

  if (id === "openai") {
    return callChatCompletions({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey,
      model,
      system: sys,
      userText,
      image,
      maxTokens: tokens,
      label: "OpenAI",
      vision: true,
    });
  }

  // Unknown id should not silently hit Anthropic — that produced "Claude credit" errors
  // when the UI thought it had switched providers.
  httpError(500, `Unknown LLM provider "${id}".`);
}

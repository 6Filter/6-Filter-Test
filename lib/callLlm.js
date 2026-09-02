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
import {
  estimateTokens,
  GROQ_SAFETY_MARGIN,
  GROQ_TPM_LIMIT,
  shouldSkipGroqForSize,
} from "./skills/loadSkill.js";

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

/** Stay under Groq free-plan 8k TPM even if GROQ_MODEL is still gpt-oss-120b. */
const GROQ_TPM_HEADROOM = 4800;

function clipToTokens(text, tokenBudget) {
  const raw = String(text || "");
  const maxChars = Math.max(200, tokenBudget * 4);
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n\n[truncated to fit the Groq token budget]`;
}

function groqSkipError(estimated) {
  const cap = Math.floor(GROQ_TPM_LIMIT * GROQ_SAFETY_MARGIN);
  const err = new Error(
    `Groq skipped: prompt estimated at ${estimated} tokens exceeds ${cap} (85% of ${GROQ_TPM_LIMIT} TPM).`
  );
  err.status = 413;
  err.skipProvider = "groq";
  return err;
}

function fitGroqRequest(system, userText, maxTokens) {
  const outCap = Math.min(Number(maxTokens) > 0 ? Number(maxTokens) : 600, 600);
  const inBudget = Math.max(800, GROQ_TPM_HEADROOM - outCap);
  let sys = String(system || "");
  let user = String(userText || "");
  const sysTok = estimateTokens(sys);
  const userTok = estimateTokens(user);
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

async function callGemini({ apiKey, model, system, userText, image, maxTokens, temperature = 0 }) {
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
        temperature: temperature ?? 0,
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
      temperature,
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
  temperature = 0,
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
      temperature: temperature ?? 0,
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
  temperature = 0,
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
      temperature,
    });
  }

  if (id === "gemini") {
    return callGemini({ apiKey, model, system: sys, userText, image, maxTokens: tokens, temperature });
  }

  if (id === "groq") {
    const fitted = fitGroqRequest(sys, userText, tokens);
    const inTok = estimateTokens(fitted.system) + estimateTokens(fitted.userText);
    const totalEst = inTok + fitted.maxTokens;
    console.log(
      `[primus/llm] groq estimate model=${model} in=${inTok} out=${fitted.maxTokens} total=${totalEst} skip=${shouldSkipGroqForSize(`${fitted.system}\n${fitted.userText}`)}`
    );
    if (shouldSkipGroqForSize(`${fitted.system}\n${fitted.userText}`) || totalEst > GROQ_TPM_LIMIT * GROQ_SAFETY_MARGIN) {
      throw groqSkipError(totalEst);
    }
    return enqueueGroq(async () => {
      try {
        return await callChatCompletions({
          url: "https://api.groq.com/openai/v1/chat/completions",
          apiKey,
          model,
          system: fitted.system,
          userText: fitted.userText,
          image: null,
          maxTokens: fitted.maxTokens,
          label: "Groq",
          vision: false,
          temperature,
        });
      } catch (e) {
        if (!/413|too large|TPM/i.test(e.message || "")) throw e;
        const retry = fitGroqRequest(fitted.system, fitted.userText, 250);
        console.warn(`[primus/llm] groq 413 retry in~${estimateTokens(retry.system) + estimateTokens(retry.userText)}`);
        return callChatCompletions({
          url: "https://api.groq.com/openai/v1/chat/completions",
          apiKey,
          model,
          system: clipToTokens(retry.system, 900),
          userText: clipToTokens(retry.userText, 900),
          image: null,
          maxTokens: 250,
          label: "Groq",
          vision: false,
          temperature,
        });
      }
    });
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
      temperature,
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
      temperature,
    });
  }

  // Unknown id should not silently hit Anthropic — that produced "Claude credit" errors
  // when the UI thought it had switched providers.
  httpError(500, `Unknown LLM provider "${id}".`);
}

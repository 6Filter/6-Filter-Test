/** Browser-safe catalog. No API keys, no Node APIs. */

export const LLM_CATALOG = [
  {
    id: "claude",
    label: "Claude",
    hint: "Default · web search",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-5-20250929",
  },
  {
    id: "gemini",
    label: "Gemini",
    hint: "Compare",
    // Prefer GEMINI_API_KEY; aliases cover common Google AI Studio / GenAI names.
    envKey: "GEMINI_API_KEY",
    envKeyAliases: ["GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_AI_API_KEY"],
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.0-flash",
  },
  {
    id: "groq",
    label: "Groq",
    hint: "Compare",
    envKey: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "openai/gpt-oss-120b",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "Compare",
    envKey: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-chat",
  },
  {
    id: "openai",
    label: "OpenAI",
    hint: "Compare",
    envKey: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o",
  },
];

export function normalizeProvider(id) {
  const key = String(id || "claude").trim().toLowerCase();
  return LLM_CATALOG.some((p) => p.id === key) ? key : "claude";
}

export function providerMeta(id) {
  const key = normalizeProvider(id);
  return LLM_CATALOG.find((p) => p.id === key) || LLM_CATALOG[0];
}

export function providerLabel(id) {
  return providerMeta(id).label;
}

/** Groq retired these public model IDs on 2026-08-16. */
const GROQ_RETIRED_MODELS = {
  "llama-3.3-70b-versatile": "openai/gpt-oss-120b",
  "llama-3.1-8b-instant": "openai/gpt-oss-20b",
  "llama-3.1-70b-versatile": "openai/gpt-oss-120b",
};

export function resolveProviderModel(id, rawModel) {
  const meta = providerMeta(id);
  const requested = String(rawModel || "").trim() || meta.defaultModel;
  if (normalizeProvider(id) !== "groq") return requested;
  return GROQ_RETIRED_MODELS[requested] || requested;
}

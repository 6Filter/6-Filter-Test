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
    envKey: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.0-flash",
  },
  {
    id: "groq",
    label: "Groq",
    hint: "Compare",
    envKey: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
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

/** Browser-safe catalog. No API keys, no Node APIs. Claude only. */

export const DEFAULT_LLM_PROVIDER = "claude";

export const LLM_CATALOG = [
  {
    id: "claude",
    label: "Claude",
    hint: "Default · web search",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-5",
  },
];

export function normalizeProvider(id) {
  const key = String(id || DEFAULT_LLM_PROVIDER).trim().toLowerCase();
  return key === "claude" ? "claude" : DEFAULT_LLM_PROVIDER;
}

export function providerMeta(id) {
  const key = normalizeProvider(id);
  return LLM_CATALOG.find((p) => p.id === key) || LLM_CATALOG[0];
}

export function providerLabel(id) {
  return providerMeta(id).label;
}

const ANTHROPIC_RETIRED_MODELS = {
  "claude-sonnet-4-5-20250929": "claude-sonnet-5",
  "claude-sonnet-4-5": "claude-sonnet-5",
  "claude-3-5-sonnet-latest": "claude-sonnet-5",
  "claude-3-7-sonnet-latest": "claude-sonnet-5",
};

export function resolveProviderModel(id, rawModel) {
  const meta = providerMeta(id);
  const requested = String(rawModel || "").trim() || meta.defaultModel;
  return ANTHROPIC_RETIRED_MODELS[requested] || requested;
}

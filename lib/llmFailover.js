import {
  LLM_CATALOG,
  isProviderConfigured,
  normalizeProvider,
  providerLabel,
} from "./llmContext.js";

/** True when the active LLM failed in a way that another configured provider might still work. */
export function isProviderFailoverError(message) {
  const s = String(message || "").toLowerCase();
  if (!s) return false;
  return (
    s.includes("credit balance") ||
    s.includes("too low to access") ||
    s.includes("insufficient_quota") ||
    s.includes("billing") ||
    s.includes("rate limit") ||
    s.includes("overloaded") ||
    s.includes("api key is not configured") ||
    s.includes("invalid_api_key") ||
    s.includes("authentication") ||
    s.includes("groq skipped") ||
    s.includes("too large") ||
    s.includes("tokens per minute") ||
    /\bapi failed \(40[0239]\)/.test(s) ||
    /\bapi failed \(413\)/.test(s) ||
    /\bapi failed \(429\)/.test(s) ||
    /\bapi failed \(5\d\d\)/.test(s)
  );
}

export function configuredFallbackProviders(failedProvider = "claude") {
  const failed = normalizeProvider(failedProvider);
  return LLM_CATALOG.filter((p) => p.id !== failed && isProviderConfigured(p.id)).map((p) => ({
    id: p.id,
    label: providerLabel(p.id),
    hint: p.hint,
  }));
}

export function failoverPayload(failedProvider, errorMessage) {
  if (!isProviderFailoverError(errorMessage)) {
    return { suggestFallback: false, fallbackProviders: [] };
  }
  const fallbackProviders = configuredFallbackProviders(failedProvider);
  return {
    suggestFallback: fallbackProviders.length > 0,
    fallbackProviders,
    failedProvider: normalizeProvider(failedProvider),
    failedProviderLabel: providerLabel(failedProvider),
  };
}

import { normalizeProvider, providerLabel } from "./llmContext.js";

/** Claude-only: other-model failover is retired. */
export function isProviderFailoverError(_message) {
  return false;
}

export function configuredFallbackProviders(_failedProvider = "claude") {
  return [];
}

export function failoverPayload(failedProvider, _errorMessage) {
  return {
    suggestFallback: false,
    fallbackProviders: [],
    failedProvider: normalizeProvider(failedProvider),
    failedProviderLabel: providerLabel(failedProvider),
  };
}

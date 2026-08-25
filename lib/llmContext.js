import { AsyncLocalStorage } from "node:async_hooks";
import { LLM_CATALOG, normalizeProvider, providerMeta } from "./llmCatalog.js";

const store = new AsyncLocalStorage();

export function cleanEnvKey(raw) {
  return String(raw || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)[0] || "";
}

export function runWithLlm(provider, fn) {
  return store.run({ provider: normalizeProvider(provider) }, fn);
}

export function currentLlm() {
  return store.getStore()?.provider || "claude";
}

export function readProviderKey(id) {
  const meta = providerMeta(id);
  return cleanEnvKey(process.env[meta.envKey]);
}

export function readProviderModel(id) {
  const meta = providerMeta(id);
  const fromEnv = cleanEnvKey(process.env[meta.modelEnv]).split(/\s+/)[0];
  return fromEnv || meta.defaultModel;
}

export function isProviderConfigured(id) {
  return Boolean(readProviderKey(id));
}

export function listProvidersForClient() {
  return LLM_CATALOG.map((p) => ({
    id: p.id,
    label: p.label,
    hint: p.hint,
    configured: isProviderConfigured(p.id),
  }));
}

export { LLM_CATALOG, normalizeProvider, providerMeta };
export { providerLabel } from "./llmCatalog.js";

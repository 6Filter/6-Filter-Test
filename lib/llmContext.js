import { AsyncLocalStorage } from "node:async_hooks";
import { LLM_CATALOG, normalizeProvider, providerMeta, resolveProviderModel } from "./llmCatalog.js";

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
  const names = [meta.envKey, ...(meta.envKeyAliases || [])];
  for (const name of names) {
    const value = cleanEnvKey(process.env[name]);
    if (value) return value;
  }
  return "";
}

/** Which env var name supplied the key (for logs / client hints — never the value). */
export function readProviderKeySource(id) {
  const meta = providerMeta(id);
  const names = [meta.envKey, ...(meta.envKeyAliases || [])];
  for (const name of names) {
    if (cleanEnvKey(process.env[name])) return name;
  }
  return null;
}

export function readProviderModel(id) {
  const meta = providerMeta(id);
  const fromEnv = cleanEnvKey(process.env[meta.modelEnv]).split(/\s+/)[0];
  return resolveProviderModel(id, fromEnv || meta.defaultModel);
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
    envKey: p.envKey,
    keySource: readProviderKeySource(p.id),
  }));
}

export { LLM_CATALOG, normalizeProvider, providerMeta, resolveProviderModel };
export { providerLabel } from "./llmCatalog.js";

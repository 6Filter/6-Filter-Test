import { AsyncLocalStorage } from "node:async_hooks";
import {
  DEFAULT_LLM_PROVIDER,
  LLM_CATALOG,
  normalizeProvider,
  providerMeta,
  resolveProviderModel,
} from "./llmCatalog.js";

const store = new AsyncLocalStorage();

export function cleanEnvKey(raw) {
  return (
    String(raw || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)[0] || ""
  );
}

/**
 * Run work under a provider + optional billing department (verified session).
 * Form submitterDepartment must NOT be passed here — only req.user.department.
 */
export function runWithLlm(provider, fn, { department = null } = {}) {
  const prev = store.getStore() || {};
  return store.run(
    {
      provider: normalizeProvider(provider),
      billingDepartment:
        department != null && String(department).trim()
          ? String(department).trim()
          : prev.billingDepartment || null,
    },
    fn
  );
}

export function currentLlm() {
  return store.getStore()?.provider || "claude";
}

/** Verified session department for Anthropic billing — not the form dropdown. */
export function currentBillingDepartment() {
  return store.getStore()?.billingDepartment || null;
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

export { DEFAULT_LLM_PROVIDER, LLM_CATALOG, normalizeProvider, providerMeta, resolveProviderModel };
export { providerLabel } from "./llmCatalog.js";

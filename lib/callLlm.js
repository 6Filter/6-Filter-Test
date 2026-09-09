/**
 * LLM caller — Claude (Anthropic) only. Keys stay on the server.
 */
import { callAnthropic } from "./callAnthropic.js";
import { currentLlm, providerMeta, readProviderKey } from "./llmContext.js";

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
  const id = provider || currentLlm() || "claude";
  if (id !== "claude") {
    httpError(500, `Only Claude is supported (got "${id}").`);
  }

  const meta = providerMeta("claude");
  const apiKey = readProviderKey("claude");
  const tokens = Number(maxTokens) > 0 ? Number(maxTokens) : useWebSearch ? 2048 : 1200;

  if (!apiKey) missingKeyError(meta.label);

  return callAnthropic({
    userText,
    system,
    image,
    useWebSearch,
    maxTokens: tokens,
    maxUses,
    temperature,
  });
}

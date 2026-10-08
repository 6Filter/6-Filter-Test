/**
 * LLM caller — Claude (Anthropic) only. Keys stay on the server.
 * Key selection is session-billed inside callAnthropic (verified department).
 */
import { callAnthropic } from "./callAnthropic.js";
import { currentLlm, providerMeta } from "./llmContext.js";
import { replayActive } from "./replayGuard.js";

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  throw err;
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
  department = null,
  tier = "heavy",
  label = "unlabeled",
}) {
  if (replayActive()) {
    throw new Error("REPLAY_MAY_NOT_CALL_LLM");
  }
  const id = provider || currentLlm() || "claude";
  if (id !== "claude") {
    httpError(500, `Only Claude is supported (got "${id}").`);
  }

  const tokens = Number(maxTokens) > 0 ? Number(maxTokens) : useWebSearch ? 2048 : 1200;

  return callAnthropic({
    userText,
    system,
    image,
    useWebSearch,
    maxTokens: tokens,
    maxUses,
    temperature,
    department,
    tier,
    label,
  });
}

export { providerMeta };

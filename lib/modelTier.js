/**
 * Heavy is the research model. Light is used only for reformat / describe /
 * classify calls. Unset ANTHROPIC_MODEL_LIGHT keeps light on the heavy model,
 * so behaviour is unchanged until someone sets the env var on purpose.
 */
import { readProviderModel } from "./llmContext.js";

export function modelForTier(tier) {
  const heavy = readProviderModel("claude");
  if (tier === "light") {
    const light = String(process.env.ANTHROPIC_MODEL_LIGHT || "").trim().split(/\s+/)[0];
    return light || heavy;
  }
  return heavy;
}

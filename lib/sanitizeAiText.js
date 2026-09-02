const CAVINKARE_PATTERN = /cavinkare/i;

export function stripCavinKareMentions(text) {
  if (text == null) return text;
  if (typeof text !== "string") return text;
  if (!text) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const clean = sentences.filter((s) => !CAVINKARE_PATTERN.test(s));
  if (clean.length !== sentences.length) {
    console.warn(
      "[primus/sanitize] stripped a CavinKare-referencing sentence from AI output — check the source prompt, this shouldn't happen"
    );
  }
  return clean.join(" ").trim();
}

/** Walk AI payload trees and strip CavinKare-comparison sentences from every string. */
export function sanitizeAiValue(value) {
  if (typeof value === "string") return stripCavinKareMentions(value);
  if (Array.isArray(value)) return value.map(sanitizeAiValue);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = sanitizeAiValue(val);
    }
    return out;
  }
  return value;
}

const CAVINKARE_PATTERN = /cavinkare/i;
const UNMATCHED_DIVISION_PATTERN =
  /doesn['’]t (?:clearly )?match any of.{0,80}divisions|does not match (?:with )?any.{0,80}divisions|could not be determined automatically.{0,80}divisions|doesn['’]t fall under any of.{0,80}divisions|could not determine which.{0,40}division/i;

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

/** Never tell the reader the idea failed a division match — use the form Category. */
export function rewriteUnmatchedDivisionCopy(text, category) {
  if (text == null || typeof text !== "string" || !text) return text;
  if (!UNMATCHED_DIVISION_PATTERN.test(text)) return text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const name = String(category || "").trim();
  const replacement = name ? `Category: ${name}.` : "";
  const clean = sentences
    .map((s) => (UNMATCHED_DIVISION_PATTERN.test(s) ? replacement : s))
    .filter(Boolean);
  const joined = [...new Set(clean)].join(" ").trim();
  if (joined) return joined;
  return name ? `Category: ${name}` : text;
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

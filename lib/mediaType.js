/** Infer an Anthropic-safe image media_type from upload name/MIME. */

const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function inferImageMediaType(name = "", mime = "") {
  const m = String(mime || "").toLowerCase().trim();
  if (ALLOWED.has(m)) return m;
  if (m === "image/jpg") return "image/jpeg";
  const n = String(name || "").toLowerCase();
  if (/\.jpe?g$/i.test(n)) return "image/jpeg";
  if (/\.gif$/i.test(n)) return "image/gif";
  if (/\.webp$/i.test(n)) return "image/webp";
  if (/\.png$/i.test(n)) return "image/png";
  if (m.startsWith("image/") && m !== "image/*") return "image/png";
  return "image/png";
}

/** Infer an Anthropic-safe image media_type from upload name/MIME/bytes. */

const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function sanitizeImageBase64(data) {
  let s = String(data || "").trim();
  const marker = "base64,";
  const i = s.toLowerCase().indexOf(marker);
  if (s.slice(0, 5).toLowerCase() === "data:" && i >= 0) {
    s = s.slice(i + marker.length);
  }
  return s.replace(/\s/g, "");
}

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

function headerBytes(b64, n = 16) {
  try {
    const slice = sanitizeImageBase64(b64).slice(0, 48);
    const bin =
      typeof atob === "function"
        ? atob(slice)
        : Buffer.from(slice, "base64").toString("binary");
    const out = [];
    for (let i = 0; i < Math.min(n, bin.length); i++) out.push(bin.charCodeAt(i) & 255);
    return out;
  } catch {
    return [];
  }
}

/** Prefer magic bytes over filename/MIME so a JPEG named .png still works. */
export function sniffImageMediaType(base64, name = "", mime = "") {
  const b = headerBytes(base64, 16);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  return inferImageMediaType(name, mime);
}

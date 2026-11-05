/**
 * Part 134 — pack size parser. Browser-safe, no I/O.
 * A bare number is refused: g and ml are not interchangeable.
 */

function trim(v) {
  return String(v ?? "").trim();
}

/**
 * @param {string} text
 * @returns {{ ok: true, value: number, unit: "g"|"ml", base: number, display: string } | { ok: false, reason: string, message: string }}
 */
export function parsePackSize(text) {
  const raw = trim(text);
  if (!raw) {
    return { ok: false, reason: "NEEDS_UNIT", message: "Enter a pack size with a unit — e.g. 100 ml or 100 g" };
  }
  if (/^\d+(\.\d+)?$/.test(raw.replace(/\s+/g, ""))) {
    return {
      ok: false,
      reason: "NEEDS_UNIT",
      message: "Add a unit (g or ml) — a bare number cannot tell grams from millilitres",
    };
  }
  const m = raw.match(
    /^(\d+(?:\.\d+)?)\s*(gm|gms|grams?|g|kgs?|kilograms?|ml|millilitres?|milliliters?|ltrs?|litres?|liters?|l)\b\.?$/i
  );
  if (!m) {
    return {
      ok: false,
      reason: "NEEDS_UNIT",
      message: "Use a number with a unit — e.g. 10 ml, 100 g, 1 kg, 0.5 L, 250 gm",
    };
  }
  let value = Number(m[1]);
  const u = String(m[2] || "").toLowerCase();
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: "NEEDS_UNIT", message: "Pack size must be a positive number with a unit" };
  }
  let unit;
  let base;
  if (u === "g" || u === "gm" || u === "gms" || u.startsWith("gram")) {
    unit = "g";
    base = value;
  } else if (u.startsWith("kg") || u.startsWith("kilogram")) {
    unit = "g";
    value = value * 1000;
    base = value;
  } else if (u === "ml" || u.startsWith("mill")) {
    unit = "ml";
    base = value;
  } else {
    // l, ltr, litre(s), liter(s)
    unit = "ml";
    value = value * 1000;
    base = value;
  }
  const display = `${base} ${unit}`;
  return { ok: true, value: base, unit, base, display };
}

/** True when two pack strings describe the same base mass/volume (0.1 L ≡ 100 ml). */
export function samePackSize(a, b) {
  const pa = parsePackSize(a);
  const pb = parsePackSize(b);
  if (!pa.ok || !pb.ok) return false;
  if (pa.unit !== pb.unit) return false;
  return Math.abs(pa.base - pb.base) < 1e-6;
}

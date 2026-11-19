/**
 * Part 156 — which database service the app is connected to, by NAME only.
 *
 * The app reads one secret, DATABASE_URL (or POSTGRES_URL). This module turns it into one of a fixed set of
 * words so /api/health can say "azure" or "render" without ever showing the host, the user or the password.
 *
 * The host is matched as a whole domain suffix with a dot in front ("x.postgres.database.azure.com"), so a
 * look-alike such as "postgres.database.azure.com.evil.example", "evilpostgres.database.azure.com" or a URL whose
 * user name or path mentions Azure is NOT taken for Azure. Browser-safe: no I/O, no Node APIs.
 */

export const DB_PROVIDERS = Object.freeze(["azure", "render", "neon", "supabase", "aws", "local", "other", "none"]);

/** Domain suffixes (each starts with a dot, so the host must have a name in front of it). */
const SUFFIXES = Object.freeze([
  ["azure", [".postgres.database.azure.com", ".postgres.cosmos.azure.com"]],
  ["render", [".render.com"]],
  ["neon", [".neon.tech"]],
  ["supabase", [".supabase.co", ".supabase.com"]],
  ["aws", [".rds.amazonaws.com", ".rds.amazonaws.com.cn"]],
]);

/** Render's private-network host has no dot at all: dpg-<id>-<letter>. */
const RENDER_INTERNAL_HOST = /^dpg-[a-z0-9]+-[a-z]$/;

/** @param {string} hostname */
function providerForHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
  if (!host) return "other";
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return "local";
  if (RENDER_INTERNAL_HOST.test(host)) return "render";
  for (const [name, suffixes] of SUFFIXES) {
    for (const suffix of suffixes) {
      if (host.endsWith(suffix) && host.length > suffix.length) return name;
    }
  }
  return "other";
}

/**
 * Classify a connection string. Returns one word from DB_PROVIDERS; never throws and never returns any part of the URL.
 * @param {unknown} raw
 */
export function classifyDatabaseProvider(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "none";
  let url;
  try {
    url = new URL(text);
  } catch {
    return "other";
  }
  if (!/^postgres(ql)?:$/i.test(url.protocol)) return "other";
  return providerForHost(url.hostname);
}

/** The provider for this process, read from the same variables lib/db.js reads. */
export function currentDatabaseProvider(env = process.env) {
  return classifyDatabaseProvider(env.DATABASE_URL || env.POSTGRES_URL || "");
}

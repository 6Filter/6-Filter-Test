/**
 * Push LLM keys from .env.local to a Render web service.
 *
 * Usage:
 *   set RENDER_API_KEY=rnd_...
 *   node scripts/setRenderEnv.js
 *
 * Optional:
 *   set RENDER_SERVICE_ID=srv-...
 *   (otherwise looks up a service named ck-6-filter-test)
 */
import { readFileSync } from "node:fs";

function loadEnvLocal() {
  const out = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch {
    /* no .env.local */
  }
  return out;
}

const local = loadEnvLocal();
const apiKey = process.env.RENDER_API_KEY || local.RENDER_API_KEY;
if (!apiKey) {
  console.error(
    "Missing RENDER_API_KEY. Create one at https://dashboard.render.com/u/settings#api-keys"
  );
  process.exit(1);
}

const KEYS = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "ALLOWED_ORIGIN",
  "DATABASE_URL",
  "SESSION_SECRET",
];

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function api(path, options = {}) {
  const res = await fetch(`https://api.render.com/v1${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return data;
}

async function resolveServiceId() {
  if (process.env.RENDER_SERVICE_ID) return process.env.RENDER_SERVICE_ID;
  const rows = await api("/services?limit=50");
  const list = Array.isArray(rows) ? rows : [];
  const match = list.find((row) => {
    const s = row.service || row;
    return s?.name === "ck-6-filter-test" || s?.serviceDetails?.url?.includes("ck-6-filter-test");
  });
  const service = match?.service || match;
  if (!service?.id) {
    throw new Error(
      'Could not find a Render service named "ck-6-filter-test". Set RENDER_SERVICE_ID=srv-...'
    );
  }
  return service.id;
}

async function main() {
  const serviceId = await resolveServiceId();
  console.log(`Service: ${serviceId}`);

  const existing = await api(`/services/${serviceId}/env-vars`);
  const merged = new Map();
  for (const row of Array.isArray(existing) ? existing : []) {
    const ev = row.envVar || row;
    if (ev?.key && ev.value != null) merged.set(ev.key, String(ev.value));
  }

  for (const key of KEYS) {
    let value = local[key] || process.env[key] || "";
    if (key === "ALLOWED_ORIGIN" && !value) {
      value = "https://ck-6-filter-test.onrender.com";
    }
    if (key === "ANTHROPIC_MODEL" && !value) {
      value = "claude-sonnet-4-5-20250929";
    }
    if (!value) {
      console.log(`keep ${key} (no local value${merged.has(key) ? ", already on Render" : ""})`);
      continue;
    }
    merged.set(key, value);
    console.log(`set  ${key} (${value.length} chars)`);
  }

  // Always pin CORS origin for this host.
  merged.set("ALLOWED_ORIGIN", "https://ck-6-filter-test.onrender.com");

  const payload = [...merged.entries()].map(([key, value]) => ({ key, value }));
  if (!payload.length) {
    console.error("No env values to write.");
    process.exit(1);
  }

  // PUT replaces the full set — we merge with existing first so DATABASE_URL etc. are preserved.
  await api(`/services/${serviceId}/env-vars`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  console.log(`Env vars updated on Render (${payload.length} keys).`);

  const deploy = await api(`/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ clearCache: "do_not_clear" }),
  });
  const deployId = deploy?.id || deploy?.deploy?.id || "(unknown)";
  console.log(`Deploy started: ${deployId}`);
  console.log("Live URL: https://ck-6-filter-test.onrender.com");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});

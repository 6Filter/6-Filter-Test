/** Temporary research-pipeline traces. Truncate so logs stay readable. */

function clip(value, max = 4000) {
  if (value == null) return value;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…[truncated ${s.length - max} chars]`;
}

export function researchTrace(stage, payload = {}) {
  if (!process.env.PRIMUS_RESEARCH_TRACE) return;
  const parts = Object.entries(payload).map(([k, v]) => `${k}=${clip(v)}`);
  console.log(`[primus/research-trace] STAGE=${stage} ${parts.join(" ")}`);
}

export function summarizeTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return [];
  return tools.map((t) => ({ type: t?.type, name: t?.name, max_uses: t?.max_uses }));
}

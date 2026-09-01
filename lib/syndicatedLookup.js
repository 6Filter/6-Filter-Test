import fs from "node:fs/promises";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");

async function readJson(file) {
  try {
    const raw = await fs.readFile(path.join(DATA, file), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : parsed.rows || parsed.categories || [];
  } catch {
    return [];
  }
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreMatch(row, query) {
  const q = norm(query);
  if (!q) return 0;
  const hay = norm([row.category, row.segment, row.name, ...(row.aliases || [])].join(" "));
  if (!hay) return 0;
  if (hay === q) return 100;
  if (hay.includes(q) || q.includes(hay)) return 80;
  const parts = q.split(" ").filter((w) => w.length > 2);
  return parts.filter((w) => hay.includes(w)).length * 10;
}

function bestRow(rows, query) {
  let best = null;
  let bestScore = 0;
  for (const row of rows) {
    const s = scoreMatch(row, query);
    if (s > bestScore) {
      best = row;
      bestScore = s;
    }
  }
  return bestScore >= 10 ? best : null;
}

export async function lookupNielsenCategory(query) {
  const rows = await readJson("nielsen.json");
  return bestRow(rows, query);
}

export async function lookupKantarCategory(query) {
  const rows = await readJson("kantar.json");
  return bestRow(rows, query);
}

export function formatNielsenForPrompt(row) {
  if (!row) return "NIELSEN: (no local audit row for this idea — use web search and playbook engines; still name a benchmark and a category size.)";
  const products = Array.isArray(row.products) ? row.products : [];
  const lines = products.slice(0, 12).map((p) => {
    const g = p.gramsOrMl || p.grams || p.ml;
    const ppg = p.pricePerGram ?? (p.mrpInr && g ? Number(p.mrpInr) / Number(g) : null);
    return `- ${p.brand || ""} ${p.variant || ""} ${p.pack || ""} MRP ₹${p.mrpInr ?? "?"} ${g ? `${g}g/ml` : ""} ${ppg != null && Number.isFinite(ppg) ? `₹${Number(ppg).toFixed(2)}/g` : ""}`.trim();
  });
  return (
    `NIELSEN (local audit, ${row.period || "period n/s"}, ${row.geography || "India"}):\n` +
    `category=${row.category || ""} valueCr=${row.categoryValueCr ?? "n/s"} valueGrowthPct=${row.valueGrowthPct ?? "n/s"} volumeGrowthPct=${row.volumeGrowthPct ?? "n/s"}\n` +
    (row.formatShares ? `formatShares=${JSON.stringify(row.formatShares)}\n` : "") +
    `products currently selling:\n${lines.join("\n") || "(no SKU list)"}`
  );
}

export function formatKantarForPrompt(row) {
  if (!row) return "KANTAR: (no local panel row — derive households, trial, repeat, frequency, pack value from HCES / analogs / web; still fill every factor.)";
  return (
    `KANTAR (local panel, ${row.period || "period n/s"}, ${row.geography || "India"}):\n` +
    `category=${row.category || ""} householdsMn=${row.householdsMn ?? ""} penetrationPct=${row.penetrationPct ?? ""} ` +
    `trialRatePct=${row.trialRatePct ?? ""} repeatConversionPct=${row.repeatConversionPct ?? ""} ` +
    `purchaseFrequencyYr=${row.purchaseFrequencyYr ?? ""} avgPackValueInr=${row.avgPackValueInr ?? ""}`
  );
}

export async function syndicatedPromptBlock(ideaText) {
  const q = String(ideaText || "").slice(0, 400);
  const [nielsen, kantar] = await Promise.all([lookupNielsenCategory(q), lookupKantarCategory(q)]);
  return `${formatNielsenForPrompt(nielsen)}\n\n${formatKantarForPrompt(kantar)}`;
}

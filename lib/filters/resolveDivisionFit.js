import { brandRosterForPrompt } from "../ckBrands.js";
import { getDivisionOptions } from "../divisionConfig.js";
import { mergeSources } from "./parseFilterJson.js";
import { researchThenJson } from "../llmJson.js";
import { trimInput } from "../scoring.js";

const STRUCTURE_SYSTEM = `Given the research above, decide:
1. generalCategory — the product's real commercial category, in a few words.
2. matchedDivision — the exact division name from the list above, ONLY if a CavinKare brand or category genuinely covers this. Do not pick the nearest-sounding division as a guess — if nothing on the list actually carries this kind of product, matchedDivision must be null.
3. isNewCategory — true if matchedDivision is null.
4. rationale — one or two sentences a person could act on.

Return ONLY minified JSON:
{"generalCategory":"...","matchedDivision":"<division or null>","isNewCategory":true|false,"rationale":"...","sources":[{"title":"...","url":"..."}]}`;

const JSON_SUFFIX =
  'Return ONLY minified JSON: {"generalCategory":"...","matchedDivision":"<division or null>","isNewCategory":true|false,"rationale":"...","sources":[{"title":"...","url":"..."}]}';

function emptyFit(rationale, sources = []) {
  return {
    generalCategory: null,
    matchedDivision: null,
    isNewCategory: false,
    rationale: rationale || "Could not determine whether this idea belongs to a CavinKare division.",
    sources,
  };
}

function normalizeFit(parsed, searchSources, allowed) {
  if (!parsed || typeof parsed !== "object") {
    return emptyFit("Could not determine whether this idea belongs to a CavinKare division.", searchSources);
  }
  const rawDivision = parsed.matchedDivision;
  const matchedDivision =
    typeof rawDivision === "string" && allowed.has(rawDivision.trim())
      ? rawDivision.trim()
      : null;
  const generalCategory = String(parsed.generalCategory || "").trim() || null;
  const isNewCategory = matchedDivision == null;
  return {
    generalCategory,
    matchedDivision,
    isNewCategory,
    rationale: String(parsed.rationale || "").trim(),
    sources: mergeSources(parsed.sources, searchSources),
  };
}

/**
 * AI-assisted division fit, only used when detectDivision() returns null.
 * Classifying into a fixed division list is not a web question: no search,
 * light tier, and the result is reused for the same normalized text.
 */
function divisionCacheKey(text) {
  return String(text || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 240);
}

async function readDivisionFitCache(key) {
  if (!key) return null;
  const db = await import("../db.js");
  await db.initDb();
  if (db.isUsingPostgres()) {
    const rows = await db.query(`SELECT payload FROM division_fit_cache WHERE normalized_key = $1`, [key]);
    if (!rows[0]?.payload) return null;
    return typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
  }
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  try {
    const map = JSON.parse(await fs.readFile(path.join(process.cwd(), "data", "division_fit_cache.json"), "utf8"));
    return map[key] || null;
  } catch {
    return null;
  }
}

async function writeDivisionFitCache(key, fit) {
  if (!key || !fit) return;
  const db = await import("../db.js");
  await db.initDb();
  if (db.isUsingPostgres()) {
    await db.query(
      `INSERT INTO division_fit_cache (normalized_key, payload, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (normalized_key) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()`,
      [key, JSON.stringify(fit)]
    );
    return;
  }
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "data");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "division_fit_cache.json");
  let map = {};
  try {
    map = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    map = {};
  }
  map[key] = fit;
  await fs.writeFile(file, JSON.stringify(map));
}

export async function resolveDivisionFit(ideaText) {
  const idea = trimInput(String(ideaText || ""), 1600);
  const cacheKey = divisionCacheKey(idea);
  const cached = await readDivisionFitCache(cacheKey);
  if (cached) return cached;
  const options = await getDivisionOptions();
  const allowed = new Set(options);
  const researchSystem =
    `You are researching what commercial category a proposed product belongs to, so it can be checked against CavinKare's actual brand portfolio below.\n\n` +
    `${brandRosterForPrompt()}\n\n` +
    `Divisions used for net-margin screening: ${options.join(", ")}.\n\n` +
    `Do not search the web. Classify from the idea text and the brand list above.\n` +
    `Identify the general commercial category (e.g. "ready-to-cook marinated meat", "colour cosmetics / lipstick"), and check it against the brand list above.\n` +
    `Write a short research brief in prose (not JSON). Do not pick the nearest-sounding division as a guess.`;

  const { parsed, sources, error } = await researchThenJson({
    label: "division-fit",
    researchSystem,
    researchUser: `PRODUCT IDEA:\n${idea}`,
    jsonSystem: STRUCTURE_SYSTEM,
    jsonUserSuffix: JSON_SUFFIX,
    researchMaxTokens: 2048,
    jsonMaxTokens: 1024,
    maxUses: 0,
    researchTier: "light",
    structureTier: "light",
  });

  if (!parsed) {
    console.error(`[primus/division] resolveDivisionFit failed error=${error || "empty"}`);
    return emptyFit(
      error === "truncated"
        ? "Division research was cut off before it finished."
        : "Could not determine whether this idea belongs to a CavinKare division.",
      sources || []
    );
  }

  const fit = normalizeFit(parsed, sources, allowed);
  console.log(
    `[primus/division] resolveDivisionFit generalCategory=${fit.generalCategory || "null"} ` +
      `matchedDivision=${fit.matchedDivision || "null"} isNewCategory=${fit.isNewCategory}`
  );
  await writeDivisionFitCache(cacheKey, fit);
  if (fit.generalCategory) await writeDivisionFitCache(divisionCacheKey(fit.generalCategory), fit);
  return fit;
}

import { createHash } from "node:crypto";
import { dataDir } from "./dataDir.js";
import { researchResultIsCacheable } from "./researchCacheable.js";

/**
 * Inputs each research step actually reads. Derived from the function
 * signatures, not from a guessed bundle hash.
 * F1 also receives price and an image; those change the benchmark check.
 * Margin research applies COGS in code, so the cached result includes COGS.
 */
const STEP_FIELDS = {
  f1: ["idea", "category", "benchmark", "attribute1", "attribute2", "attribute3", "pureCommodity", "pricePerUnit", "image"],
  noCompetitor: ["idea", "category"],
  f4: ["idea", "category", "image"],
  f5: ["idea", "category", "division"],
  cost: ["idea", "name", "category", "division"],
  margin: ["category", "division", "grammage", "cogs", "netMargin", "mrp", "competitorPrice", "competitorPack"],
  priceEvents: ["category", "grammage", "mrp"],
};

export const RESEARCH_STEPS = Object.keys(STEP_FIELDS);

function norm(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).trim().replace(/\s+/g, " ").toLowerCase();
}

export function stepFingerprint(step, fields = {}) {
  const keys = STEP_FIELDS[step];
  if (!keys) throw new Error(`Unknown research step: ${step}`);
  const picked = {};
  for (const key of keys) picked[key] = norm(fields[key]);
  return createHash("sha256").update(JSON.stringify({ step, picked })).digest("hex");
}

export function researchStepFields({
  idea = "",
  name = "",
  category = "",
  benchmark = "",
  attributes = [],
  pureCommodity = false,
  pricePerUnit = "",
  image = "",
  division = "",
  grammage = "",
  cogs = "",
  netMargin = "",
  mrp = "",
  competitorPrice = "",
  competitorPack = "",
} = {}) {
  const attrs = Array.isArray(attributes) ? attributes : [];
  const shared = {
    idea,
    name,
    category,
    benchmark,
    attribute1: attrs[0] || "",
    attribute2: attrs[1] || "",
    attribute3: attrs[2] || "",
    pureCommodity,
    pricePerUnit,
    image,
    division,
    grammage,
    cogs,
    netMargin,
    mrp,
    competitorPrice,
    competitorPack,
  };
  const out = {};
  for (const step of RESEARCH_STEPS) {
    out[step] = {};
    for (const key of STEP_FIELDS[step]) out[step][key] = shared[key];
  }
  return out;
}

export function stepsToRerun(before, after) {
  const prev = researchStepFields(before);
  const next = researchStepFields(after);
  return RESEARCH_STEPS.filter((step) => stepFingerprint(step, prev[step]) !== stepFingerprint(step, next[step]));
}

function cacheable(value) {
  return researchResultIsCacheable(value);
}

async function defaultLoad(step, fingerprint) {
  const db = await import("./db.js");
  await db.initDb();
  if (db.isUsingPostgres()) {
    const rows = await db.query(
      `SELECT payload FROM research_step_cache WHERE step = $1 AND fingerprint = $2`,
      [step, fingerprint]
    );
    if (!rows[0]?.payload) return null;
    return typeof rows[0].payload === "string" ? JSON.parse(rows[0].payload) : rows[0].payload;
  }
  const map = await readStepFile();
  return map[`${step}:${fingerprint}`]?.payload ?? null;
}

async function defaultSave(step, fingerprint, payload) {
  const db = await import("./db.js");
  await db.initDb();
  const json = JSON.stringify(payload);
  if (db.isUsingPostgres()) {
    await db.query(
      `INSERT INTO research_step_cache (step, fingerprint, payload, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (step, fingerprint) DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()`,
      [step, fingerprint, json]
    );
    return;
  }
  const map = await readStepFile();
  map[`${step}:${fingerprint}`] = { step, fingerprint, payload, createdAt: new Date().toISOString() };
  await writeStepFile(map);
}

async function stepFile() {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "research_step_cache.json");
}

async function readStepFile() {
  const { promises: fs } = await import("node:fs");
  try {
    const parsed = JSON.parse(await fs.readFile(await stepFile(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStepFile(map) {
  const { promises: fs } = await import("node:fs");
  await fs.writeFile(await stepFile(), JSON.stringify(map));
}

export function memoryStepStore() {
  const map = new Map();
  return {
    async load(step, fingerprint) {
      return map.has(`${step}:${fingerprint}`) ? map.get(`${step}:${fingerprint}`) : null;
    },
    async save(step, fingerprint, payload) {
      map.set(`${step}:${fingerprint}`, payload);
    },
  };
}

export async function runResearchStep(step, fields, run, { forceFresh = false, store = null } = {}) {
  const fingerprint = stepFingerprint(step, fields);
  const load = store?.load || defaultLoad;
  const save = store?.save || defaultSave;
  if (!forceFresh) {
    const hit = await load(step, fingerprint);
    if (hit) {
      if (hit.evidence && typeof hit.evidence === "object") {
        return { ...hit, evidence: { ...hit.evidence, cacheHit: true } };
      }
      return hit;
    }
  }
  const value = await run();
  if (cacheable(value)) await save(step, fingerprint, value);
  return value;
}

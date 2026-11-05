import { researchResultIsCacheable } from "./researchCacheable.js";
import { dataDir } from "./dataDir.js";

function normCategory(category) {
  return String(category || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Default off. Cross-idea reuse stays disabled until the three-idea check passes. */
export function categoryFactCacheEnabled() {
  return String(process.env.CATEGORY_FACT_CACHE || "off").trim().toLowerCase() === "on";
}

/**
 * Every input the research function reads is part of the scope.
 * idea text is included, so a fact is not reused for a different idea.
 * Grammage is included for average price, and the stored number is ₹ per g or ml.
 */
export function categoryFactScope(factType, { ideaText = "", grammage = "", price = "" } = {}) {
  const idea = normCategory(ideaText);
  if (factType === "inflation") return `idea:${idea}`;
  if (factType === "avg-price") return `idea:${idea}|grammage:${normCategory(grammage)}`;
  if (factType === "f3-price-events") {
    return `idea:${idea}|grammage:${normCategory(grammage)}|price:${normCategory(price)}`;
  }
  return null;
}

export function categoryFactTtlDays() {
  const n = Number(process.env.CATEGORY_FACT_TTL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 45;
}

export function categoryFactFresh(asOf, now = Date.now(), ttlDays = categoryFactTtlDays()) {
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return false;
  return now - t < ttlDays * 24 * 60 * 60 * 1000;
}

export function stampCategoryFact(payload, asOfIso) {
  if (!payload || typeof payload !== "object") return payload;
  const day = String(asOfIso || "").slice(0, 10);
  const stamp = `as of ${day}`;
  const next = { ...payload, asOf: day };
  if (typeof next.basis === "string" && next.basis && !next.basis.includes("as of ")) {
    next.basis = `${next.basis} (${stamp})`;
  }
  if (typeof next.source === "string" && next.source && !next.source.includes("as of ")) {
    next.source = `${next.source} (${stamp})`;
  }
  return next;
}

async function factFile() {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  const dir = dataDir();
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, "category_facts.json");
}

function factKey(category, scope, factType) {
  return `${normCategory(category)}|${normCategory(scope) || "in"}|${normCategory(factType)}`;
}

export async function readCategoryFact(category, scope, factType, now = Date.now()) {
  const key = factKey(category, scope, factType);
  if (!normCategory(category) || !normCategory(factType)) return null;
  const db = await import("./db.js");
  await db.initDb();
  let row = null;
  if (db.isUsingPostgres()) {
    const rows = await db.query(
      `SELECT payload, as_of FROM category_facts
       WHERE normalized_category = $1 AND scope = $2 AND fact_type = $3`,
      [normCategory(category), normCategory(scope) || "in", normCategory(factType)]
    );
    row = rows[0] || null;
  } else {
    const { promises: fs } = await import("node:fs");
    try {
      const map = JSON.parse(await fs.readFile(await factFile(), "utf8"));
      row = map[key] || null;
    } catch {
      row = null;
    }
  }
  if (!row) return null;
  const asOf = row.as_of || row.asOf;
  if (!categoryFactFresh(asOf, now)) return null;
  const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
  return stampCategoryFact(payload, asOf);
}

export async function writeCategoryFact(category, scope, factType, payload) {
  if (!normCategory(category) || !normCategory(factType) || payload == null) return;
  if (!researchResultIsCacheable(payload)) return;
  const asOf = new Date().toISOString();
  const stored = { ...payload, asOf: asOf.slice(0, 10) };
  const db = await import("./db.js");
  await db.initDb();
  if (db.isUsingPostgres()) {
    await db.query(
      `INSERT INTO category_facts (normalized_category, scope, fact_type, payload, as_of)
       VALUES ($1, $2, $3, $4, $5::timestamptz)
       ON CONFLICT (normalized_category, scope, fact_type)
       DO UPDATE SET payload = EXCLUDED.payload, as_of = EXCLUDED.as_of`,
      [normCategory(category), normCategory(scope) || "in", normCategory(factType), JSON.stringify(stored), asOf]
    );
    return;
  }
  const { promises: fs } = await import("node:fs");
  const file = await factFile();
  let map = {};
  try {
    map = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    map = {};
  }
  map[factKey(category, scope, factType)] = { payload: stored, asOf };
  await fs.writeFile(file, JSON.stringify(map));
}

export async function withCategoryFact({
  category,
  scope = "in",
  factType,
  forceFresh = false,
  run,
  cacheable = researchResultIsCacheable,
}) {
  if (!categoryFactCacheEnabled() || !scope) return run();
  if (!forceFresh) {
    const hit = await readCategoryFact(category, scope, factType);
    if (hit) {
      if (hit.evidence && typeof hit.evidence === "object") {
        return { ...hit, evidence: { ...hit.evidence, cacheHit: true } };
      }
      return hit;
    }
  }
  const fresh = await run();
  if (cacheable(fresh)) {
    await writeCategoryFact(category, scope, factType, fresh);
    return stampCategoryFact(fresh, new Date().toISOString());
  }
  return fresh;
}

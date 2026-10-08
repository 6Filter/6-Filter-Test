import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { initDb, isUsingPostgres, runQuery } from "../db.js";
import { dataDir } from "../dataDir.js";

function intelFile() {
  return path.join(dataDir(), "category-intel.json");
}

async function readFileDb() {
  try {
    const raw = await fs.readFile(intelFile(), "utf8");
    const data = JSON.parse(raw);
    return {
      calibration: Array.isArray(data.calibration) ? data.calibration : [],
      sizing: Array.isArray(data.sizing) ? data.sizing : [],
      trends: Array.isArray(data.trends) ? data.trends : [],
    };
  } catch {
    return { calibration: [], sizing: [], trends: [] };
  }
}

async function writeFileDb(data) {
  await fs.mkdir(path.dirname(intelFile()), { recursive: true });
  await fs.writeFile(intelFile(), JSON.stringify(data, null, 2), "utf8");
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function saveCalibration({
  engineId,
  outputMeasured,
  archetype,
  multiplier,
  measuredFromCategory,
  confidence,
}) {
  await initDb();
  const id = randomUUID();
  const measuredAt = new Date().toISOString();
  const row = {
    id,
    engine_id: engineId,
    output_measured: outputMeasured || "category value",
    archetype,
    multiplier: Number(multiplier),
    measured_from_category: measuredFromCategory || null,
    confidence: confidence || null,
    measured_at: measuredAt,
  };
  if (isUsingPostgres()) {
    await runQuery(
      `INSERT INTO calibration_factors
        (id, engine_id, output_measured, archetype, multiplier, measured_from_category, confidence, measured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        row.id,
        row.engine_id,
        row.output_measured,
        row.archetype,
        row.multiplier,
        row.measured_from_category,
        row.confidence,
        row.measured_at,
      ]
    );
  } else {
    const db = await readFileDb();
    db.calibration.unshift(row);
    await writeFileDb(db);
  }
  return row;
}

export async function latestCalibration(engineId, archetype) {
  await initDb();
  const engine = String(engineId || "").trim();
  const arch = String(archetype || "").trim();
  if (!engine || !arch) return null;
  if (isUsingPostgres()) {
    const rows = await runQuery(
      `SELECT * FROM calibration_factors
       WHERE engine_id = $1 AND archetype = $2
       ORDER BY measured_at DESC
       LIMIT 1`,
      [engine, arch]
    );
    return rows[0] || null;
  }
  const db = await readFileDb();
  return (
    db.calibration.find((r) => r.engine_id === engine && r.archetype === arch) || null
  );
}

export async function latestSizingArchetypeForIdea(ideaId) {
  await initDb();
  const id = String(ideaId || "").trim();
  if (!id) return null;
  if (isUsingPostgres()) {
    const rows = await runQuery(
      `SELECT category_archetype FROM category_sizing_runs WHERE idea_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    return rows[0]?.category_archetype || null;
  }
  const db = await readFileDb();
  const row = db.sizing.find((r) => String(r.idea_id || "") === id);
  return row?.category_archetype || null;
}

export async function hasAnyCalibration(archetype) {
  await initDb();
  const arch = String(archetype || "").trim();
  if (isUsingPostgres()) {
    const rows = arch
      ? await runQuery(
          `SELECT id FROM calibration_factors WHERE archetype = $1 LIMIT 1`,
          [arch]
        )
      : await runQuery(`SELECT id FROM calibration_factors LIMIT 1`);
    return rows.length > 0;
  }
  const db = await readFileDb();
  return arch
    ? db.calibration.some((r) => r.archetype === arch)
    : db.calibration.length > 0;
}

export async function saveSizingRun(payload) {
  await initDb();
  const id = payload.id || randomUUID();
  const createdAt = payload.created_at || new Date().toISOString();
  const row = {
    id,
    idea_id: payload.idea_id || payload.ideaId || null,
    category_archetype: payload.category_archetype || payload.categoryArchetype || null,
    engines_run_json: JSON.stringify(payload.enginesRun || []),
    engines_not_run_json: JSON.stringify(payload.enginesNotRun || []),
    reconciliation_json: JSON.stringify(payload.reconciliation || null),
    growth_decomposition_json: JSON.stringify(payload.growthDecomposition || null),
    what_could_not_be_established: payload.whatCouldNotBeEstablished || "",
    created_at: createdAt,
  };
  if (isUsingPostgres()) {
    await runQuery(
      `INSERT INTO category_sizing_runs
        (id, idea_id, category_archetype, engines_run_json, engines_not_run_json,
         reconciliation_json, growth_decomposition_json, what_could_not_be_established, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        row.id,
        row.idea_id,
        row.category_archetype,
        row.engines_run_json,
        row.engines_not_run_json,
        row.reconciliation_json,
        row.growth_decomposition_json,
        row.what_could_not_be_established,
        row.created_at,
      ]
    );
  } else {
    const db = await readFileDb();
    db.sizing.unshift(row);
    await writeFileDb(db);
  }
  return hydrateSizing(row);
}

export async function updateSizingRun(id, payload) {
  const existing = await getSizingRun(id);
  if (!existing) return null;
  const next = {
    ...existing,
    ...payload,
    enginesRun: payload.enginesRun ?? existing.enginesRun,
    enginesNotRun: payload.enginesNotRun ?? existing.enginesNotRun,
    reconciliation: payload.reconciliation ?? existing.reconciliation,
    growthDecomposition: payload.growthDecomposition ?? existing.growthDecomposition,
  };
  const enginesRunJson = JSON.stringify(next.enginesRun || []);
  const enginesNotRunJson = JSON.stringify(next.enginesNotRun || []);
  const reconJson = JSON.stringify(next.reconciliation || null);
  const growthJson = JSON.stringify(next.growthDecomposition || null);
  await initDb();
  if (isUsingPostgres()) {
    await runQuery(
      `UPDATE category_sizing_runs SET
         category_archetype = $1,
         engines_run_json = $2,
         engines_not_run_json = $3,
         reconciliation_json = $4,
         growth_decomposition_json = $5,
         what_could_not_be_established = $6
       WHERE id = $7`,
      [
        next.categoryArchetype || next.category_archetype || null,
        enginesRunJson,
        enginesNotRunJson,
        reconJson,
        growthJson,
        next.whatCouldNotBeEstablished || "",
        id,
      ]
    );
  } else {
    const db = await readFileDb();
    const idx = db.sizing.findIndex((r) => r.id === id);
    if (idx >= 0) {
      db.sizing[idx] = {
        ...db.sizing[idx],
        category_archetype: next.categoryArchetype || db.sizing[idx].category_archetype,
        engines_run_json: enginesRunJson,
        engines_not_run_json: enginesNotRunJson,
        reconciliation_json: reconJson,
        growth_decomposition_json: growthJson,
        what_could_not_be_established: next.whatCouldNotBeEstablished || "",
      };
      await writeFileDb(db);
    }
  }
  return getSizingRun(id);
}

export async function getSizingRun(id) {
  await initDb();
  if (!id) return null;
  if (isUsingPostgres()) {
    const rows = await runQuery(`SELECT * FROM category_sizing_runs WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? hydrateSizing(rows[0]) : null;
  }
  const db = await readFileDb();
  const row = db.sizing.find((r) => r.id === id);
  return row ? hydrateSizing(row) : null;
}

function hydrateSizing(row) {
  return {
    id: row.id,
    ideaId: row.idea_id,
    categoryArchetype: row.category_archetype,
    enginesRun: parseJson(row.engines_run_json, []),
    enginesNotRun: parseJson(row.engines_not_run_json, []),
    reconciliation: parseJson(row.reconciliation_json, null),
    growthDecomposition: parseJson(row.growth_decomposition_json, null),
    whatCouldNotBeEstablished: row.what_could_not_be_established || "",
    createdAt: row.created_at,
  };
}

export async function saveFormatTrend(payload) {
  await initDb();
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const row = {
    id,
    idea_id: payload.ideaId || payload.idea_id || null,
    format_trend_direction: payload.formatTrendDirection || null,
    digital_proxy_signal: payload.digitalProxySignal || "",
    analog_transfer_signal: payload.analogTransferSignal || "",
    early_warning_signal: payload.earlyWarningSignal || payload.earlyRiskSignal || "",
    trademark_filings_json: JSON.stringify(payload.trademarkFilingsFound || []),
    sources_json: JSON.stringify(payload.sources || []),
    created_at: createdAt,
  };
  if (isUsingPostgres()) {
    await runQuery(
      `INSERT INTO format_trend_assessments
        (id, idea_id, format_trend_direction, digital_proxy_signal, analog_transfer_signal,
         early_warning_signal, trademark_filings_json, sources_json, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        row.id,
        row.idea_id,
        row.format_trend_direction,
        row.digital_proxy_signal,
        row.analog_transfer_signal,
        row.early_warning_signal,
        row.trademark_filings_json,
        row.sources_json,
        row.created_at,
      ]
    );
  } else {
    const db = await readFileDb();
    db.trends.unshift(row);
    await writeFileDb(db);
  }
  return { id, ...payload, createdAt };
}

export async function linkSizingRunToIdea(runId, ideaId) {
  if (!runId || !ideaId) return;
  await initDb();
  if (isUsingPostgres()) {
    await runQuery(`UPDATE category_sizing_runs SET idea_id = $1 WHERE id = $2`, [ideaId, runId]);
    return;
  }
  const db = await readFileDb();
  const row = db.sizing.find((r) => r.id === runId);
  if (row) {
    row.idea_id = ideaId;
    await writeFileDb(db);
  }
}

export async function linkFormatTrendToIdea(trendId, ideaId) {
  if (!trendId || !ideaId) return;
  await initDb();
  if (isUsingPostgres()) {
    await runQuery(`UPDATE format_trend_assessments SET idea_id = $1 WHERE id = $2`, [ideaId, trendId]);
    return;
  }
  const db = await readFileDb();
  const row = db.trends.find((r) => r.id === trendId);
  if (row) {
    row.idea_id = ideaId;
    await writeFileDb(db);
  }
}

export async function getFormatTrend(id) {
  await initDb();
  if (!id) return null;
  if (isUsingPostgres()) {
    const rows = await runQuery(`SELECT * FROM format_trend_assessments WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] || null;
  }
  const db = await readFileDb();
  return db.trends.find((r) => r.id === id) || null;
}

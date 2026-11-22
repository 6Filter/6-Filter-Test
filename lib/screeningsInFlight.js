import { randomUUID } from "node:crypto";

/**
 * Screenings in flight: research currently running in this process, or (when
 * Postgres is up) leftover `research_inflight` rows from a crash or another
 * instance. Health exposes only the number — never idea text, emails, or payloads.
 *
 * Process-local is the live count for this Node process. The table stores an
 * opaque token and a timestamp only, so a deploy can still wait after a crash
 * until those rows age out (IN_FLIGHT_TTL_MINUTES).
 */
export const IN_FLIGHT_TTL_MINUTES = 45;

let processLocalCount = 0;

export function processLocalScreeningsInFlight() {
  return processLocalCount;
}

export function beginScreeningInFlight() {
  processLocalCount += 1;
  return processLocalCount;
}

export function endScreeningInFlight() {
  processLocalCount = Math.max(0, processLocalCount - 1);
  return processLocalCount;
}

/** Test hook — never call from production paths. */
export function resetScreeningsInFlightForTests() {
  processLocalCount = 0;
}

function postgresApi(db) {
  if (!db || typeof db.isUsingPostgres !== "function") return false;
  return Boolean(db.isUsingPostgres());
}

async function loadDb(db) {
  if (db) return db;
  return import("./db.js");
}

async function insertInflightRow(id, db) {
  const database = await loadDb(db);
  if (typeof database.initDb === "function") await database.initDb();
  if (!postgresApi(database) || typeof database.query !== "function") return;
  await database.query(`INSERT INTO research_inflight (id, started_at) VALUES ($1, NOW())`, [id]);
}

async function deleteInflightRow(id, db) {
  const database = await loadDb(db);
  if (!postgresApi(database) || typeof database.query !== "function") return;
  await database.query(`DELETE FROM research_inflight WHERE id = $1`, [id]);
}

/** COUNT(*) of tokens only. No research body columns. */
export async function countDbScreeningsInFlight(db) {
  const database = await loadDb(db);
  if (typeof database.initDb === "function") await database.initDb();
  if (!postgresApi(database) || typeof database.query !== "function") return 0;
  const rows = await database.query(
    `SELECT COUNT(*)::int AS n FROM research_inflight
     WHERE started_at > NOW() - ($1::int * INTERVAL '1 minute')`,
    [IN_FLIGHT_TTL_MINUTES]
  );
  const n = Number(rows?.[0]?.n);
  return Number.isFinite(n) ? n : 0;
}

export async function countScreeningsInFlight({ db } = {}) {
  const local = processLocalCount;
  let fromDb = 0;
  try {
    fromDb = await countDbScreeningsInFlight(db);
  } catch {
    fromDb = 0;
  }
  return Math.max(local, fromDb);
}

export async function withScreeningInFlight(fn, { db } = {}) {
  beginScreeningInFlight();
  const id = randomUUID();
  try {
    await insertInflightRow(id, db).catch(() => {});
    return await fn();
  } finally {
    endScreeningInFlight();
    await deleteInflightRow(id, db).catch(() => {});
  }
}

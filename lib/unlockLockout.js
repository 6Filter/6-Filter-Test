/**
 * Per-team unlock lockout. Ten failures inside 15 minutes lock that team for
 * 15 minutes. Postgres when the app is on the database; memory otherwise.
 */
import { initDb, isUsingPostgres, query } from "./db.js";

export const UNLOCK_MAX_FAILURES = 10;
export const UNLOCK_WINDOW_MS = 15 * 60 * 1000;

const memory = new Map();

export function nextUnlockFailureState(row, now = Date.now()) {
  const started = Number(row?.windowStartedAt) || 0;
  const lockedUntil = Number(row?.lockedUntil) || 0;
  if (lockedUntil && now < lockedUntil) {
    return {
      failureCount: Number(row?.failureCount) || UNLOCK_MAX_FAILURES,
      windowStartedAt: started || now,
      lockedUntil,
      locked: true,
    };
  }
  let count = Number(row?.failureCount) || 0;
  let windowStartedAt = started;
  const windowExpired = !windowStartedAt || now - windowStartedAt >= UNLOCK_WINDOW_MS;
  const lockExpired = lockedUntil && now >= lockedUntil;
  if (windowExpired || lockExpired) {
    count = 0;
    windowStartedAt = now;
  }
  count += 1;
  const nextLock = count >= UNLOCK_MAX_FAILURES ? now + UNLOCK_WINDOW_MS : 0;
  return {
    failureCount: count,
    windowStartedAt,
    lockedUntil: nextLock,
    locked: Boolean(nextLock),
  };
}

export function isUnlockLocked(row, now = Date.now()) {
  const lockedUntil = Number(row?.lockedUntil) || 0;
  return Boolean(lockedUntil && now < lockedUntil);
}

function fromDbRow(row) {
  if (!row) return null;
  return {
    failureCount: Number(row.failure_count) || 0,
    windowStartedAt: Number(row.window_started_ms) || 0,
    lockedUntil: Number(row.locked_until_ms) || 0,
  };
}

async function readState(department) {
  await initDb();
  if (!isUsingPostgres()) return memory.get(department) || null;
  const rows = await query(
    `SELECT failure_count, window_started_ms, locked_until_ms
     FROM department_unlock_lockouts WHERE department = $1`,
    [department]
  );
  return fromDbRow(rows[0]);
}

async function writeState(department, state) {
  await initDb();
  if (!isUsingPostgres()) {
    if (!state) memory.delete(department);
    else memory.set(department, state);
    return;
  }
  if (!state) {
    await query(`DELETE FROM department_unlock_lockouts WHERE department = $1`, [department]);
    return;
  }
  await query(
    `INSERT INTO department_unlock_lockouts (department, failure_count, window_started_ms, locked_until_ms)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (department) DO UPDATE SET
       failure_count = EXCLUDED.failure_count,
       window_started_ms = EXCLUDED.window_started_ms,
       locked_until_ms = EXCLUDED.locked_until_ms`,
    [department, state.failureCount, state.windowStartedAt, state.lockedUntil || null]
  );
}

export async function departmentUnlockLocked(department, now = Date.now()) {
  const dept = String(department || "").trim();
  if (!dept) return false;
  return isUnlockLocked(await readState(dept), now);
}

export async function recordDepartmentUnlockFailure(department, now = Date.now()) {
  const dept = String(department || "").trim();
  if (!dept) return null;
  const next = nextUnlockFailureState(await readState(dept), now);
  await writeState(dept, next);
  return next;
}

export async function clearDepartmentUnlockFailures(department) {
  const dept = String(department || "").trim();
  if (!dept) return;
  await writeState(dept, null);
}

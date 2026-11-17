import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./dataDir.js";

export const ARCHIVE_KEEP_MS = 90 * 24 * 60 * 60 * 1000;
const WRITE_GAP_MS = 60000;

let lastCountWriteMs = 0;

function dataFile(name) {
  return path.join(dataDir(), name);
}

export async function fileAppendAudit({ action, actor = "", ids = [], now = new Date() } = {}) {
  const auditFile = dataFile("proposition_audit.json");
  const audit = await readJson(auditFile, []);
  const rows = Array.isArray(audit) ? audit : [];
  rows.push({
    at: now.toISOString(),
    action,
    actor: String(actor || ""),
    row_count: ids.length,
    ids_json: ids,
  });
  await writeJson(auditFile, rows);
}

async function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}

function fresh(deletedAt, now = Date.now()) {
  const t = new Date(deletedAt).getTime();
  return Number.isFinite(t) && now - t <= ARCHIVE_KEEP_MS;
}

export function decideCountAlarm({ lastCount, previousMax, auditedDeletes = 0, alarmAlreadySent = false }) {
  if (alarmAlreadySent) return null;
  if (previousMax == null || !Number.isFinite(Number(previousMax))) return null;
  const drop = Number(previousMax) - Number(lastCount);
  if (!(drop > 5)) return null;
  if (Number(auditedDeletes) >= drop) return null;
  return `Proposition count dropped from ${previousMax} to ${lastCount} with no audit record.`;
}

export async function fileAppendDeletion(rows, { actor = "", action = "delete", now = new Date() } = {}) {
  const archiveFile = dataFile("deleted_propositions.json");
  const auditFile = dataFile("proposition_audit.json");
  const archive = await readJson(archiveFile, []);
  const audit = await readJson(auditFile, []);
  const deletedAt = now.toISOString();
  const kept = (Array.isArray(archive) ? archive : []).filter(
    (row) => fresh(row.deleted_at, now.getTime()) && !rows.some((doc) => doc.id === row.id)
  );
  for (const row of rows) {
    kept.push({
      id: row.id,
      deleted_at: deletedAt,
      deleted_by: String(actor || ""),
      payload_json: row,
    });
  }
  audit.push({
    at: deletedAt,
    action,
    actor: String(actor || ""),
    row_count: rows.length,
    ids_json: rows.map((row) => row.id),
  });
  await writeJson(archiveFile, kept);
  await writeJson(auditFile, audit);
}

export async function fileListArchive() {
  const rows = await readJson(dataFile("deleted_propositions.json"), []);
  return (Array.isArray(rows) ? rows : []).filter((row) => fresh(row.deleted_at));
}

export async function auditedDeletesSince(sinceIso) {
  const rows = await fileListAudit();
  return rows
    .filter((row) => String(row.action || "").startsWith("delete") && String(row.at || "") >= sinceIso)
    .reduce((sum, row) => sum + Number(row.row_count || 0), 0);
}

export async function fileListAudit() {
  const rows = await readJson(dataFile("proposition_audit.json"), []);
  return Array.isArray(rows) ? rows : [];
}

export async function fileTakeArchive(id) {
  const archiveFile = dataFile("deleted_propositions.json");
  const rows = await readJson(archiveFile, []);
  const list = Array.isArray(rows) ? rows : [];
  const hit = list.find((row) => row.id === id && fresh(row.deleted_at));
  return hit || null;
}

export function dayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function previousDayKey(now = new Date()) {
  return dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

/**
 * At most one count-log write per minute. Returns the alarm text when one should be sent.
 */
export async function noteFilePropositionCount(count, { now = new Date(), force = false, auditedDeletes = 0 } = {}) {
  const ms = now.getTime();
  if (!force && ms - lastCountWriteMs < WRITE_GAP_MS) return { wrote: false, alarm: null };
  lastCountWriteMs = ms;
  const file = dataFile("proposition_count_log.json");
  const rows = await readJson(file, []);
  const list = Array.isArray(rows) ? rows : [];
  const day = dayKey(now);
  const prev = list.find((row) => row.day === previousDayKey(now));
  let today = list.find((row) => row.day === day);
  if (!today) {
    today = { day, min_count: count, max_count: count, last_count: count, alarm_sent: false };
    list.push(today);
  } else {
    today.min_count = Math.min(today.min_count, count);
    today.max_count = Math.max(today.max_count, count);
    today.last_count = count;
  }
  const alarm = decideCountAlarm({
    lastCount: count,
    previousMax: prev?.max_count ?? null,
    auditedDeletes,
    alarmAlreadySent: Boolean(today.alarm_sent),
  });
  if (alarm) today.alarm_sent = true;
  await writeJson(file, list);
  return { wrote: true, alarm };
}

export async function clearCountDays(days) {
  const file = dataFile("proposition_count_log.json");
  const rows = await readJson(file, []);
  const drop = new Set(days);
  await writeJson(
    file,
    (Array.isArray(rows) ? rows : []).filter((row) => !drop.has(row.day))
  );
}

export function resetCountWriteThrottle() {
  lastCountWriteMs = 0;
}

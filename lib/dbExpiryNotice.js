import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./dataDir.js";
import { dbExpiresInDays, decideExpiryAlarm } from "./dbExpiry.js";

function noticeFile() {
  return path.join(dataDir(), "db_expiry_notices.json");
}

async function readNoticeKeys() {
  try {
    const raw = await readFile(noticeFile(), "utf8");
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function writeNoticeKeys(keys) {
  await mkdir(path.dirname(noticeFile()), { recursive: true });
  await writeFile(noticeFile(), JSON.stringify([...keys], null, 2));
}

export async function noteDbExpiryAlarm(now = new Date(), store) {
  const expiresAt = String(process.env.DB_EXPIRES_AT || "").trim();
  const daysLeft = dbExpiresInDays(now, expiresAt);
  if (!expiresAt || daysLeft == null) return { daysLeft: null, alarm: null };

  if (store) {
    const alreadySent = await store.has(expiresAt, daysLeft);
    const alarm = decideExpiryAlarm({ daysLeft, alreadySent });
    if (alarm) await store.add(expiresAt, daysLeft);
    return { daysLeft, alarm };
  }

  const { initDb, isUsingPostgres, query } = await import("./db.js");
  await initDb();
  if (!isUsingPostgres()) {
    const key = `${expiresAt}|${daysLeft}`;
    const keys = await readNoticeKeys();
    const alarm = decideExpiryAlarm({ daysLeft, alreadySent: keys.has(key) });
    if (alarm) {
      keys.add(key);
      await writeNoticeKeys(keys);
    }
    return { daysLeft, alarm };
  }

  const existing = await query(
    `SELECT 1 FROM db_expiry_notices WHERE expires_at = $1 AND days_left = $2`,
    [expiresAt, daysLeft]
  );
  const alarm = decideExpiryAlarm({ daysLeft, alreadySent: existing.length > 0 });
  if (!alarm) return { daysLeft, alarm: null };
  await query(
    `INSERT INTO db_expiry_notices (expires_at, days_left) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [expiresAt, daysLeft]
  );
  return { daysLeft, alarm };
}

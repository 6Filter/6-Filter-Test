const DAY_MS = 86400000;
const DELETION_GRACE_DAYS = 14;
const ALARM_DAYS = new Set([14, 7, 3, 1]);

/** Browser-safe. The Log page imports this module; `process` is absent there. */
export function dbExpiresAtFromEnv() {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env.DB_EXPIRES_AT;
}

export function dbExpiresInDays(now = new Date(), expiresAt = dbExpiresAtFromEnv()) {
  const expires = Date.parse(String(expiresAt || "").trim());
  if (!Number.isFinite(expires)) return null;
  return Math.ceil((expires - now.getTime()) / DAY_MS);
}

/** A row's own wipeAt wins. Otherwise the deletion date is expiry plus the 14-day grace. */
export function ideaWipeAt(doc = {}, expiresAt = dbExpiresAtFromEnv()) {
  const stamped = Date.parse(doc?.wipeAt || "");
  if (Number.isFinite(stamped)) return new Date(stamped).toISOString();
  const expires = Date.parse(String(expiresAt || "").trim());
  if (!Number.isFinite(expires)) return "";
  return new Date(expires + DELETION_GRACE_DAYS * DAY_MS).toISOString();
}

export function expiryAlarmText(days) {
  return `Primus database expires in ${days} days. Upgrade or migrate.`;
}

export function decideExpiryAlarm({ daysLeft, alreadySent }) {
  if (!ALARM_DAYS.has(daysLeft)) return null;
  if (alreadySent) return null;
  return expiryAlarmText(daysLeft);
}

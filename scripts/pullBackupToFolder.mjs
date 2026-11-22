#!/usr/bin/env node
/**
 * SAVE THE APP'S OWN ENCRYPTED BACKUP INTO A FOLDER YOU OWN (for example a OneDrive or SharePoint folder that syncs, or an external drive). No cloud account, no SAS, no database access, no pg_dump and NEVER the encryption key:
 * the app already makes the encrypted backup (GET /api/admin/backup/export, protected by BACKUP_TOKEN). This script fetches it, checks it is a fresh whole Primus backup, writes it safely, checks what it wrote, and tidies old copies.
 *
 *   node scripts/pullBackupToFolder.mjs backup        fetch, verify, store (default)
 *   node scripts/pullBackupToFolder.mjs status        how old is the newest COMPLETE backup? exit 1 if none or older than 26 hours (run it as a second scheduled check)
 *
 * Settings, from the environment ONLY:   APP_URL   BACKUP_TOKEN (or BACKUP_TOKEN_FILE = a file holding it)   BACKUP_DIR (the folder)   BACKUP_KEEP (copies to keep, default 60)
 *                                        OPS_ALERT_WEBHOOK_URL (optional: a Slack webhook; or OPS_ALERT_WEBHOOK_URL_FILE) so a failure tells a person
 * Safety rules (each tested by testPullBackupToFolder.mjs): the token and the webhook never appear in any output or alert; the file must be a fresh whole Primus backup before it is written; it is written to a temporary name and renamed only when complete; a file is never overwritten;
 * every copy has a small marker (.json) with its SHA-256, written last, and "status" only counts complete copies; tidying deletes only this script's own files and never the one just written; a failure raises the alert and exits non-zero.
 * Exit codes: 0 ok; 1 a check failed or the newest backup is too old; 2 refused or failed before anything was stored.
 */
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const cmd = process.argv[2] || "backup"; const readSecret = (name) => { const f = process.env[`${name}_FILE`]; if (f) { try { return fs.readFileSync(f, "utf8").trim(); } catch { return ""; } } return (process.env[name] || "").trim(); };
const APP = String(process.env.APP_URL || "").replace(/\/+$/, ""), TOKEN = readSecret("BACKUP_TOKEN"), HOOK = readSecret("OPS_ALERT_WEBHOOK_URL"), DIR = process.env.BACKUP_DIR || "", KEEP = Math.max(3, Number(process.env.BACKUP_KEEP || 60));
const MAX = 400 * 1024 * 1024, MIN_TABLES = Number(process.env.MIN_TABLES || 20), FRESH_MS = 15 * 60 * 1000, TIMEOUT = Number(process.env.EXPORT_TIMEOUT_MS || 300000), STALE_MS = 26 * 3600 * 1000;
const redact = (s) => { let t = String(s); for (const sec of [TOKEN, HOOK]) if (sec && sec.length > 3) t = t.split(sec).join("***"); return t; };
const say = (m) => console.log(redact(m));
// Exit by throwing and setting process.exitCode, never process.exit(): on Windows, process.exit() right after fetch can abort the process (libuv assertion, exit code 3221226505).
class Exit extends Error { constructor(code) { super("exit"); this.code = code; } }
async function fetchBody(url, opts = {}, ms = 20000) { const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), ms); try { const res = await fetch(url, { ...opts, signal: ac.signal }); const buf = Buffer.from(await res.arrayBuffer()); return { res, buf }; } catch (e) { if (ac.signal.aborted) { const t = new Error("timeout"); t.name = "TimeoutError"; throw t; } throw e; } finally { clearTimeout(timer); } }
async function alertPerson(message) { if (!HOOK) return; try { await fetchBody(HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: redact(`Primus backup: ${message}`) }) }, 15000); } catch { /* a failing alert must never hide the real failure */ } }
async function stop(code, m) { console.error(redact(m)); await alertPerson(m); throw new Exit(code); }
const PATTERN = /^primus-backup-\d{8}-\d{6}-[0-9a-f]{4}Z\.(bk|json)$/;
const completeBackups = () => { if (!DIR || !fs.existsSync(DIR)) return []; const names = fs.readdirSync(DIR); return names.filter((n) => /\.bk$/.test(n) && PATTERN.test(n) && names.includes(n.replace(/\.bk$/, ".json"))).sort(); };
async function main() {
if (!DIR) { await stop(2, "REFUSED: set BACKUP_DIR to the folder where backups are kept."); }
if (cmd === "status") {
  const list = completeBackups(); if (!list.length) { await stop(1, `NO COMPLETE BACKUP found in ${DIR}.`); }
  const newest = list[list.length - 1]; const marker = JSON.parse(fs.readFileSync(path.join(DIR, newest.replace(/\.bk$/, ".json")), "utf8")); const age = Date.now() - Date.parse(marker.createdAt);
  say(`${list.length} complete backup(s); newest ${newest} made ${marker.createdAt} (${Math.round(age / 3600000 * 10) / 10} hours ago; ${marker.tables} tables, ${marker.rows} rows).`);
  if (!(age < STALE_MS)) await stop(1, `THE NEWEST BACKUP IS TOO OLD: ${Math.round(age / 3600000)} hours (limit 26).`); return;
}
if (cmd !== "backup") await stop(2, "Usage: pullBackupToFolder.mjs backup | status");
if (!/^https?:\/\//.test(APP)) await stop(2, "REFUSED: set APP_URL to the app's address (https://...)."); if (!TOKEN) await stop(2, "REFUSED: set BACKUP_TOKEN (or BACKUP_TOKEN_FILE).");
try { fs.mkdirSync(DIR, { recursive: true }); fs.accessSync(DIR, fs.constants.W_OK); } catch (e) { await stop(2, `REFUSED: the backup folder cannot be written (${e.code || "error"}).`); }
let res, buf; try { ({ res, buf } = await fetchBody(`${APP}/api/admin/backup/export`, { headers: { "X-Backup-Token": TOKEN } }, TIMEOUT)); } catch (e) { await stop(2, `FAILED before anything was stored: the app did not answer (${e.name === "TimeoutError" ? "timed out after " + Math.round(TIMEOUT / 1000) + " s" : e.message}).`); }
if (res.status === 401 || res.status === 403) await stop(2, "REFUSED BY THE APP: the backup token was not accepted."); if (res.status === 429) await stop(2, "REFUSED BY THE APP: exports are limited to 2 an hour. Wait and run again."); if (res.status !== 200) await stop(2, `FAILED before anything was stored: the app answered HTTP ${res.status}.`);
if (!/application\/octet-stream/i.test(res.headers.get("content-type") || "")) await stop(2, "REFUSED: the app did not return a backup file (wrong content type).");
if (buf.length < 1024) await stop(2, `REFUSED: the file is only ${buf.length} bytes, too small to be a backup.`); if (buf.length > MAX) await stop(2, "REFUSED: the file is over 400 MB.");
const MAGIC = Buffer.from("PRIMUSBK1"); if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) await stop(2, "REFUSED: the file does not start with the Primus backup header.");
const metaLen = buf.readUInt32BE(MAGIC.length); if (metaLen < 10 || metaLen > 2 * 1024 * 1024 || MAGIC.length + 4 + metaLen >= buf.length) await stop(2, "REFUSED: the backup header is damaged.");
let meta; try { meta = JSON.parse(buf.subarray(MAGIC.length + 4, MAGIC.length + 4 + metaLen).toString("utf8")); } catch { await stop(2, "REFUSED: the backup header is not readable."); }
if (meta.alg !== "aes-256-gcm" || !meta.iv || !meta.tag || !meta.sha256) await stop(2, "REFUSED: the backup header is missing its encryption details.");
const tables = Array.isArray(meta.tables) ? meta.tables : []; if (tables.length < MIN_TABLES) await stop(2, `REFUSED: the backup lists only ${tables.length} tables (at least ${MIN_TABLES} expected).`);
const hdrTables = Number(res.headers.get("x-backup-tables")); if (hdrTables && hdrTables !== tables.length) await stop(2, "REFUSED: the table count in the response header does not match the file.");
const made = Date.parse(meta.createdAt); if (!Number.isFinite(made) || Date.now() - made > FRESH_MS || made - Date.now() > 5 * 60 * 1000) await stop(2, "REFUSED: the backup is not fresh (its creation time is not within the last 15 minutes).");
const rows = tables.reduce((a, t) => a + Number(t.rows || 0), 0), stamp = new Date(made).toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-"); const base = `primus-backup-${stamp}-${crypto.randomBytes(2).toString("hex")}Z`; const final = path.join(DIR, `${base}.bk`), part = path.join(DIR, `${base}.bk.part`);
const sha = crypto.createHash("sha256").update(buf).digest("hex");
try { const fd = fs.openSync(part, "wx", 0o600); fs.writeSync(fd, buf); fs.fsyncSync(fd); fs.closeSync(fd); if (fs.existsSync(final)) throw new Error("exists"); fs.renameSync(part, final); } catch (e) { try { fs.unlinkSync(part); } catch {} await stop(2, `FAILED while writing the backup (${e.code || e.message}). Nothing was kept.`); }
const back = fs.readFileSync(final); if (back.length !== buf.length || crypto.createHash("sha256").update(back).digest("hex") !== sha) { try { fs.unlinkSync(final); } catch {} await stop(1, "NOT VERIFIED: what was read back from disk differs from what was received. The copy was removed."); }
fs.writeFileSync(path.join(DIR, `${base}.json`), JSON.stringify({ file: `${base}.bk`, bytes: buf.length, sha256: sha, tables: tables.length, rows, createdAt: meta.createdAt, rowCounts: meta.rowCounts || {} }, null, 1), { flag: "wx" });
// tidy: leftovers of an interrupted write older than an hour, and copies beyond BACKUP_KEEP (only this script's own files; never the one just written)
for (const n of fs.readdirSync(DIR)) if (/^primus-backup-.*\.bk\.part$/.test(n)) { try { if (Date.now() - fs.statSync(path.join(DIR, n)).mtimeMs > 3600_000) fs.unlinkSync(path.join(DIR, n)); } catch {} }
const all = completeBackups(); const drop = all.slice(0, Math.max(0, all.length - KEEP)).filter((n) => n !== `${base}.bk`); for (const n of drop) for (const x of [n, n.replace(/\.bk$/, ".json")]) { try { fs.unlinkSync(path.join(DIR, x)); } catch {} }
say(`BACKUP STORED AND VERIFIED: ${base}.bk  (${buf.length} bytes, ${tables.length} tables, ${rows} rows)${drop.length ? `; removed ${drop.length} old copy(ies), keeping ${KEEP}` : ""}`);
}
main().catch((e) => { if (e instanceof Exit) process.exitCode = e.code; else { console.error(redact(e?.message || e)); process.exitCode = 2; } });

#!/usr/bin/env node
/**
 * COPY THE APP'S OWN ENCRYPTED BACKUP INTO AZURE BLOB STORAGE. The app already makes an encrypted backup of every table (GET /api/admin/backup/export, AES-256-GCM, protected by BACKUP_TOKEN). This script fetches it and stores it in a Blob container,
 * checking it at both ends. It needs NO database access, NO pg_dump, and NEVER the encryption key (it cannot read the backup, which is the point): only the app's address, the backup token and a container SAS. It runs anywhere Node runs:
 * a Render Cron Job, a GitHub Action, or a Windows scheduled task.
 *
 *   node scripts/exportToBlob.mjs check                                  what the SAS allows and when it expires; writes nothing
 *   node scripts/exportToBlob.mjs backup                                 fetch the export, verify it, upload it, verify the upload
 *   node scripts/exportToBlob.mjs fetch [--blob <name>|latest] [--out <file>]   download the latest COMPLETE backup (needs a SAS with Read and List), verify its checksum
 *
 * Secrets come ONLY from the environment:  APP_URL (https://<your host>)   BACKUP_TOKEN   AZURE_BLOB_SAS_URL (a CONTAINER SAS: Create + Write for backups, Read + List to fetch; never Delete)
 * Safety rules (each tested by testExportToBlob.mjs): the token and the SAS signature never appear in any output; the file must really be a fresh Primus backup (header, algorithm, table list, size) before anything is uploaded; every upload is create-only (an existing file is never replaced, and every name is unique) and is checked against the
 * checksum Azure returns (no Read permission needed); a small marker file (.json) is written LAST, and "fetch latest" ignores any backup without one; a fetched file must match the checksum in its marker; the SAS must be https, not expired, a container, and able to write.
 * The export makes the app read every table into memory and is limited by the app to 2 calls an hour: schedule it nightly, not more. The app records the time of every export itself (lastBackupAt on /api/health), so a failed UPLOAD does not clear that: alert on this script's exit code.
 * Exit codes: 0 ok; 1 done but a check failed; 2 refused or failed before anything was stored.
 */
import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const argv = process.argv.slice(2); const cmd = argv[0]; const opt = (k, d = "") => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const APP = String(process.env.APP_URL || "").replace(/\/+$/, ""), TOKEN = process.env.BACKUP_TOKEN || "", SAS = process.env.AZURE_BLOB_SAS_URL || "";
const sigOf = (u) => (u.match(/sig=([^&]+)/) || [])[1] || "";
const redact = (s) => { let t = String(s); for (const sec of [TOKEN, sigOf(SAS), (() => { try { return decodeURIComponent(sigOf(SAS)); } catch { return ""; } })()]) if (sec && sec.length > 3) t = t.split(sec).join("***"); return t.replace(/([?&](sig|sv|se|sp|sr|spr|st|sip|skoid|sktid|skt|ske|sks|skv|ss|srt)=)[^&\s"']+/g, "$1***"); };
const say = (m) => console.log(redact(m));
// Exit by throwing and setting process.exitCode, never process.exit(): on Windows, process.exit() right after fetch can abort the process (libuv assertion, exit code 3221226505).
class Exit extends Error { constructor(code) { super("exit"); this.code = code; } }
const stop = (code, m) => { console.error(redact(m)); throw new Exit(code); };
async function fetchBody(url, opts = {}, ms = 20000) { const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), ms); try { const res = await fetch(url, { ...opts, signal: ac.signal }); const buf = Buffer.from(await res.arrayBuffer()); return { res, buf }; } catch (e) { if (ac.signal.aborted) { const t = new Error("timeout"); t.name = "TimeoutError"; throw t; } throw e; } finally { clearTimeout(timer); } }
const MAX = 400 * 1024 * 1024, MIN_TABLES = Number(process.env.MIN_TABLES || 20), FRESH_MS = 15 * 60 * 1000, TIMEOUT = Number(process.env.EXPORT_TIMEOUT_MS || 300000);
function parseSas() {
  if (!SAS) stop(2, "REFUSED: set AZURE_BLOB_SAS_URL (a container SAS URL) in the environment.");
  let u; try { u = new URL(SAS); } catch { stop(2, "REFUSED: AZURE_BLOB_SAS_URL is not a valid URL."); }
  const local = /^(127\.0\.0\.1|localhost)$/.test(u.hostname) && process.env.PRIMUS_ALLOW_INSECURE_LOCALHOST === "1"; if (u.protocol !== "https:" && !local) stop(2, "REFUSED: the SAS URL must be https.");
  const p = u.searchParams, sp = p.get("sp") || "", se = p.get("se") || "", parts = u.pathname.split("/").filter(Boolean); if (!p.get("sig")) stop(2, "REFUSED: the URL has no SAS signature (sig=).");
  if (!parts[0]) stop(2, "REFUSED: the URL must name a container."); if (parts.length > 1) stop(2, "REFUSED: this SAS URL points at ONE blob, so every backup would overwrite the last. Create a CONTAINER SAS.");
  const exp = se ? new Date(se) : null; if (exp && !(exp > new Date())) stop(2, "REFUSED: the SAS token has expired. Create a new one.");
  const days = exp ? (exp - new Date()) / 86400000 : Infinity; if (days < 14) say(`WARNING: the SAS token expires in ${Math.max(0, Math.floor(days))} day(s). Renew it before then, or the backups stop.`);
  if (sp.includes("d")) say("WARNING: this SAS allows DELETE. If it leaks, the backups can be erased. Use Create + Write (and Read + List only where you fetch).");
  return { origin: u.origin, container: parts[0], query: u.search, sp, exp };
}
const HDR = { "x-ms-version": "2021-08-06" }; const blobUrl = (s, n) => `${s.origin}/${s.container}/${encodeURIComponent(n)}${s.query}`;
async function put(s, name, buf, type = "application/octet-stream") {
  const md5 = crypto.createHash("md5").update(buf).digest("base64"); const r = await fetch(blobUrl(s, name), { method: "PUT", headers: { ...HDR, "x-ms-blob-type": "BlockBlob", "Content-Type": type, "Content-MD5": md5, "If-None-Match": "*" }, body: buf }); // "*" = create only: an existing file is NEVER replaced
  if (r.status === 409 || r.status === 412) stop(2, `REFUSED: ${name} already exists in storage and is never overwritten.`);
  if (r.status !== 201) stop(2, `UPLOAD FAILED for ${name}: HTTP ${r.status} ${(await r.text()).replace(/\s+/g, " ").slice(0, 160)}`);
  const got = r.headers.get("content-md5"); if (got) { if (got !== md5) stop(1, `UPLOAD NOT VERIFIED: storage holds different content for ${name} than was sent. Do not rely on this backup.`); } else say(`note: storage did not confirm the checksum of ${name}.`);
}
async function main() {
const s = parseSas();
if (cmd === "check") { say(`SAS ok: container "${s.container}", permissions "${s.sp || "(not stated)"}", expires ${s.exp ? s.exp.toISOString() : "(no expiry stated)"}.`); say(`can store backups: ${/[wc]/.test(s.sp) ? "yes" : "NO (needs Create or Write)"} | can fetch: ${/r/.test(s.sp) && /l/.test(s.sp) ? "yes" : "NO (needs Read and List)"}`); return; }
if (cmd === "backup") {
  if (!/[wc]/.test(s.sp)) stop(2, "REFUSED: the SAS does not allow Create or Write."); if (!/^https?:\/\//.test(APP)) stop(2, "REFUSED: set APP_URL to the app's address (https://...)."); if (!TOKEN) stop(2, "REFUSED: set BACKUP_TOKEN.");
  let res, buf; try { ({ res, buf } = await fetchBody(`${APP}/api/admin/backup/export`, { headers: { "X-Backup-Token": TOKEN } }, TIMEOUT)); } catch (e) { stop(2, `FAILED before anything was stored: the app did not answer (${e.name === "TimeoutError" ? "timed out after " + Math.round(TIMEOUT / 1000) + " s" : e.message}).`); }
  if (res.status === 401 || res.status === 403) stop(2, "REFUSED BY THE APP: the backup token was not accepted."); if (res.status === 429) stop(2, "REFUSED BY THE APP: exports are limited to 2 an hour. Wait and run again."); if (res.status !== 200) stop(2, `FAILED before anything was stored: the app answered HTTP ${res.status}.`);
  if (!/application\/octet-stream/i.test(res.headers.get("content-type") || "")) stop(2, "REFUSED: the app did not return a backup file (wrong content type).");
  if (buf.length < 1024) stop(2, `REFUSED: the file is only ${buf.length} bytes, too small to be a backup.`); if (buf.length > MAX) stop(2, "REFUSED: the file is over 400 MB.");
  const MAGIC = Buffer.from("PRIMUSBK1"); if (!buf.subarray(0, MAGIC.length).equals(MAGIC)) stop(2, "REFUSED: the file does not start with the Primus backup header.");
  const metaLen = buf.readUInt32BE(MAGIC.length); if (metaLen < 10 || metaLen > 2 * 1024 * 1024 || MAGIC.length + 4 + metaLen >= buf.length) stop(2, "REFUSED: the backup header is damaged.");
  let meta; try { meta = JSON.parse(buf.subarray(MAGIC.length + 4, MAGIC.length + 4 + metaLen).toString("utf8")); } catch { stop(2, "REFUSED: the backup header is not readable."); }
  if (meta.alg !== "aes-256-gcm" || !meta.iv || !meta.tag || !meta.sha256) stop(2, "REFUSED: the backup header is missing its encryption details.");
  const tables = Array.isArray(meta.tables) ? meta.tables : []; if (tables.length < MIN_TABLES) stop(2, `REFUSED: the backup lists only ${tables.length} tables (at least ${MIN_TABLES} expected).`);
  const hdrTables = Number(res.headers.get("x-backup-tables")); if (hdrTables && hdrTables !== tables.length) stop(2, "REFUSED: the table count in the response header does not match the file.");
  const made = Date.parse(meta.createdAt); if (!Number.isFinite(made) || Date.now() - made > FRESH_MS || made - Date.now() > 5 * 60 * 1000) stop(2, "REFUSED: the backup is not fresh (its creation time is not within the last 15 minutes).");
  const rows = tables.reduce((a, t) => a + Number(t.rows || 0), 0); const stamp = new Date(made).toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-"); const name = `primus-backup-${stamp}-${crypto.randomBytes(2).toString("hex")}Z.bk`; // a random suffix: two backups in one second never share a name
  await put(s, name, buf); const sha = crypto.createHash("sha256").update(buf).digest("hex");
  await put(s, name.replace(/\.bk$/, ".json"), Buffer.from(JSON.stringify({ file: name, bytes: buf.length, sha256: sha, tables: tables.length, rows, createdAt: meta.createdAt, rowCounts: meta.rowCounts || {} }, null, 1)), "application/json");
  say(`BACKUP STORED AND VERIFIED: ${name}  (${buf.length} bytes, ${tables.length} tables, ${rows} rows)`);
} else if (cmd === "fetch") {
  if (!/r/.test(s.sp)) stop(2, "REFUSED: fetching needs a SAS with Read (and List, to find the latest)."); let name = opt("blob", "latest");
  if (name === "latest") { if (!/l/.test(s.sp)) stop(2, "REFUSED: finding the latest needs List permission."); const r = await fetch(`${s.origin}/${s.container}${s.query}&restype=container&comp=list&prefix=${encodeURIComponent("primus-backup-")}`, { headers: HDR }); if (r.status !== 200) stop(2, `LIST FAILED: HTTP ${r.status}`); const listed = [...(await r.text()).matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]); const bks = listed.filter((n) => /\.bk$/.test(n)).sort(); const complete = bks.filter((n) => listed.includes(n.replace(/\.bk$/, ".json"))); if (!complete.length) stop(2, bks.length ? `REFUSED: found ${bks.length} backup file(s) but none is complete (its .json marker is missing).` : "REFUSED: no backups found in the container."); name = complete[complete.length - 1]; if (complete.length < bks.length) say(`note: ${bks.length - complete.length} unfinished upload(s) were ignored.`); }
  const mr = await fetch(blobUrl(s, name.replace(/\.bk$/, ".json")), { headers: HDR }); if (mr.status !== 200) stop(2, "REFUSED: this backup has no marker file, so it cannot be checked."); const marker = await mr.json();
  const g = await fetch(blobUrl(s, name), { headers: HDR }); if (g.status !== 200) stop(2, `DOWNLOAD FAILED: HTTP ${g.status}`); const buf = Buffer.from(await g.arrayBuffer());
  if (crypto.createHash("sha256").update(buf).digest("hex") !== marker.sha256 || buf.length !== marker.bytes) stop(1, "REFUSED: the downloaded file does not match the checksum recorded when it was stored. Nothing was written.");
  const out = path.resolve(opt("out", name)); fs.writeFileSync(out, buf, { mode: 0o600 }); say(`FETCHED ${name} -> ${out}  (${buf.length} bytes, checksum matches). Restore: node scripts/decryptBackup.mjs "${out}" --out <folder> , then node scripts/importExport.mjs <folder> into an EMPTY database.`);
} else stop(2, "Usage: exportToBlob.mjs check | backup | fetch [--blob <name>|latest] [--out <file>]");
}
main().catch((e) => { if (e instanceof Exit) process.exitCode = e.code; else { console.error(redact(e?.message || e)); process.exitCode = 2; } });

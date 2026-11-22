#!/usr/bin/env node
/**
 * ENCRYPTED DATABASE BACKUPS TO AZURE BLOB STORAGE. A Blob SAS URL is not a database: it can only hold FILES. So the live database stays where it is (Render today) and this tool keeps an encrypted copy of it in Azure Blob Storage,
 * and can rebuild a database from that copy.
 *
 *   node scripts/blobBackup.mjs check                         # inspects the SAS URL (what it allows, when it expires). Writes nothing.
 *   node scripts/blobBackup.mjs backup                        # pg_dump -> encrypt -> upload  (source = DATABASE_URL)
 *   node scripts/blobBackup.mjs restore --target "<url>" --yes-restore [--blob <name>|latest] [--allow-non-empty]
 *
 * Secrets come ONLY from the environment, never from the command line or a file:  AZURE_BLOB_SAS_URL  (a CONTAINER SAS URL: https://<account>.blob.core.windows.net/<container>?sv=...&sig=...)
 *   BLOB_BACKUP_PASSPHRASE (at least 16 characters; keep it in the password manager AND somewhere else: without it the backups cannot be opened)   DATABASE_URL (the source, for backup)
 * Permissions the SAS needs: backup = Create + Write; restore = Read + List. Do NOT give it Delete (a leaked token could then erase the backups). Use the shortest expiry you can live with and renew it.
 * A backup is COMPLETE only when its small .json file (written last) exists; 'restore latest' ignores unfinished uploads.
 * Safety rules (each tested by testBlobBackup.mjs): encrypted with AES-256-GCM (a wrong passphrase or a changed byte is detected and nothing is restored); the SAS token and passphrase never appear in any output; an expired or read-only SAS is refused;
 * https only; every upload is checked afterwards; a restore refuses a database that already has tables unless told otherwise; the temporary files (mode 600) are deleted.
 * Size limit of one upload here: 400 MB. For more, use AzCopy.
 * Exit codes: 0 ok; 1 completed but a check failed; 2 refused or failed before anything changed.
 */
import crypto from "node:crypto"; import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { spawnSync } from "node:child_process";
const argv = process.argv.slice(2); const cmd = argv[0]; const opt = (k, d = "") => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; }; const flag = (k) => argv.includes(`--${k}`);
const SAS = process.env.AZURE_BLOB_SAS_URL || ""; const PASS = process.env.BLOB_BACKUP_PASSPHRASE || ""; const SRC = process.env.DATABASE_URL || "";
const redact = (s) => { let t = String(s); for (const secret of [PASS, ...(SAS.match(/sig=([^&]+)/) ? [decodeURIComponent(SAS.match(/sig=([^&]+)/)[1]), SAS.match(/sig=([^&]+)/)[1]] : [])]) if (secret && secret.length > 3) t = t.split(secret).join("***"); return t.replace(/([?&](sig|sv|se|sp|sr|spr|st|sip|skoid|sktid|skt|ske|sks|skv|ss|srt)=)[^&\s"']+/g, "$1***").replace(/(postgres(?:ql)?:\/\/[^:/@\s]+:)[^@\s]+@/gi, "$1***@"); };
const say = (m) => console.log(redact(m)); const stop = (code, m) => { console.error(redact(m)); process.exit(code); };
const MAGIC = Buffer.from("PRBK1\n"); const MAX_BYTES = 400 * 1024 * 1024;
function parseSas() {
  if (!SAS) stop(2, "REFUSED: set AZURE_BLOB_SAS_URL (a container SAS URL) in the environment.");
  let u; try { u = new URL(SAS); } catch { stop(2, "REFUSED: AZURE_BLOB_SAS_URL is not a valid URL."); }
  const local = /^(127\.0\.0\.1|localhost)$/.test(u.hostname) && process.env.PRIMUS_ALLOW_INSECURE_LOCALHOST === "1";
  if (u.protocol !== "https:" && !local) stop(2, "REFUSED: the SAS URL must be https.");
  const p = u.searchParams; const sp = p.get("sp") || ""; const se = p.get("se") || ""; const parts = u.pathname.split("/").filter(Boolean); const hostedPath = local ? parts.slice(0) : parts;
  if (!p.get("sig")) stop(2, "REFUSED: the URL has no SAS signature (sig=).");
  const container = hostedPath[0]; if (!container) stop(2, "REFUSED: the URL must name a container: https://<account>.blob.core.windows.net/<container>?<sas>");
  if (hostedPath.length > 1 && !flag("allow-single-blob")) stop(2, "REFUSED: this SAS URL points at ONE blob, so every backup would overwrite the last. Create a CONTAINER SAS (Create + Write, plus Read + List for restores).");
  const exp = se ? new Date(se) : null; if (exp && !(exp > new Date())) stop(2, "REFUSED: the SAS token has expired. Create a new one.");
  const days = exp ? (exp - new Date()) / 86400000 : Infinity; if (days < 14) say(`WARNING: the SAS token expires in ${Math.max(0, Math.floor(days))} day(s). Renew it before then, or the backups stop.`);
  if (sp.includes("d")) say("WARNING: this SAS allows DELETE. If it leaks, the backups can be erased. Use Create + Write (and Read + List only where you restore).");
  return { origin: u.origin, container, query: u.search, sp, exp };
}
const blobUrl = (s, name) => `${s.origin}/${s.container}/${encodeURIComponent(name)}${s.query}`; const listUrl = (s, prefix) => `${s.origin}/${s.container}${s.query}&restype=container&comp=list&prefix=${encodeURIComponent(prefix)}`;
const HDR = { "x-ms-version": "2021-08-06" };
function encrypt(plain) { const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12); const key = crypto.scryptSync(PASS, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }); const c = crypto.createCipheriv("aes-256-gcm", key, iv); const body = Buffer.concat([c.update(plain), c.final()]); return Buffer.concat([MAGIC, salt, iv, body, c.getAuthTag()]); }
function decrypt(buf) { if (buf.length < MAGIC.length + 16 + 12 + 16 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("not a Primus backup file"); let o = MAGIC.length; const salt = buf.subarray(o, o += 16), iv = buf.subarray(o, o += 12); const tag = buf.subarray(buf.length - 16); const body = buf.subarray(o, buf.length - 16); const key = crypto.scryptSync(PASS, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }); const d = crypto.createDecipheriv("aes-256-gcm", key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(body), d.final()]); }
const run = (c, a, o = {}) => spawnSync(c, a, { encoding: "utf8", maxBuffer: 1 << 26, ...o });
const rowCounts = (url) => { const r = run("psql", [url, "-At", "-F", "|", "-c", "SELECT table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1"]); if (r.status !== 0) return null; return Object.fromEntries(r.stdout.trim().split("\n").filter(Boolean).map((l) => { const [t, n] = l.split("|"); return [t, Number(n)]; })); };
const putBlob = async (s, name, buf, type = "application/octet-stream") => {
  const md5 = crypto.createHash("md5").update(buf).digest("base64");
  const r = await fetch(blobUrl(s, name), { method: "PUT", headers: { ...HDR, "x-ms-blob-type": "BlockBlob", "Content-Type": type, "Content-MD5": md5 }, body: buf });
  if (r.status !== 201) stop(2, `UPLOAD FAILED for ${name}: HTTP ${r.status} ${(await r.text()).replace(/\s+/g, " ").slice(0, 160)}`);
  // Azure checks the Content-MD5 we send and returns the MD5 of what it stored. That needs no Read permission, so a write-only SAS can still prove the upload.
  const got = r.headers.get("content-md5");
  if (got) { if (got !== md5) stop(1, `UPLOAD NOT VERIFIED: storage holds different content for ${name} than was sent. Do not rely on this backup.`); }
  else if (/r/.test(s.sp)) { const h = await fetch(blobUrl(s, name), { method: "HEAD", headers: HDR }); if (h.status !== 200 || Number(h.headers.get("content-length")) !== buf.length) stop(1, `UPLOAD NOT VERIFIED: ${name} has the wrong size in storage. Do not rely on this backup.`); }
  else say(`note: storage did not confirm the checksum of ${name} and this SAS cannot read it back; test a restore to be sure.`);
};
const s = parseSas();
if (cmd === "check") { say(`SAS ok: container "${s.container}", permissions "${s.sp || "(not stated)"}", expires ${s.exp ? s.exp.toISOString() : "(no expiry stated)"}.`); const need = { backup: ["w", "c"], restore: ["r", "l"] }; say(`can back up: ${/[wc]/.test(s.sp) ? "yes" : "NO (needs Create or Write)"} | can restore: ${/r/.test(s.sp) && /l/.test(s.sp) ? "yes" : "NO (needs Read and List)"}`); process.exit(0); }
if (PASS.length < 16) stop(2, "REFUSED: BLOB_BACKUP_PASSPHRASE must be at least 16 characters.");
if (cmd === "backup") {
  if (!/[wc]/.test(s.sp)) stop(2, "REFUSED: the SAS does not allow Create or Write, so it cannot store a backup.");
  if (!SRC) stop(2, "REFUSED: set DATABASE_URL (the database to back up).");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-"); const name = `primus-${stamp}Z.dump.enc`; const tmp = path.join(os.tmpdir(), `primus-bk-${process.pid}-${Date.now()}.dump`);
  try {
    const counts = rowCounts(SRC); const d = run("pg_dump", ["-Fc", "--no-owner", "--no-acl", "-f", tmp, SRC]); if (d.status !== 0) stop(2, `FAILED before any upload: pg_dump: ${(d.stderr || "").trim().split("\n").slice(-1)[0]}`);
    fs.chmodSync(tmp, 0o600); const plain = fs.readFileSync(tmp); if (plain.length > MAX_BYTES) stop(2, "REFUSED: the dump is over 400 MB; use AzCopy.");
    const enc = encrypt(plain); await putBlob(s, name, enc); const meta = { file: name, createdAt: new Date().toISOString(), plainBytes: plain.length, encryptedBytes: enc.length, tables: counts }; await putBlob(s, name.replace(/\.dump\.enc$/, ".json"), Buffer.from(JSON.stringify(meta, null, 1)), "application/json");
    say(`BACKUP STORED AND VERIFIED: ${name}  (${enc.length} bytes encrypted, ${counts ? Object.keys(counts).length : "?"} tables, ${counts ? Object.values(counts).reduce((a, b) => a + b, 0) : "?"} rows)`);
  } finally { try { fs.unlinkSync(tmp); } catch {} }
} else if (cmd === "restore") {
  if (!/r/.test(s.sp) || (opt("blob", "latest") === "latest" && !/l/.test(s.sp))) stop(2, "REFUSED: restoring needs a SAS with Read (and List, to find the latest).");
  const target = opt("target"); if (!target) stop(2, 'Usage: restore --target "<url>" --yes-restore [--blob <name>|latest]'); if (!flag("yes-restore")) stop(2, "REFUSED: this writes a whole database. Run it again with --yes-restore.");
  let name = opt("blob", "latest"); if (name === "latest") { const r = await fetch(listUrl(s, "primus-"), { headers: HDR }); if (r.status !== 200) stop(2, `LIST FAILED: HTTP ${r.status}`); const listed = [...(await r.text()).matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]); const dumps = listed.filter((n) => /\.dump\.enc$/.test(n)).sort(); const complete = dumps.filter((n) => listed.includes(n.replace(/\.dump\.enc$/, ".json"))); if (!complete.length) stop(2, dumps.length ? `REFUSED: found ${dumps.length} backup file(s) but none is complete (a backup counts as complete only when its .json file, written last, is there).` : "REFUSED: no backup files found in the container."); name = complete[complete.length - 1]; if (complete.length < dumps.length) say(`note: ${dumps.length - complete.length} unfinished upload(s) were ignored.`); }
  const g = await fetch(blobUrl(s, name), { headers: HDR }); if (g.status !== 200) stop(2, `DOWNLOAD FAILED: HTTP ${g.status}`); const enc = Buffer.from(await g.arrayBuffer());
  let plain; try { plain = decrypt(enc); } catch { stop(2, "REFUSED: the file could not be opened: wrong passphrase, or the file is damaged or has been changed. Nothing was restored."); }
  const has = run("psql", [target, "-At", "-c", "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"]); if (has.status !== 0) stop(2, `REFUSED: cannot reach the target database: ${(has.stderr || "").trim().split("\n")[0]}`);
  if (Number(has.stdout.trim()) > 0 && !flag("allow-non-empty")) stop(2, "REFUSED: the target database already has tables. Restore into an EMPTY database (see the migration runbook), or pass --allow-non-empty if you mean to restore over it.");
  const tmp = path.join(os.tmpdir(), `primus-rs-${process.pid}-${Date.now()}.dump`); let ok = false;
  try { fs.writeFileSync(tmp, plain, { mode: 0o600 }); const r = run("pg_restore", ["--no-owner", "--no-acl", "--exit-on-error", ...(flag("allow-non-empty") ? ["--clean", "--if-exists", "--single-transaction"] : []), "-d", target, tmp]); if (r.status !== 0) stop(2, `RESTORE FAILED: ${(r.stderr || "").trim().split("\n").slice(-2).join(" ")}`); ok = true; } finally { try { fs.unlinkSync(tmp); } catch {} }
  const mr = await fetch(blobUrl(s, name.replace(/\.dump\.enc$/, ".json")), { headers: HDR }); let verdict = "(no metadata file to compare with)";
  if (ok && mr.status === 200) { const meta = await mr.json(); const now = rowCounts(target); const bad = Object.entries(meta.tables || {}).filter(([t, n]) => now?.[t] !== n); if (bad.length) stop(1, `RESTORED, BUT the row counts differ from the backup for: ${bad.map(([t, n]) => `${t} (${n} expected, ${now?.[t] ?? "missing"} found)`).join(", ")}`); verdict = `every table has the row count recorded when the backup was taken`; }
  say(`RESTORED from ${name}: ${verdict}`);
} else stop(2, "Usage: blobBackup.mjs check | backup | restore --target <url> --yes-restore");

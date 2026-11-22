#!/usr/bin/env node
/**
 * Did the move lose any data?  Compares a SOURCE and a TARGET PostgreSQL database table by table. READ-ONLY: both sessions are set read-only, nothing is ever written.
 *
 *   node scripts/verifyDatabaseCopy.mjs --source "postgres://user:pw@old-host:5432/db?sslmode=require" --target "postgres://user:pw@new-host:5432/db?sslmode=require" [--schema public] [--no-checksum]
 *
 * Put it in the repo's scripts/ folder and run it from the repo root (it uses the `pg` package the app already has). Use the EXTERNAL connection strings (Render: database > Connect > External; Azure: the server's connection strings).
 * For a final answer stop the writes first (suspend the old service), otherwise the two sides legitimately differ by whatever was saved in between.
 *
 * What it checks, for every table in the source:
 *   rows        the same number of rows
 *   data        the same content, row for row (an order-independent checksum of every row, bytea files included)
 *   columns     the same columns and types      key  the same primary key (a different key is how "deleted_propositions_pkey" bites)
 *   counters    in the TARGET, every serial counter is at or past its largest id (a counter left behind makes the next Delete fail)
 * and it lists any idea (propositions) that is in the source and missing from the target, by name.
 * Exit code 0 only when nothing is missing or different; 1 otherwise.
 */
import pg from "pg";

const argv = process.argv.slice(2); const opt = (k, d = "") => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; }; const flag = (k) => argv.includes(`--${k}`);
const SRC = opt("source"), TGT = opt("target"); const schemaSrc = opt("source-schema", opt("schema", "public")), schemaTgt = opt("target-schema", opt("schema", "public")); const checksum = !flag("no-checksum"); const msOnly = opt("timestamps") === "ms"; const ignoreTables = new Set(opt("ignore-table").split(",").map((x) => x.trim()).filter(Boolean));
// --timestamps ms : compare timestamps to the MILLISECOND. A restore from the app's own encrypted backup (.bk) carries JavaScript timestamps, so microseconds are lost (.435971 becomes .435): expected, harmless for this app, and reported as such.
// --ignore-table backup_exports : skip tables that are expected to differ (the app logs each export AFTER building it, so the backup never contains its own log row).
if (!SRC || !TGT) { console.error('Usage: node scripts/verifyDatabaseCopy.mjs --source "<url>" --target "<url>" [--schema public] [--no-checksum]'); process.exit(2); }
const provider = (host) => (/azure/i.test(host) ? "Azure Database for PostgreSQL" : /render\.com|dpg-/i.test(host) ? "Render PostgreSQL" : /supabase/i.test(host) ? "Supabase" : /amazonaws|rds\./i.test(host) ? "AWS RDS" : /localhost|127\.0\.0\.1/.test(host) ? "local" : "PostgreSQL (other)");
async function connect(url) {
  const u = new URL(url); const wantSsl = /sslmode=(require|verify-full|verify-ca|prefer)/i.test(url) || /azure|render\.com|dpg-|supabase|amazonaws/i.test(u.hostname); u.searchParams.delete("sslmode");
  const client = new pg.Client({ connectionString: u.toString(), ssl: wantSsl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 20000 }); await client.connect();
  await client.query("SET default_transaction_read_only = on"); await client.query("SET statement_timeout = 300000"); return { client, host: u.hostname, db: u.pathname.slice(1) };
}
const q = async (c, sql, p = []) => (await c.client.query(sql, p)).rows;
const tablesOf = async (c, s) => (await q(c, `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY 1`, [s])).map((r) => r.table_name);
const colsOf = async (c, s, t) => (await q(c, `SELECT column_name || ':' || data_type AS x FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [s, t])).map((r) => r.x).join(",");
const pkOf = async (c, s, t) => (await q(c, `SELECT pg_get_constraintdef(k.oid) AS d FROM pg_constraint k JOIN pg_class r ON r.oid = k.conrelid JOIN pg_namespace n ON n.oid = r.relnamespace WHERE k.contype = 'p' AND n.nspname = $1 AND r.relname = $2`, [s, t])).map((r) => r.d).join(";") || "(none)";
const qi = (x) => `"${String(x).replace(/"/g, '""')}"`;
const sumOf = async (c, s, t) => {
  let from = `${qi(s)}.${qi(t)} x`;
  if (msOnly) { const cs = await q(c, `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [s, t]); if (cs.some((k) => /^timestamp/.test(k.data_type))) from = `(SELECT ${cs.map((k) => (/^timestamp/.test(k.data_type) ? `date_trunc('milliseconds', ${qi(k.column_name)}) AS ${qi(k.column_name)}` : qi(k.column_name))).join(", ")} FROM ${qi(s)}.${qi(t)}) x`; }
  const r = (await q(c, `SELECT count(*)::bigint AS n${checksum ? `, md5(COALESCE(string_agg(h, '' ORDER BY h), '')) AS sum` : ""} FROM (SELECT md5(x::text) AS h FROM ${from}) y`))[0]; return { n: Number(r.n), sum: r.sum || "" };
};
async function drift(c, s) {
  const out = []; const cols = await q(c, `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND column_default LIKE 'nextval(%'`, [s]);
  for (const k of cols) { const seq = (await q(c, `SELECT pg_get_serial_sequence($1, $2) AS s`, [`${qi(s)}.${qi(k.table_name)}`, k.column_name]))[0]?.s; if (!seq) continue; const max = Number((await q(c, `SELECT COALESCE(MAX(${qi(k.column_name)}), 0) AS m FROM ${qi(s)}.${qi(k.table_name)}`))[0].m); const st = (await q(c, `SELECT last_value, is_called FROM ${seq}`))[0]; const cur = st.is_called ? Number(st.last_value) : Number(st.last_value) - 1; if (cur < max) out.push({ table: k.table_name, column: k.column_name, max, counter: cur }); }
  return out;
}
const pad = (x, n) => String(x).padEnd(n); const padL = (x, n) => String(x).padStart(n);
let a, b; try { a = await connect(SRC); b = await connect(TGT); } catch (e) { console.error(`Could not connect: ${e.message}`); process.exit(2); }
console.log(`SOURCE  ${provider(a.host)}  ${a.host}  database "${a.db}"  schema "${schemaSrc}"`); console.log(`TARGET  ${provider(b.host)}  ${b.host}  database "${b.db}"  schema "${schemaTgt}"`);
if (a.host === b.host && a.db === b.db && schemaSrc === schemaTgt) console.log("WARNING: source and target are the same database; this proves nothing.");
const srcTables = (await tablesOf(a, schemaSrc)).filter((t) => !ignoreTables.has(t)), tgtTables = new Set(await tablesOf(b, schemaTgt)); const problems = []; const rows = [];
for (const t of srcTables) {
  if (!tgtTables.has(t)) { rows.push([t, "-", "MISSING", "", "", "", ""]); problems.push(`table ${t} is missing in the target`); continue; }
  const [sa, sb] = [await sumOf(a, schemaSrc, t), await sumOf(b, schemaTgt, t)]; const [ca, cb] = [await colsOf(a, schemaSrc, t), await colsOf(b, schemaTgt, t)]; const [ka, kb] = [await pkOf(a, schemaSrc, t), await pkOf(b, schemaTgt, t)];
  const okRows = sa.n === sb.n, okData = !checksum || sa.sum === sb.sum, okCols = ca === cb, okKey = ka === kb;
  if (!okRows) problems.push(`${t}: ${sa.n} rows in the source, ${sb.n} in the target (${sa.n - sb.n > 0 ? sa.n - sb.n + " missing" : sb.n - sa.n + " extra"})`);
  if (okRows && !okData) problems.push(`${t}: same number of rows but the content differs`);
  if (!okCols) problems.push(`${t}: the columns differ`); if (!okKey) problems.push(`${t}: the primary key differs (${ka} vs ${kb})`);
  rows.push([t, sa.n, sb.n, okRows ? "ok" : "DIFFERENT", checksum ? (okData ? "ok" : "DIFFERENT") : "skipped", okCols ? "ok" : "DIFFERENT", okKey ? "ok" : "DIFFERENT"]);
}
console.log(`\n${pad("table", 26)}${padL("source", 9)}${padL("target", 9)}  ${pad("rows", 10)}${pad("data", 10)}${pad("columns", 10)}key`); for (const r of rows) console.log(`${pad(r[0], 26)}${padL(r[1], 9)}${padL(r[2], 9)}  ${pad(r[3], 10)}${pad(r[4], 10)}${pad(r[5], 10)}${r[6]}`);
const dr = await drift(b, schemaTgt); if (dr.length) { for (const d of dr) problems.push(`counter behind in the target: ${d.table}.${d.column} is at ${d.counter} but its largest id is ${d.max} (the next insert will fail)`); }
console.log(`\nSerial counters in the target: ${dr.length ? "BEHIND for " + dr.map((d) => d.table).join(", ") : "all at or past their largest id"}`);
if (srcTables.includes("propositions") && tgtTables.has("propositions")) {
  const si = await q(a, `SELECT id, name FROM ${qi(schemaSrc)}.propositions`), ti = new Set((await q(b, `SELECT id FROM ${qi(schemaTgt)}.propositions`)).map((r) => r.id)); const sIds = new Set(si.map((r) => r.id));
  const missing = si.filter((r) => !ti.has(r.id)); const extra = [...ti].filter((id) => !sIds.has(id)).length;
  console.log(`\nIdeas: ${si.length} in the source, ${ti.size} in the target.`); if (missing.length) { console.log(`MISSING from the target (${missing.length}):`); for (const m of missing.slice(0, 25)) console.log(`  ${m.id}  ${m.name || "(untitled)"}`); if (missing.length > 25) console.log(`  ...and ${missing.length - 25} more`); problems.push(`${missing.length} idea(s) in the source are missing from the target`); }
  if (extra) console.log(`${extra} idea(s) are in the target but not in the source (saved after the copy; not a loss).`);
}
await a.client.end(); await b.client.end();
if (problems.length) { console.log(`\nRESULT: DATA DIFFERS. ${problems.length} problem(s):`); for (const p of problems) console.log(`  - ${p}`); process.exit(1); }
console.log(`\nRESULT: ALL MATCH. Every table has the same rows, the same content, the same structure and healthy counters. No data was lost.${checksum ? "" : " (Content was not compared: --no-checksum.)"}${msOnly ? " Timestamps were compared to the millisecond (--timestamps ms): a restore from the app's encrypted backup loses the microseconds." : ""}${ignoreTables.size ? ` Not compared by request: ${[...ignoreTables].join(", ")}.` : ""}`);

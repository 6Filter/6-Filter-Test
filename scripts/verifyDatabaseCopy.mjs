/**
 * Verify that a restored PostgreSQL database is a complete copy of the source.
 *
 *   node scripts/verifyDatabaseCopy.mjs --source "$SRC" --target "$TGT" --schema public
 *
 * Read-only on both sides. Never prints a connection string or a password.
 * Checks, per base table in the schema:
 *   1. the table exists on both sides (and no table exists only on one side);
 *   2. the row counts are equal;
 *   3. an order-independent content checksum is equal (md5 over every row's text form);
 *   4. for propositions and ideas, ids present in the source but missing in the target are named;
 * then, on the target:
 *   5. every serial/identity counter is at or ahead of MAX(column) (a counter left behind makes the
 *      next insert or delete fail with a duplicate key such as deleted_propositions_pkey).
 *
 * Exit 0 and "RESULT: ALL MATCH" only when every check passes; otherwise exit 1 and a problem list.
 * Ideas saved on the source while the dump ran will show as differences in a dry run; that is expected.
 *
 * Options: --source URL  --target URL  --schema NAME (default public)  --no-checksum  (counts + counters only)
 */
import pg from "pg";

function parseArgs(argv) {
  const out = { schema: "public", checksum: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--source") out.source = argv[++i];
    else if (a === "--target") out.target = argv[++i];
    else if (a === "--schema") out.schema = argv[++i];
    else if (a === "--no-checksum") out.checksum = false;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`Unknown option ${a}`);
  }
  return out;
}

function ident(name) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(String(name || ""))) throw new Error("Refusing an unexpected identifier.");
  return `"${name}"`;
}

function sslFor(url) {
  let mode = "";
  let host = "";
  try {
    const u = new URL(url);
    mode = (u.searchParams.get("sslmode") || "").toLowerCase();
    host = u.hostname;
  } catch {
    /* handled by pg */
  }
  const on = mode !== "disable" && (["require", "verify-ca", "verify-full"].includes(mode) || /render\.com$|azure\.com$|neon\.tech$/.test(host));
  return on ? { rejectUnauthorized: false } : false;
}

function stripSslMode(url) {
  // pg would otherwise apply its own (stricter) reading of sslmode; we pass ssl explicitly.
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url;
  }
}

async function connect(url, label) {
  const client = new pg.Client({ connectionString: stripSslMode(url), ssl: sslFor(url), connectionTimeoutMillis: 20000 });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(`Cannot connect to the ${label} database: ${String(e.message || e).replace(/postgres(ql)?:\/\/\S+/gi, "[url hidden]")}`);
  }
  await client.query("SET default_transaction_read_only = on");
  return client;
}

async function listTables(client, schema) {
  const r = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' ORDER BY table_name`,
    [schema]
  );
  return r.rows.map((x) => x.table_name);
}

async function tableStats(client, schema, table, withChecksum) {
  const t = `${ident(schema)}.${ident(table)}`;
  if (!withChecksum) {
    const r = await client.query(`SELECT count(*)::bigint AS n FROM ${t}`);
    return { n: Number(r.rows[0].n), sum: null };
  }
  const r = await client.query(
    `SELECT count(*)::bigint AS n,
            COALESCE(md5(string_agg(h, '' ORDER BY h)), '') AS sum
       FROM (SELECT md5(x::text) AS h FROM ${t} x) s`
  );
  return { n: Number(r.rows[0].n), sum: r.rows[0].sum };
}

async function idsOf(client, schema, table) {
  const r = await client.query(`SELECT id::text AS id FROM ${ident(schema)}.${ident(table)}`);
  return new Set(r.rows.map((x) => x.id));
}

async function counters(client, schema) {
  const cols = await client.query(
    `SELECT c.relname AS table_name, a.attname AS column_name,
            pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS seq_name
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
       LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
      WHERE n.nspname = $1 AND c.relkind = 'r'
        AND (pg_get_expr(ad.adbin, ad.adrelid) LIKE 'nextval(%' OR a.attidentity <> '')
      ORDER BY c.relname, a.attname`,
    [schema]
  );
  const behind = [];
  let checked = 0;
  for (const row of cols.rows) {
    if (!row.seq_name) continue;
    const max = await client.query(
      `SELECT COALESCE(MAX(${ident(row.column_name)}), 0)::bigint AS max FROM ${ident(schema)}.${ident(row.table_name)}`
    );
    const m = Number(max.rows[0].max);
    checked += 1;
    if (m <= 0) continue;
    const seq = await client.query(`SELECT last_value::bigint AS last_value FROM ${row.seq_name}`);
    const cur = Number(seq.rows[0].last_value);
    if (cur < m) behind.push({ table: row.table_name, column: row.column_name, max: m, counter: cur });
  }
  return { checked, behind };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.source || !args.target) {
    console.log('Usage: node scripts/verifyDatabaseCopy.mjs --source "$SRC" --target "$TGT" [--schema public] [--no-checksum]');
    process.exit(args.help ? 0 : 2);
  }
  const problems = [];
  const src = await connect(args.source, "source");
  const tgt = await connect(args.target, "target");
  try {
    const [srcTables, tgtTables] = await Promise.all([listTables(src, args.schema), listTables(tgt, args.schema)]);
    for (const t of srcTables) if (!tgtTables.includes(t)) problems.push(`table ${t}: missing on the target`);
    for (const t of tgtTables) if (!srcTables.includes(t)) problems.push(`table ${t}: exists only on the target (restore into an EMPTY database)`);

    console.log(`schema ${args.schema}: ${srcTables.length} tables on the source, ${tgtTables.length} on the target`);
    for (const table of srcTables.filter((t) => tgtTables.includes(t))) {
      const [a, b] = await Promise.all([
        tableStats(src, args.schema, table, args.checksum),
        tableStats(tgt, args.schema, table, args.checksum),
      ]);
      const countOk = a.n === b.n;
      const sumOk = !args.checksum || a.sum === b.sum;
      console.log(`  ${countOk && sumOk ? "ok  " : "DIFF"} ${table.padEnd(28)} source ${String(a.n).padStart(7)}  target ${String(b.n).padStart(7)}${args.checksum ? (sumOk ? "  content equal" : "  CONTENT DIFFERS") : ""}`);
      if (!countOk) problems.push(`table ${table}: ${a.n} rows on the source, ${b.n} on the target`);
      else if (!sumOk) problems.push(`table ${table}: same row count but the content differs`);
      if (!countOk && ["propositions", "ideas"].includes(table)) {
        const [sa, sb] = await Promise.all([idsOf(src, args.schema, table), idsOf(tgt, args.schema, table)]);
        const missing = [...sa].filter((id) => !sb.has(id));
        if (missing.length) problems.push(`table ${table}: ${missing.length} id(s) missing on the target, e.g. ${missing.slice(0, 5).join(", ")}`);
      }
    }

    const c = await counters(tgt, args.schema);
    console.log(`counters: ${c.checked} serial/identity counter(s) checked on the target`);
    for (const x of c.behind) {
      problems.push(`counter ${x.table}.${x.column}: at ${x.counter}, behind MAX ${x.max} (run the sequence repair)`);
    }
  } finally {
    await src.end().catch(() => {});
    await tgt.end().catch(() => {});
  }

  if (problems.length) {
    console.log("\nPROBLEMS:");
    for (const p of problems) console.log(`  - ${p}`);
    console.log("\nRESULT: DIFFERENCES FOUND");
    process.exit(1);
  }
  console.log("\nRESULT: ALL MATCH");
  process.exit(0);
}

main().catch((e) => {
  console.error(String(e?.message || e).replace(/postgres(ql)?:\/\/\S+/gi, "[url hidden]"));
  process.exit(2);
});

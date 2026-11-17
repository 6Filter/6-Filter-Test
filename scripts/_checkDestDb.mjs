import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { rewriteRenderDatabaseUrl } from "../lib/db.js";

const url = fs
  .readFileSync(path.join(process.env.USERPROFILE, "AppData/Local/Temp/primus-render-migrate/dest-database-url.txt"), "utf8")
  .trim();
const c = new pg.Client({
  connectionString: rewriteRenderDatabaseUrl(url),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await c.connect();
const tables = await c.query(
  "select count(*)::int as n from information_schema.tables where table_schema='public'",
);
let propositions = null;
try {
  const p = await c.query("select count(*)::int as n from propositions");
  propositions = p.rows[0].n;
} catch (e) {
  propositions = String(e.message).split("\n")[0];
}
const locks = await c.query(
  `select pid, state, wait_event_type, left(query,80) as q
   from pg_stat_activity
   where datname = current_database() and pid <> pg_backend_pid()`,
);
console.log(JSON.stringify({ tables: tables.rows[0].n, propositions, activity: locks.rows }, null, 2));
await c.end();

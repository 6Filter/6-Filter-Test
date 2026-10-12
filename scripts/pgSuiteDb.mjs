/**
 * Each Postgres test run gets its own schema, then drops it.
 * The scratch server accepts CREATE DATABASE but keeps every connection on one
 * database, so a schema is the isolation that actually holds.
 * A run refuses when the URL names primus_restored or when public.propositions
 * already holds the restored ids.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { RESTORED_DATABASE, restoredIdsFromBackup } from "./restoredCopy.mjs";

function hostAllowed(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(hostname)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)) return true;
  return false;
}

function quoteIdent(name) {
  if (!/^primus_suite_[a-f0-9]{12}$/.test(name)) throw new Error("Refusing an unexpected test schema name.");
  return name;
}

export function suiteAdminUrl(raw) {
  const text = String(raw || "").trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error("TEST_DATABASE_URL is not valid.");
  }
  if (!hostAllowed(url.hostname) || /render\.com|neon\.tech|supabase\.co/i.test(text)) {
    throw new Error("Refusing TEST_DATABASE_URL: host is not a private scratch database.");
  }
  return url;
}

export async function openSuiteDatabase(raw) {
  const adminUrl = suiteAdminUrl(raw);
  const database = decodeURIComponent(adminUrl.pathname.replace(/^\//, "") || "postgres");
  if (database === RESTORED_DATABASE) {
    throw new Error("Refusing to run tests against the restored database.");
  }
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query("SET default_transaction_read_only = off");
    const here = await admin.query(`SELECT current_database() AS name`);
    if (here.rows[0]?.name === RESTORED_DATABASE) {
      throw new Error("Refusing to run tests against the restored database.");
    }
    const present = await admin.query(`SELECT to_regclass('public.propositions') AS name`);
    if (present.rows[0]?.name) {
      const ids = restoredIdsFromBackup();
      const hit = await admin.query(
        `SELECT COUNT(*)::int AS n FROM public.propositions WHERE id = ANY($1::text[])`,
        [ids]
      );
      const found = Number(hit.rows[0]?.n || 0);
      if (found > 0) {
        throw new Error(`Refusing to run: this database already contains ${found} restored propositions.`);
      }
    }
    const name = quoteIdent(`primus_suite_${randomBytes(6).toString("hex")}`);
    await admin.query(`CREATE SCHEMA ${name}`);
    return {
      name,
      url: adminUrl.toString(),
      async drop() {
        const closer = new pg.Client({ connectionString: adminUrl.toString() });
        await closer.connect();
        try {
          await closer.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);
        } finally {
          await closer.end();
        }
      },
    };
  } finally {
    await admin.end();
  }
}

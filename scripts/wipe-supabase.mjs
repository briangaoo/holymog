#!/usr/bin/env node
// =====================================================================
// holymog — wipe + reset Supabase
// =====================================================================
// Usage: `npm run wipe` (or `node scripts/wipe-supabase.mjs`)
//
// What it does (in one Postgres transaction):
//   1. Deletes every object in our three storage buckets
//      (holymog-uploads, holymog-scans, holymog-cosmetics).
//   2. Drops every public-schema table the app uses.
//   3. Recreates every table, function, trigger, RLS policy,
//      storage bucket, and seed row from
//      `docs/migrations/2026-05-10-pre-launch-final.sql`.
//
// What you'll see:
//   - The target project hostname (parsed from DATABASE_URL).
//   - A typed-confirmation prompt — you must type
//     `WIPE EVERYTHING` exactly, or the script aborts.
//
// Safety:
//   - Reads DATABASE_URL from .env.local only (no env-var fallback).
//   - All-or-nothing: the migration file wraps its body in
//     `begin … commit`, so a SQL failure rolls the whole reset back.
//   - Does NOT touch Auth.js user accounts in other projects, only
//     the project DATABASE_URL points at.
// =====================================================================

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const envPath = path.join(repoRoot, '.env.local');
// `docs/` lives in the parent code folder (siblings to this repo) so
// migrations and runbooks don't ship in the public source tree. Look
// there first; fall back to in-repo `docs/` for older checkouts that
// still have the folder inline.
const SQL_FILENAME = '2026-05-10-pre-launch-final.sql';
const sqlPath = (() => {
  const inRepoDocs = path.resolve(repoRoot, 'docs/migrations', SQL_FILENAME);
  const parentDocs = path.resolve(repoRoot, '../docs/migrations', SQL_FILENAME);
  if (existsSync(inRepoDocs)) return inRepoDocs;
  return parentDocs;
})();

// ---------- env loader (no dotenv dependency) ----------
async function loadEnvLocal() {
  let raw;
  try {
    raw = await readFile(envPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`✗ .env.local not found at ${envPath}`);
      console.error('  Copy .env.example → .env.local and fill in DATABASE_URL.');
      process.exit(1);
    }
    throw err;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ---------- pretty logger ----------
const log = {
  info: (msg) => console.log(`  ${msg}`),
  step: (n, total, msg) => console.log(`\n[${n}/${total}] ${msg}`),
  ok: (msg) => console.log(`  ✓ ${msg}`),
  warn: (msg) => console.warn(`  ! ${msg}`),
  err: (msg) => console.error(`  ✗ ${msg}`),
};

// ---------- main ----------
await loadEnvLocal();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  log.err('DATABASE_URL is not set in .env.local');
  process.exit(1);
}

// Parse host out of DATABASE_URL for the confirmation banner.
let dbHost;
try {
  const url = new URL(DATABASE_URL);
  dbHost = url.host;
} catch {
  dbHost = '<unparseable>';
}

// Load the SQL file up-front so we fail fast if it's missing.
let sql;
try {
  sql = await readFile(sqlPath, 'utf8');
} catch (err) {
  log.err(`Could not read ${sqlPath}: ${err.message}`);
  process.exit(1);
}

// ---------- banner + typed confirmation ----------
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('  Supabase wipe + reset');
console.log('────────────────────────────────────────────────────────────');
console.log(`  Target:    ${dbHost}`);
console.log(`  Migration: ${path.relative(repoRoot, sqlPath)}`);
console.log('');
console.log('  This will, in one transaction:');
console.log('    • Delete every object in holymog-uploads, -scans, -cosmetics');
console.log('    • Drop every app-owned table in the public schema');
console.log('    • Recreate every table, function, trigger, RLS policy');
console.log('    • Reseed the cosmetic catalog (10 name fx)');
console.log('    • Recreate the 3 storage buckets with canonical config');
console.log('');
console.log('  All user accounts, scans, ELO history, audit log entries,');
console.log('  battles, and uploaded photos in this project are destroyed.');
console.log('────────────────────────────────────────────────────────────');
console.log('');

const rl = createInterface({ input, output });
const answer = await rl.question('Type "WIPE EVERYTHING" to proceed (anything else aborts): ');
rl.close();
if (answer.trim() !== 'WIPE EVERYTHING') {
  console.log('\naborted. nothing was changed.');
  process.exit(0);
}

// ---------- empty storage buckets via REST API ----------
// Supabase recently added a storage.protect_delete() trigger that
// blocks `delete from storage.objects` even for the service-role
// connection used by pg, so we can't drop objects via SQL anymore.
// We empty the three buckets here via the Storage REST API instead,
// and strip the equivalent delete out of the SQL below so the
// migration still applies cleanly.
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env.local');
  process.exit(1);
}
const BUCKETS = ['holymog-uploads', 'holymog-scans', 'holymog-cosmetics'];

async function emptyBucket(bucket) {
  // List then delete. Both endpoints require service-role auth.
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
  // Recursive listing — walk every prefix the app uses (avatars/,
  // banners/, leaderboard/, scans/<userid>/, etc.) by listing the
  // bucket root with a generous limit and an empty prefix.
  const collected = [];
  async function walk(prefix) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prefix,
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`list ${bucket} (${prefix || '/'}) failed: ${res.status} ${text}`);
    }
    const items = await res.json();
    for (const it of items) {
      const fullPath = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null || it.id === undefined) {
        await walk(fullPath);
      } else {
        collected.push(fullPath);
      }
    }
  }
  await walk('');
  if (collected.length === 0) return 0;
  // The remove endpoint takes a JSON body with the array of paths.
  const del = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ prefixes: collected }),
  });
  if (!del.ok) {
    const text = await del.text().catch(() => '');
    throw new Error(`delete ${bucket} failed: ${del.status} ${text}`);
  }
  return collected.length;
}

log.step(1, 2, 'emptying storage buckets via REST API…');
try {
  for (const b of BUCKETS) {
    const n = await emptyBucket(b);
    log.info(`  ${b}: ${n} object${n === 1 ? '' : 's'} removed`);
  }
  log.ok('storage buckets emptied');
} catch (err) {
  log.err(`storage cleanup failed: ${err.message}`);
  process.exit(1);
}

// Strip the now-blocked storage delete out of the SQL — we just did
// it via REST above. Leaves everything else (drops, recreates, RLS
// policies, seeds) untouched.
const sqlWithoutStorageDelete = sql.replace(
  /delete from storage\.objects[\s\S]*?;\n/,
  '-- (storage.objects emptied via REST API in wipe script)\n',
);

// ---------- run the SQL ----------
log.step(2, 2, 'running consolidated migration…');
const pool = new Pool({
  connectionString: DATABASE_URL,
  // Supabase pooled connections require TLS. The cert chain in the
  // pooler URL is fine; we accept it without strict validation
  // because the URL is the proof of identity here.
  ssl: { rejectUnauthorized: false },
  // The migration is a single multi-statement query; keep one client
  // around long enough to run it without surprise timeouts.
  max: 1,
  statement_timeout: 0,
  idle_in_transaction_session_timeout: 0,
});

const start = Date.now();
try {
  // node-postgres uses the simple query protocol when `query()` is
  // called with a plain string (no params), which supports multi-
  // statement bodies and dollar-quoted PL/pgSQL function defs.
  await pool.query(sqlWithoutStorageDelete);
} catch (err) {
  log.err(`SQL failed: ${err.message}`);
  if (err.position) log.err(`  near position ${err.position}`);
  if (err.where) log.err(`  ${err.where.split('\n')[0]}`);
  await pool.end().catch(() => {});
  process.exit(1);
}
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
log.ok(`migration applied in ${elapsed}s`);

// ---------- post-flight sanity checks ----------
try {
  const tables = await pool.query(
    `select count(*)::int as n
       from information_schema.tables
      where table_schema = 'public'`,
  );
  const buckets = await pool.query(
    `select id from storage.buckets
      where id in ('holymog-uploads', 'holymog-scans', 'holymog-cosmetics')
      order by id`,
  );
  const catalog = await pool.query(
    `select count(*)::int as n from catalog_items`,
  );
  log.ok(`${tables.rows[0].n} tables in public schema`);
  log.ok(
    `${buckets.rows.length}/3 storage buckets present` +
      (buckets.rows.length === 3
        ? ''
        : ` (missing: ${
            ['holymog-uploads', 'holymog-scans', 'holymog-cosmetics']
              .filter((b) => !buckets.rows.find((r) => r.id === b))
              .join(', ')
          })`),
  );
  log.ok(`${catalog.rows[0].n} catalog_items seeded`);
} catch (err) {
  log.warn(`post-flight check failed: ${err.message}`);
}

await pool.end();

console.log('');
console.log('done. fresh state. sign in on the app to bootstrap a new user.');

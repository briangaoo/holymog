import { Pool } from 'pg';

let cached: Pool | null = null;

/**
 * Postgres connection pool. Backed by Supabase managed Postgres for now,
 * but uses the standard `pg` driver so the database is portable to any
 * Postgres-compatible host (Neon, RDS, self-hosted) by changing only the
 * DATABASE_URL.
 *
 * For Vercel serverless we use the connection-pooler URL (PgBouncer at
 * port 6543) — pasting the "Connection Pooling" value from Supabase
 * dashboard → Project Settings → Database. Direct connections at port
 * 5432 will exhaust quickly under serverless cold-start traffic.
 */
export function getPool(): Pool {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  cached = new Pool({
    connectionString: url,
    // Reasonable defaults for serverless: keep the pool small, idle
    // connections close quickly so we don't tie up the pooler.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  return cached;
}

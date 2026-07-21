// Database access.
//
// Production (Vercel): set DATABASE_URL (or POSTGRES_URL) to a Postgres/Neon
// connection string and this uses the `pg` driver.
// Local dev (no DATABASE_URL): falls back to PGlite, an embedded Postgres that
// persists to app/.data/pg, so accounts, credits and orders survive restarts
// with zero setup.
//
// Both backends expose the same async `query(text, params) -> { rows }`.

const path = require('path');

let _dbPromise = null;

function needsSsl(url) {
  return !/localhost|127\.0\.0\.1/.test(url);
}

// Find the Postgres connection string. Handles plain DATABASE_URL / POSTGRES_URL
// and the prefixed names that Vercel's Neon/Postgres integration injects
// (e.g. STORAGE_POSTGRES_URL, MYDB_DATABASE_URL). Prefers a pooled URL.
function resolveConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;

  const looksPooled = (k) => !/UNPOOLED|NON_?POOL|PRISMA/i.test(k);
  const keys = Object.keys(process.env);

  // Prefer *_POSTGRES_URL, then *_DATABASE_URL, pooled variants first.
  const named = keys
    .filter((k) => /(^|_)(POSTGRES|DATABASE)_URL$/.test(k))
    .sort((a, b) => {
      const rank = (k) => (looksPooled(k) ? 0 : 10) + (/POSTGRES_URL$/.test(k) ? 0 : 1);
      return rank(a) - rank(b);
    });
  for (const k of named) {
    const v = process.env[k];
    if (v && /^postgres(ql)?:\/\//i.test(v)) return v;
  }

  // Last resort: any env value that is a postgres connection string.
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === 'string' && /^postgres(ql)?:\/\//i.test(v) && looksPooled(k)) return v;
  }
  return null;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL DEFAULT 'User',
    email TEXT UNIQUE NOT NULL,
    pass TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 500,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS designs (
    id TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    device_name TEXT,
    prompt TEXT,
    files JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    reference TEXT PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    credited BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    device_name TEXT,
    prompt TEXT,
    quantity INTEGER,
    from_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    customer_location TEXT,
    preferred_contact TEXT,
    special_requests TEXT,
    files JSONB,
    emailed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

async function migrate(db) {
  for (const stmt of SCHEMA) await db.query(stmt);
}

async function build() {
  const url = resolveConnectionString();
  let db;
  if (url) {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: url,
      ssl: needsSsl(url) ? { rejectUnauthorized: false } : false,
      max: 3,
    });
    db = { kind: 'pg', query: (text, params) => pool.query(text, params) };
  } else {
    const { PGlite } = require('@electric-sql/pglite');
    const fs = require('fs');
    const dir = path.join(__dirname, '..', '.data', 'pg');
    fs.mkdirSync(dir, { recursive: true }); // PGlite won't create parent dirs
    const pg = new PGlite(dir);
    await pg.waitReady;
    db = { kind: 'pglite', query: (text, params) => pg.query(text, params) };
  }
  await migrate(db);
  return db;
}

function getDb() {
  if (!_dbPromise) _dbPromise = build();
  return _dbPromise;
}

module.exports = { getDb };

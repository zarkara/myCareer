-- One D1 database. Apply with:
--   wrangler d1 execute mycareer --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,          -- pbkdf2$iterations$salt$hash, all base64url
  credits       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

-- Session tokens are stored hashed. A database dump must not hand out live sessions.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- One interrogation. Credits are held at creation and settled from measured usage.
CREATE TABLE IF NOT EXISTS interviews (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  state         TEXT NOT NULL DEFAULT 'open',   -- open | closed | aborted
  turns         INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write   INTEGER NOT NULL DEFAULT 0,
  cache_read    INTEGER NOT NULL DEFAULT 0,
  cost_micros   INTEGER NOT NULL DEFAULT 0,     -- millionths of a dollar
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS interviews_user ON interviews(user_id, created_at);

-- Every credit movement, so a balance can always be explained.
CREATE TABLE IF NOT EXISTS ledger (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  ref        TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, created_at);

-- Stripe redelivers webhooks. Recording the event id makes granting idempotent.
CREATE TABLE IF NOT EXISTS stripe_events (
  id         TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Login and signup throttling. One row per IP per minute per bucket; swept opportunistically.
CREATE TABLE IF NOT EXISTS rate_limits (
  key        TEXT PRIMARY KEY,
  hits       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_age ON rate_limits(created_at);

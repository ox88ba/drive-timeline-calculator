CREATE TABLE IF NOT EXISTS trip_shares (
  code TEXT PRIMARY KEY,
  trip TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS trip_shares_expiry ON trip_shares(expires_at);

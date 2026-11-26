CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  blob TEXT NOT NULL,        -- AES-256-GCM encrypted JSON of the user record
  updated_at TEXT NOT NULL
);

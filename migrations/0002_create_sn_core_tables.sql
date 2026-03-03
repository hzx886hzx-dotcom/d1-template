-- Migration number: 0002   2026-03-03T00:00:00Z
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activation_codes (
  code TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  max_uses INTEGER NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  issued_to TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  device_limit INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS activation_code_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '',
  client_ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (code) REFERENCES activation_codes(code) ON DELETE CASCADE,
  UNIQUE (code, device_id)
);

CREATE TABLE IF NOT EXISTS strategy_store (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  strategy_type TEXT NOT NULL DEFAULT 'default',
  strategy_config TEXT NOT NULL DEFAULT '{}',
  code TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  sid TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  iat INTEGER NOT NULL,
  exp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON activation_codes(status);
CREATE INDEX IF NOT EXISTS idx_activation_codes_created_at ON activation_codes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_code_devices_code ON activation_code_devices(code);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_exp ON admin_sessions(exp);
CREATE INDEX IF NOT EXISTS idx_used_nonces_exp ON used_nonces(expires_at);

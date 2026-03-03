-- Migration number: 0002   2026-03-03T00:30:00Z
PRAGMA foreign_keys = ON;

ALTER TABLE activation_codes ADD COLUMN card_type TEXT NOT NULL DEFAULT 'month';
ALTER TABLE activation_codes ADD COLUMN duration_sec INTEGER NOT NULL DEFAULT 2592000;
ALTER TABLE activation_codes ADD COLUMN activated_at INTEGER;

-- Backfill legacy records:
-- legacy expiry started from created_at, so we preserve old behavior.
UPDATE activation_codes
SET
  duration_sec = CASE
    WHEN expires_at > created_at THEN (expires_at - created_at)
    ELSE 2592000
  END,
  activated_at = CASE
    WHEN expires_at > created_at THEN created_at
    ELSE NULL
  END,
  card_type = CASE
    WHEN (expires_at - created_at) = 86400 THEN 'day'
    WHEN (expires_at - created_at) = 604800 THEN 'week'
    WHEN (expires_at - created_at) = 2592000 THEN 'month'
    WHEN (expires_at - created_at) = 10800 THEN 'trial3h'
    ELSE 'month'
  END;

CREATE INDEX IF NOT EXISTS idx_activation_codes_expires_at ON activation_codes(expires_at);

-- Migration number: 0003   2026-03-04T00:00:00Z
PRAGMA foreign_keys = ON;

-- 1. 创建新表：devices（设备中心表）
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY NOT NULL,
  device_name TEXT NOT NULL DEFAULT '',
  app_version TEXT NOT NULL DEFAULT '',
  client_ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- 2. 创建新表：device_activations（设备激活记录表）
CREATE TABLE IF NOT EXISTS device_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  activation_code TEXT NOT NULL,
  activated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  renewal_count INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE,
  FOREIGN KEY (activation_code) REFERENCES activation_codes(code) ON DELETE RESTRICT,
  UNIQUE (device_id, activation_code)
);

-- 3. 索引优化
CREATE INDEX IF NOT EXISTS idx_device_activations_device_id ON device_activations(device_id);
CREATE INDEX IF NOT EXISTS idx_device_activations_activation_code ON device_activations(activation_code);
CREATE INDEX IF NOT EXISTS idx_device_activations_expires_at ON device_activations(expires_at);
CREATE INDEX IF NOT EXISTS idx_device_activations_is_active ON device_activations(is_active);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_is_active ON devices(is_active);

-- 4. 数据迁移
INSERT OR IGNORE INTO devices (
  device_id, device_name, app_version, client_ip, user_agent, 
  first_seen_at, last_seen_at, is_active
)
SELECT
  device_id,
  device_name,
  app_version,
  client_ip,
  user_agent,
  first_seen_at,
  last_seen_at,
  1
FROM activation_code_devices;

INSERT INTO device_activations (
  device_id, activation_code, activated_at, expires_at, is_active, 
  renewal_count, use_count, updated_at
)
SELECT
  acd.device_id,
  acd.code,
  acd.first_seen_at,
  ac.expires_at,
  1,
  0,
  acd.use_count,
  acd.last_seen_at
FROM activation_code_devices acd
JOIN activation_codes ac ON acd.code = ac.code
ON CONFLICT(device_id, activation_code) DO UPDATE SET
  use_count = excluded.use_count,
  updated_at = excluded.updated_at;

-- 5. 可选：清理旧表（在验证数据迁移成功后执行）
-- DROP TABLE IF EXISTS activation_code_devices;
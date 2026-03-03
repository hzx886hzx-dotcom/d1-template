import type {
  DeviceRow,
  DeviceActivationRow,
  DeviceActivationStatus,
  DeviceInfo,
  DeviceActivationInfo,
  DeviceTreeNode,
  PaginationParams,
  PaginationResult,
  DeviceRenewResult,
} from "../types";
import { nowSec, normalizeCode } from "../utils/helpers";

export async function getDeviceStatus(db: D1Database, deviceId: string): Promise<DeviceActivationStatus> {
  const now = nowSec();
  const deviceIdNorm = normalizeCode(deviceId || "UNKNOWN");

  const device = await db.prepare(
    "SELECT device_id, device_name, app_version, client_ip, user_agent, first_seen_at, last_seen_at, is_active FROM devices WHERE device_id = ? LIMIT 1"
  ).bind(deviceIdNorm).first<DeviceRow>();

  if (!device) {
    return {
      deviceId: deviceIdNorm,
      currentActivationCode: null,
      totalValidUntil: 0,
      isActive: false,
      activationCount: 0,
      renewalCount: 0,
      lastSeenAt: 0,
    };
  }

  const activations = await db.prepare(`
    SELECT da.id, da.activation_code, da.activated_at, da.expires_at, da.is_active, da.renewal_count,
           ac.status as code_status, ac.card_type, ac.duration_sec, ac.activated_at as code_activated_at
    FROM device_activations da
    INNER JOIN activation_codes ac ON da.activation_code = ac.code
    WHERE da.device_id = ?
    ORDER BY da.activated_at DESC
  `).bind(deviceIdNorm).all<DeviceActivationRow & {
    code_status: string;
    card_type: string;
    duration_sec: number;
    code_activated_at: number | null;
  }>();

  const activationList = activations.results || [];
  let totalValidUntil = 0;
  let currentActivationCode: string | null = null;
  let renewalCount = 0;
  let hasActiveActivation = false;
  let maxExpiresAt = 0;

  for (const act of activationList) {
    renewalCount += Number(act.renewal_count || 0);

    if (act.code_status !== "active") continue;

    const isPermanent = String(act.card_type || "") === "permanent";
    const expiresAt = Number(act.expires_at || 0);
    const isExpired = !isPermanent && expiresAt > 0 && expiresAt < now;

    if (!isExpired && Boolean(act.is_active)) {
      hasActiveActivation = true;

      if (isPermanent) {
        totalValidUntil = 0;
        currentActivationCode = act.activation_code;
        break;
      } else if (expiresAt > 0) {
        if (expiresAt > maxExpiresAt) {
          maxExpiresAt = expiresAt;
          currentActivationCode = act.activation_code;
        }
      }
    }
  }

  if (!hasActiveActivation && maxExpiresAt > 0) {
    totalValidUntil = maxExpiresAt;
  } else {
    totalValidUntil = maxExpiresAt;
  }

  return {
    deviceId: deviceIdNorm,
    currentActivationCode,
    totalValidUntil,
    isActive: hasActiveActivation,
    activationCount: activationList.length,
    renewalCount,
    lastSeenAt: Number(device.last_seen_at || 0),
  };
}

export async function checkCodeAvailableForScheme(
  db: D1Database,
  code: string,
  deviceId: string
): Promise<{ ok: boolean; msg?: string }> {
  const deviceIdNorm = normalizeCode(deviceId);
  const codeNorm = normalizeCode(code);
  const now = nowSec();

  const binding = await db.prepare(
    "SELECT 1 FROM device_activations WHERE device_id = ? AND activation_code = ? LIMIT 1"
  ).bind(deviceIdNorm, codeNorm).first<{ "1": number }>();

  if (!binding) {
    return { ok: false, msg: "activation code not bound to this device or invalid token" };
  }

  const deviceStatus = await getDeviceStatus(db, deviceIdNorm);

  if (!deviceStatus.isActive) {
    const permanentExists = await db.prepare(`
      SELECT 1 
      FROM device_activations da
      INNER JOIN activation_codes ac ON da.activation_code = ac.code
      WHERE da.device_id = ? 
        AND da.is_active = 1
        AND ac.status = 'active'
        AND ac.card_type = 'permanent'
      LIMIT 1
    `).bind(deviceIdNorm).first<{ "1": number }>();

    if (permanentExists) {
      return { ok: true };
    }

    if (deviceStatus.totalValidUntil > 0 && deviceStatus.totalValidUntil < now) {
      return {
        ok: false,
        msg: `device activation expired at ${new Date(deviceStatus.totalValidUntil * 1000).toLocaleString()}`,
      };
    }

    return { ok: false, msg: "device is not active" };
  }

  return { ok: true };
}

export async function renewDeviceActivation(
  db: D1Database,
  deviceId: string,
  activationCode: string,
  p: { addDays: number; addUses: number }
): Promise<DeviceRenewResult> {
  const now = nowSec();
  const deviceIdNorm = normalizeCode(deviceId);
  const codeNorm = normalizeCode(activationCode);

  const activation = await db.prepare(
    "SELECT da.id, da.expires_at, da.renewal_count, ac.card_type FROM device_activations da " +
    "INNER JOIN activation_codes ac ON da.activation_code = ac.code " +
    "WHERE da.device_id = ? AND da.activation_code = ? AND da.is_active = 1 LIMIT 1"
  ).bind(deviceIdNorm, codeNorm).first<{
    id: number;
    expires_at: number;
    renewal_count: number;
    card_type: string;
  }>();

  if (!activation) {
    return { ok: false, msg: "device activation not found" };
  }

  const isPermanent = String(activation.card_type || "") === "permanent";
  if (isPermanent) {
    return { ok: false, msg: "permanent activation cannot be renewed" };
  }

  const days = Math.max(0, Number(p.addDays || 0));
  const uses = Math.max(0, Number(p.addUses || 0));

  if (days <= 0 && uses <= 0) {
    return { ok: false, msg: "nothing to renew" };
  }

  if (uses > 0) {
    await db.prepare(
      "UPDATE activation_codes SET max_uses = max_uses + ?, updated_at = ? WHERE code = ?"
    ).bind(uses, now, codeNorm).run();
  }

  const extraSec = days * 86400;
  const newExpiresAt = Math.max(now, Number(activation.expires_at || now)) + extraSec;
  const newRenewalCount = Number(activation.renewal_count || 0) + 1;

  await db.prepare(
    "UPDATE device_activations SET expires_at = ?, renewal_count = ?, updated_at = ? WHERE id = ?"
  ).bind(newExpiresAt, newRenewalCount, now, activation.id).run();

  const deviceStatus = await getDeviceStatus(db, deviceIdNorm);

  return {
    ok: true,
    data: {
      deviceId: deviceIdNorm,
      activationCode: codeNorm,
      newExpiresAt,
      renewalCount: newRenewalCount,
      deviceStatus,
    },
  };
}

export async function getDeviceActivations(db: D1Database, deviceId: string): Promise<DeviceActivationInfo[]> {
  const deviceIdNorm = normalizeCode(deviceId);

  const rows = await db.prepare(`
    SELECT 
      da.activation_code,
      da.activated_at,
      da.expires_at,
      da.is_active,
      da.renewal_count,
      ac.status as code_status,
      ac.card_type,
      ac.duration_sec,
      ac.max_uses,
      ac.used_count,
      ac.issued_to,
      ac.note
    FROM device_activations da
    INNER JOIN activation_codes ac ON da.activation_code = ac.code
    WHERE da.device_id = ?
    ORDER BY da.activated_at DESC
  `).bind(deviceIdNorm).all<{
    activation_code: string;
    activated_at: number;
    expires_at: number;
    is_active: number;
    renewal_count: number;
    code_status: string;
    card_type: string;
    duration_sec: number;
    max_uses: number;
    used_count: number;
    issued_to: string;
    note: string;
  }>();

  return (rows.results || []).map((row) => ({
    activationCode: row.activation_code,
    activatedAt: Number(row.activated_at || 0),
    expiresAt: Number(row.expires_at || 0),
    isActive: Boolean(row.is_active || 0),
    renewalCount: Number(row.renewal_count || 0),
    codeStatus: row.code_status,
    cardType: row.card_type,
    durationSec: Number(row.duration_sec || 0),
    maxUses: Number(row.max_uses || 0),
    usedCount: Number(row.used_count || 0),
    issuedTo: row.issued_to,
    note: row.note,
  }));
}

export async function listDevicesPage(
  db: D1Database,
  p: PaginationParams
): Promise<PaginationResult<DeviceInfo>> {
  const page = Math.max(1, Number(p.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(p.pageSize || 10)));
  const keyword = String(p.keyword || "").trim().toUpperCase();

  const whereSql: string[] = [];
  const binds: (string | number)[] = [];

  if (keyword) {
    whereSql.push(`(
      UPPER(device_id) LIKE ? OR
      UPPER(device_name) LIKE ? OR
      UPPER(app_version) LIKE ? OR
      UPPER(client_ip) LIKE ? OR
      EXISTS (
        SELECT 1
        FROM device_activations da
        INNER JOIN activation_codes ac ON da.activation_code = ac.code
        WHERE da.device_id = devices.device_id
          AND (UPPER(da.activation_code) LIKE ? OR UPPER(ac.issued_to) LIKE ?)
      )
    )`);
    binds.push(
      `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`,
      `%${keyword}%`, `%${keyword}%`
    );
  }

  const where = whereSql.length ? `WHERE ${whereSql.join(" AND ")}` : "";

  const total = Number(
    (await db.prepare(`SELECT COUNT(1) as total FROM devices ${where}`).bind(...binds).first<{ total: number }>())?.total || 0
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;

  const rows = await db.prepare(
    `SELECT device_id, device_name, app_version, client_ip, user_agent, first_seen_at, last_seen_at, is_active 
     FROM devices ${where} 
     ORDER BY last_seen_at DESC 
     LIMIT ? OFFSET ?`
  ).bind(...binds, pageSize, offset).all<DeviceRow>();

  const devices = (rows.results || []).map(async (row) => {
    const deviceStatus = await getDeviceStatus(db, row.device_id);

    const activationCount = Number(
      (await db.prepare("SELECT COUNT(1) as c FROM device_activations WHERE device_id = ?")
        .bind(row.device_id).first<{ c: number }>())?.c || 0
    );

    return {
      deviceId: row.device_id,
      deviceName: row.device_name,
      appVersion: row.app_version,
      clientIp: row.client_ip,
      userAgent: row.user_agent,
      firstSeenAt: Number(row.first_seen_at || 0),
      lastSeenAt: Number(row.last_seen_at || 0),
      isActive: Boolean(row.is_active || 0),
      activationCount,
      totalValidUntil: deviceStatus.totalValidUntil,
      currentActivationCode: deviceStatus.currentActivationCode,
      deviceStatus: deviceStatus.isActive ? "active" : "expired",
    };
  });

  const data = await Promise.all(devices);

  return {
    data,
    pagination: {
      page: currentPage,
      pageSize,
      total,
      totalPages,
    },
  };
}

export async function listDeviceTree(db: D1Database, keywordRaw: string): Promise<DeviceTreeNode[]> {
  const keyword = String(keywordRaw || "").trim().toUpperCase();
  const where = keyword
    ? "WHERE (UPPER(d.device_id) LIKE ? OR UPPER(d.device_name) LIKE ? OR UPPER(da.activation_code) LIKE ?)"
    : "";
  const binds: string[] = keyword ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`] : [];

  const rows = await db.prepare(`
    SELECT
      d.device_id,
      d.device_name,
      da.activation_code as code,
      da.expires_at,
      da.is_active as activation_active,
      ac.status as code_status,
      ac.max_uses,
      ac.used_count,
      ac.card_type
    FROM devices d
    INNER JOIN device_activations da ON d.device_id = da.device_id
    INNER JOIN activation_codes ac ON da.activation_code = ac.code
    ${where}
    ORDER BY d.device_id ASC, da.activated_at DESC
  `).bind(...binds).all<{
    device_id: string;
    device_name: string;
    code: string;
    expires_at: number;
    activation_active: number;
    code_status: string;
    max_uses: number;
    used_count: number;
    card_type: string;
  }>();

  const deviceMap = new Map<string, DeviceTreeNode>();

  for (const row of rows.results || []) {
    const key = normalizeCode(row.device_id || "UNKNOWN");
    if (!deviceMap.has(key)) {
      const device = await db.prepare(
        "SELECT last_seen_at FROM devices WHERE device_id = ? LIMIT 1"
      ).bind(key).first<{ last_seen_at: number }>();

      deviceMap.set(key, {
        deviceId: key,
        deviceName: String(row.device_name || ""),
        totalUses: 0,
        codeCount: 0,
        lastSeenAt: device ? Number(device.last_seen_at || 0) : 0,
        children: [],
      });
    }

    const node = deviceMap.get(key)!;
    node.codeCount += 1;

    const useCount = Number(
      (await db.prepare(
        "SELECT use_count FROM device_activations WHERE device_id = ? AND activation_code = ? LIMIT 1"
      ).bind(key, row.code).first<{ use_count: number }>())?.use_count || 0
    );

    node.totalUses += useCount;

    node.children.push({
      code: String(row.code || ""),
      status: String(row.code_status || ""),
      expiresAt: Number(row.expires_at || 0),
      maxUses: Number(row.max_uses || 0),
      usedCount: Number(row.used_count || 0),
      isActive: Boolean(row.activation_active || 0),
      cardType: String(row.card_type || "month"),
    });
  }

  return [...deviceMap.values()];
}

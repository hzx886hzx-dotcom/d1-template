import type {
  ActivationCodeRow,
  FormattedActivationCode,
  CreateCodesParams,
  RenewCodeParams,
  PaginationParams,
  PaginationResult,
  ActivationValidationResult,
  RenewResult,
  BatchRenewResult,
  BatchOperationResult,
  DeviceUsageInfo,
  UsageContext,
} from "../types";
import {
  nowSec,
  normalizeCardType,
  CARD_TYPE_SECONDS,
  computeExpireAt,
  isCodeExpired,
  randomCode,
  normalizeCode,
} from "../utils/helpers";

export function formatCodeRow(row: ActivationCodeRow): FormattedActivationCode {
  return {
    code: row.code,
    status: row.status,
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    cardType: String(row.card_type || "month"),
    durationSec: Number(row.duration_sec || CARD_TYPE_SECONDS.month),
    activatedAt: row.activated_at ? Number(row.activated_at) : null,
    maxUses: Number(row.max_uses || 0),
    usedCount: Number(row.used_count || 0),
    lastUsedAt: row.last_used_at ? Number(row.last_used_at) : null,
    issuedTo: String(row.issued_to || ""),
    note: String(row.note || ""),
    deviceLimit: Math.max(1, Number(row.device_limit || 1)),
  };
}

export async function ensureSeedCode(
  db: D1Database,
  seedCode: string,
  expiresInDays: number,
  maxUses: number
): Promise<void> {
  const existing = await db.prepare("SELECT code FROM activation_codes WHERE code = ? LIMIT 1")
    .bind(seedCode)
    .first<{ code: string }>();
  if (existing) return;
  const now = nowSec();
  const durationSec = Math.max(1, Number(expiresInDays || 365)) * 86400;
  await db.prepare(
    "INSERT INTO activation_codes (code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at) VALUES (?, 'active', ?, 0, 'month', ?, NULL, ?, 0, NULL, 'seed', 'system seed code', 1, ?)"
  ).bind(seedCode, now, durationSec, maxUses, now).run();
}

export async function createCodes(db: D1Database, p: CreateCodesParams): Promise<FormattedActivationCode[]> {
  const c = Math.max(1, Math.min(200, Number(p.count || 1)));
  const cardType = normalizeCardType(p.cardType);
  const durationSec = cardType === "permanent"
    ? 0
    : Math.max(3600, Math.min(3650 * 86400, Number(p.durationSec || CARD_TYPE_SECONDS.month)));
  const uses = Math.max(1, Math.min(1000000, Number(p.maxUses || 1)));
  const dl = Math.max(1, Math.min(20, Number(p.deviceLimit || 1)));
  const now = nowSec();
  const created: ActivationCodeRow[] = [];

  for (let i = 0; i < c; i += 1) {
    let code = randomCode(p.prefix);
    for (let x = 0; x < 5; x += 1) {
      const found = await db.prepare("SELECT code FROM activation_codes WHERE code = ? LIMIT 1")
        .bind(code)
        .first<{ code: string }>();
      if (!found) break;
      code = randomCode(p.prefix);
    }

    await db.prepare(
      "INSERT INTO activation_codes (code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at) VALUES (?, 'active', ?, 0, ?, ?, NULL, ?, 0, NULL, ?, ?, ?, ?)"
    ).bind(code, now, cardType, durationSec, uses, p.issuedTo, p.note, dl, now).run();
    created.push({
      code,
      status: "active",
      created_at: now,
      expires_at: 0,
      card_type: cardType,
      duration_sec: durationSec,
      activated_at: null,
      max_uses: uses,
      used_count: 0,
      last_used_at: null,
      issued_to: p.issuedTo,
      note: p.note,
      device_limit: dl,
      updated_at: now,
    });
  }

  return created.map(formatCodeRow);
}

export async function listCodesPage(
  db: D1Database,
  p: PaginationParams & { status?: string }
): Promise<PaginationResult<FormattedActivationCode>> {
  const page = Math.max(1, Number(p.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(p.pageSize || 10)));
  const status = String(p.status || "").trim().toLowerCase();
  const keyword = String(p.keyword || "").trim().toUpperCase();

  const whereSql: string[] = [];
  const binds: (string | number)[] = [];
  if (status) {
    whereSql.push("LOWER(status) = ?");
    binds.push(status);
  }
  if (keyword) {
    whereSql.push(`(
      UPPER(code) LIKE ? OR
      UPPER(issued_to) LIKE ? OR
      UPPER(note) LIKE ? OR
      EXISTS (
        SELECT 1
        FROM activation_code_devices d
        WHERE d.code = activation_codes.code
          AND (UPPER(d.device_id) LIKE ? OR UPPER(d.device_name) LIKE ?)
      )
    )`);
    binds.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const where = whereSql.length ? `WHERE ${whereSql.join(" AND ")}` : "";

  const total = Number(
    (await db.prepare(`SELECT COUNT(1) as total FROM activation_codes ${where}`).bind(...binds).first<{ total: number }>())?.total || 0
  );
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;

  const rows = await db.prepare(
    `SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, pageSize, offset).all<ActivationCodeRow>();
  const data = (rows.results || []).map(formatCodeRow);

  for (const item of data) {
    (item as FormattedActivationCode).deviceCount = Number(
      (await db.prepare("SELECT COUNT(1) as c FROM device_activations WHERE activation_code = ? AND is_active = 1")
        .bind(item.code)
        .first<{ c: number }>())?.c || 0
    );
  }

  return { data, pagination: { page: currentPage, pageSize, total, totalPages } };
}

export async function disableCode(db: D1Database, code: string): Promise<boolean> {
  return Number(
    (await db.prepare("UPDATE activation_codes SET status = 'disabled', updated_at = ? WHERE code = ?")
      .bind(nowSec(), code)
      .run()).meta?.changes || 0
  ) > 0;
}

export async function batchDisableCodes(db: D1Database, codes: string[]): Promise<BatchOperationResult> {
  const now = nowSec();
  let affected = 0;
  for (const code of codes) {
    const changed = Number(
      (await db.prepare("UPDATE activation_codes SET status = 'disabled', updated_at = ? WHERE code = ?")
        .bind(now, code)
        .run()).meta?.changes || 0
    );
    affected += changed;
  }
  return { requested: codes.length, affected };
}

export async function renewCode(db: D1Database, code: string, p: RenewCodeParams): Promise<RenewResult> {
  const record = await db.prepare(
    "SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1"
  ).bind(code).first<ActivationCodeRow>();
  if (!record) return { ok: false, msg: "activation code not found" };

  const days = Math.max(0, Number(p.addDays || 0));
  const uses = Math.max(0, Number(p.addUses || 0));
  if (days <= 0 && uses <= 0 && !p.reactivate) return { ok: false, msg: "nothing to renew" };

  const now = nowSec();
  const extraSec = days * 86400;
  const currentDuration = Math.max(0, Number(record.duration_sec || 0));
  const nextDuration = String(record.card_type || "month") === "permanent" ? 0 : currentDuration + extraSec;
  const nextExpire = computeExpireAt(String(record.card_type || "month"), Number(record.activated_at || 0) || null, nextDuration);
  const nextUses = uses > 0 ? Number(record.max_uses || 0) + uses : Number(record.max_uses || 0);
  const nextStatus = p.reactivate ? "active" : String(record.status || "active");

  await db.prepare(
    "UPDATE activation_codes SET expires_at = ?, duration_sec = ?, max_uses = ?, status = ?, updated_at = ? WHERE code = ?"
  ).bind(nextExpire, nextDuration, nextUses, nextStatus, now, code).run();
  const fresh = await db.prepare(
    "SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1"
  ).bind(code).first<ActivationCodeRow>();
  return { ok: true, data: fresh ? formatCodeRow(fresh) : null };
}

export async function batchRenewCodes(
  db: D1Database,
  codes: string[],
  p: RenewCodeParams
): Promise<BatchRenewResult> {
  const days = Math.max(0, Number(p.addDays || 0));
  const uses = Math.max(0, Number(p.addUses || 0));
  if (days <= 0 && uses <= 0 && !p.reactivate) return { ok: false, msg: "nothing to renew" };
  const now = nowSec();
  const data: FormattedActivationCode[] = [];
  let affected = 0;

  for (const code of codes) {
    const record = await db.prepare(
      "SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1"
    ).bind(code).first<ActivationCodeRow>();
    if (!record) continue;
    const extraSec = days * 86400;
    const currentDuration = Math.max(0, Number(record.duration_sec || 0));
    const nextDuration = String(record.card_type || "month") === "permanent" ? 0 : currentDuration + extraSec;
    const nextExpire = computeExpireAt(String(record.card_type || "month"), Number(record.activated_at || 0) || null, nextDuration);
    const nextUses = uses > 0 ? Number(record.max_uses || 0) + uses : Number(record.max_uses || 0);
    const nextStatus = p.reactivate ? "active" : String(record.status || "active");
    const changed = Number(
      (await db.prepare(
        "UPDATE activation_codes SET expires_at = ?, duration_sec = ?, max_uses = ?, status = ?, updated_at = ? WHERE code = ?"
      ).bind(nextExpire, nextDuration, nextUses, nextStatus, now, code).run()).meta?.changes || 0
    );
    affected += changed;
    if (changed > 0) {
      const fresh = await db.prepare(
        "SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1"
      ).bind(code).first<ActivationCodeRow>();
      if (fresh) data.push(formatCodeRow(fresh));
    }
  }

  return { ok: true, data: { requested: codes.length, affected, items: data } };
}

export async function batchDeleteCodes(db: D1Database, codes: string[]): Promise<BatchOperationResult> {
  let affected = 0;
  for (const code of codes) {
    const changed = Number(
      (await db.prepare("DELETE FROM activation_codes WHERE code = ?").bind(code).run()).meta?.changes || 0
    );
    affected += changed;
  }
  return { requested: codes.length, affected };
}

export async function getCodeUsages(
  db: D1Database,
  code: string
): Promise<{ ok: boolean; msg?: string; data?: DeviceUsageInfo[] }> {
  const found = await db.prepare("SELECT code FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first();
  if (!found) return { ok: false, msg: "activation code not found" };

  const rows = await db.prepare(`
    SELECT d.device_id, d.device_name, d.app_version, d.client_ip, d.user_agent, d.first_seen_at, d.last_seen_at, 
           da.use_count, da.activated_at, da.expires_at, da.is_active, da.renewal_count
    FROM device_activations da
    INNER JOIN devices d ON d.device_id = da.device_id
    WHERE da.activation_code = ?
    ORDER BY da.activated_at DESC
  `).bind(code).all<{
    device_id: string;
    device_name: string;
    app_version: string;
    client_ip: string;
    user_agent: string;
    first_seen_at: number;
    last_seen_at: number;
    use_count: number;
    activated_at: number;
    expires_at: number;
    is_active: number;
    renewal_count: number;
  }>();

  return {
    ok: true,
    data: (rows.results || []).map((x) => ({
      deviceId: x.device_id,
      deviceName: x.device_name,
      appVersion: x.app_version,
      clientIp: x.client_ip,
      userAgent: x.user_agent,
      firstSeenAt: Number(x.first_seen_at || 0),
      lastSeenAt: Number(x.last_seen_at || 0),
      useCount: Number(x.use_count || 0),
      activatedAt: Number(x.activated_at || 0),
      expiresAt: Number(x.expires_at || 0),
      isActive: Boolean(x.is_active || 0),
      renewalCount: Number(x.renewal_count || 0),
    })),
  };
}

export async function validateAndConsumeCode(
  db: D1Database,
  code: string,
  usage: UsageContext,
  getDeviceStatusFn?: (db: D1Database, deviceId: string) => Promise<unknown>
): Promise<ActivationValidationResult> {
  const now = nowSec();
  const currentDeviceId = normalizeCode(usage.deviceId || "UNKNOWN");

  const record = await db.prepare(
    "SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1"
  ).bind(code).first<ActivationCodeRow>();

  if (!record) return { ok: false, msg: "invalid activation code" };

  if (record.status !== "active") return { ok: false, msg: "activation code disabled" };
  if (isCodeExpired(record, now)) {
    await db.prepare("DELETE FROM activation_codes WHERE code = ?").bind(code).run();
    return { ok: false, msg: "activation code expired" };
  }
  if (Number(record.used_count || 0) >= Number(record.max_uses || 0)) {
    return { ok: false, msg: "activation code usage limit reached" };
  }

  const existingBinding = await db.prepare(
    "SELECT id FROM device_activations WHERE device_id = ? AND activation_code = ? LIMIT 1"
  ).bind(currentDeviceId, code).first<{ id: number }>();

  if (existingBinding) {
    return { ok: false, msg: "activation code already used on this device" };
  }

  const deviceCount = Number(
    (await db.prepare(
      "SELECT COUNT(1) as c FROM device_activations WHERE activation_code = ? AND is_active = 1"
    ).bind(code).first<{ c: number }>())?.c || 0
  );

  const deviceLimit = Math.max(1, Number(record.device_limit || 1));
  if (deviceCount >= deviceLimit) {
    return { ok: false, msg: "activation code bound to another device" };
  }

  const activatedAt = Number(record.activated_at || 0) || null;
  const baseDuration = Math.max(0, Number(record.duration_sec || CARD_TYPE_SECONDS.month));
  const computedExpireAt = computeExpireAt(String(record.card_type || "month"), activatedAt || now, baseDuration);

  const updated = await db.prepare(
    "UPDATE activation_codes SET used_count = used_count + 1, last_used_at = ?, updated_at = ?, activated_at = COALESCE(activated_at, ?), expires_at = CASE WHEN card_type = 'permanent' THEN 0 WHEN activated_at IS NULL THEN ? ELSE expires_at END WHERE code = ? AND status = 'active' AND used_count < max_uses"
  ).bind(now, now, now, computedExpireAt, code).run();

  if (Number(updated.meta?.changes || 0) <= 0) {
    return { ok: false, msg: "activation code usage limit reached" };
  }

  await db.prepare(
    "INSERT OR REPLACE INTO devices (device_id, device_name, app_version, client_ip, user_agent, first_seen_at, last_seen_at, is_active) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT first_seen_at FROM devices WHERE device_id = ?), ?), ?, 1)"
  ).bind(
    currentDeviceId,
    String(usage.deviceName || ""),
    String(usage.appVersion || ""),
    String(usage.clientIp || ""),
    String(usage.userAgent || ""),
    currentDeviceId,
    now,
    now
  ).run();

  await db.prepare(
    "INSERT INTO device_activations (device_id, activation_code, activated_at, expires_at, is_active, renewal_count) VALUES (?, ?, ?, ?, 1, 0)"
  ).bind(currentDeviceId, code, now, computedExpireAt).run();

  const fresh = await db.prepare(
    "SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1"
  ).bind(code).first<ActivationCodeRow>();

  if (!fresh) return { ok: false, msg: "activation code update failed" };

  return {
    ok: true,
    record: fresh,
    deviceCount: deviceCount + 1,
  };
}

export async function cleanupExpiredCodes(db: D1Database): Promise<void> {
  const now = nowSec();
  await db.prepare(
    "DELETE FROM activation_codes WHERE card_type != 'permanent' AND activated_at IS NOT NULL AND expires_at > 0 AND expires_at < ?"
  ).bind(now).run();
}

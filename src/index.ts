import { sm4 } from "sm-crypto";

type Json = Record<string, unknown>;
type StrategyPayload = { period?: number; history?: unknown[]; number_list?: unknown[]; token_sn?: string; device?: Record<string, unknown> };
type StrategyConfig = { mode: "recent_unique"; take: number; min: number; max: number; multiple: number };
type RuntimeConfig = {
  signFixed: string;
  tokenTtlSec: number;
  adminUsername: string;
  adminPassword: string;
  adminPasswordHash: string;
  seedActivationCode: string;
  seedCodeExpiresInDays: number;
  seedCodeMaxUses: number;
  aesIv: Uint8Array;
  aesCryptoKey: CryptoKey;
  sm4KeyHex: string;
};
type ActivationCodeRow = {
  code: string;
  status: string;
  created_at: number;
  expires_at: number;
  max_uses: number;
  used_count: number;
  last_used_at: number | null;
  issued_to: string;
  note: string;
  device_limit: number;
  updated_at: number;
};

const encoder = new TextEncoder();
const FIVE_MINUTES = 300;
const NONCE_TTL_SEC = 600;
const DEFAULT_STRATEGY: StrategyConfig = { mode: "recent_unique", take: 6, min: 0, max: 27, multiple: 1 };
let cachedCfg: { key: string; value: RuntimeConfig } | null = null;
let bootstrapDone = false;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const cfg = await getConfig(env);
      await bootstrapIfNeeded(env, cfg);
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const pathname = url.pathname;

      if (method === "GET" && pathname === "/") {
        return json(200, { code: 200, msg: "ok", data: { service: "sn-node-server-worker", runtime: "cloudflare-workers" } });
      }
      if (method === "GET" && pathname === "/scheme") {
        return json(200, { code: 200, msg: "ok", data: { info: "Use POST /api/get_scheme with sm4 encrypted body.data" } });
      }
      if (method === "GET" && pathname === "/health") {
        return json(200, { code: 200, msg: "ok", data: { now: nowSec() } });
      }

      if (method === "POST" && pathname === "/api/verify") {
        const parsed = await parseRequestBody(request);
        const guard = await signGuard(request, env, cfg, parsed.rawBody);
        if (guard) return guard;
        const body = parsed.body;
        const sn = normalizeCode(body.sn);
        if (!sn) return json(400, { code: 400, msg: "sn is required" });
        if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(sn)) {
          return json(400, { code: 400, msg: "sn must be XXXX-XXXX (uppercase letters/digits)" });
        }

        const usage = buildUsageContext(request, body);
        const validated = await validateAndConsumeCode(env.DB, sn, usage);
        if (!validated.ok) return json(401, { code: 401, msg: validated.msg });

        const token = sm4Encrypt(
          { token_type: "external", sn, device_id: normalizeCode(usage.deviceId || "UNKNOWN"), iat: nowSec(), exp: nowSec() + cfg.tokenTtlSec },
          cfg,
        );
        return json(200, {
          code: 200,
          msg: "ok",
          data: token,
          activation: {
            sn: validated.record.code,
            status: validated.record.status,
            expiresAt: Number(validated.record.expires_at || 0),
            maxUses: Number(validated.record.max_uses || 0),
            usedCount: Number(validated.record.used_count || 0),
            deviceCount: validated.deviceCount,
            deviceLimit: Number(validated.record.device_limit || 1),
            tokenExpiresAt: nowSec() + cfg.tokenTtlSec,
          },
        });
      }

      if (method === "POST" && pathname === "/api/get_scheme") {
        const parsed = await parseRequestBody(request);
        const guard = await signGuard(request, env, cfg, parsed.rawBody);
        if (guard) return guard;

        const payload = readExternalToken(request.headers.get("x-auth-token") || "", cfg);
        if (!payload) return json(401, { code: 401, msg: "invalid x-auth-token" });

        const body = parsed.body;
        const usage = buildUsageContext(request, body);
        if (normalizeCode(payload.device_id) !== normalizeCode(usage.deviceId || "UNKNOWN")) {
          return json(401, { code: 401, msg: "token device mismatch" });
        }

        const encrypted = typeof body.data === "string" ? body.data : "";
        if (!encrypted) return json(400, { code: 400, msg: "body.data (sm4 encrypted) is required" });

        let decrypted: Record<string, unknown>;
        try {
          const out = sm4Decrypt(encrypted, cfg);
          if (!out || typeof out !== "object") return json(400, { code: 400, msg: "decrypted payload must be object" });
          decrypted = out as Record<string, unknown>;
        } catch {
          return json(400, { code: 400, msg: "invalid sm4 payload" });
        }

        if (decrypted.period === undefined) {
          return json(400, { code: 400, msg: "decrypted payload must contain period/history" });
        }

        try {
          const period = Number(decrypted.period || 0);
          const history = Array.isArray(decrypted.history) ? decrypted.history : [];
          const numberList = Array.isArray(decrypted.number_list)
            ? decrypted.number_list
            : history.map((x) => Number(((x as Record<string, unknown>)?.sum as number) || 0));

          const strategy = await executeStrategy(env.DB, {
            period,
            history,
            number_list: numberList,
            token_sn: payload.sn,
            device: { ...usage, ...(typeof decrypted.device === "object" ? (decrypted.device as Record<string, unknown>) : {}) },
          });

          return json(200, { code: 200, msg: "ok", data: sm4Encrypt({ period, numbers: strategy.numbers, multiple: strategy.multiple }, cfg) });
        } catch (err) {
          return json(500, { code: 500, msg: `strategy execute failed: ${err instanceof Error ? err.message : String(err)}` });
        }
      }

      if (method === "POST" && pathname === "/web/login") {
        const { body } = await parseRequestBody(request);
        const username = String(body.username || "").trim();
        const password = String(body.password || "").trim();
        const sliderPassed = Boolean(body.sliderPassed);
        if (!sliderPassed) return json(400, { code: 400, msg: "slider captcha not passed" });
        if (!(await verifyAdminCredential(username, password, cfg))) return json(401, { code: 401, msg: "username or password invalid" });
        const sid = randomHex(24);
        const iat = nowSec();
        const exp = iat + cfg.tokenTtlSec;
        await env.DB.prepare("INSERT OR REPLACE INTO admin_sessions (sid, username, iat, exp) VALUES (?, ?, ?, ?)").bind(sid, cfg.adminUsername, iat, exp).run();
        return json(200, { code: 200, msg: "ok" }, { "Set-Cookie": makeSessionCookie("admin_session", sid, cfg.tokenTtlSec) });
      }

      if (method === "POST" && pathname === "/web/logout") {
        const sid = readCookie(request.headers.get("cookie") || "", "admin_session");
        if (sid) await env.DB.prepare("DELETE FROM admin_sessions WHERE sid = ?").bind(sid).run();
        return json(200, { code: 200, msg: "ok" }, { "Set-Cookie": "admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
      }

      if (method === "GET" && pathname === "/web/me") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        return json(200, { code: 200, msg: "ok", data: { username: admin.username } });
      }

      if (method === "GET" && pathname === "/web/scheme") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const periodRaw = Number(url.searchParams.get("period") || "1");
        return json(200, { code: 200, msg: "ok", data: { period: Number.isFinite(periodRaw) ? periodRaw : 1, scheme: [1, 2, 3, 4, 5, 6] } });
      }

      if (method === "GET" && pathname === "/admin/activation-codes") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const result = await listCodesPage(env.DB, {
          page: Number(url.searchParams.get("page") || "1"),
          pageSize: Number(url.searchParams.get("pageSize") || "10"),
          status: String(url.searchParams.get("status") || ""),
          keyword: String(url.searchParams.get("keyword") || ""),
        });
        return json(200, { code: 200, msg: "ok", data: result.data, pagination: result.pagination });
      }

      const usageMatch = pathname.match(/^\/admin\/activation-codes\/([^/]+)\/usages$/);
      if (method === "GET" && usageMatch) {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const result = await getCodeUsages(env.DB, normalizeCode(decodeURIComponent(usageMatch[1])));
        if (!result.ok) return json(404, { code: 404, msg: result.msg });
        return json(200, { code: 200, msg: "ok", data: result.data });
      }

      if (method === "POST" && pathname === "/admin/activation-codes") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const { body } = await parseRequestBody(request);
        const created = await createCodes(env.DB, {
          count: Number(body.count || 1),
          expiresInDays: Number(body.expiresInDays || 30),
          maxUses: Number(body.maxUses || 1),
          deviceLimit: Number(body.deviceLimit || 1),
          prefix: String(body.prefix || "SN"),
          issuedTo: String(body.issuedTo || ""),
          note: String(body.note || ""),
        });
        return json(200, { code: 200, msg: "ok", data: created });
      }

      const disableMatch = pathname.match(/^\/admin\/activation-codes\/([^/]+)\/disable$/);
      if (method === "POST" && disableMatch) {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const ok = await disableCode(env.DB, normalizeCode(decodeURIComponent(disableMatch[1])));
        if (!ok) return json(404, { code: 404, msg: "activation code not found" });
        return json(200, { code: 200, msg: "ok" });
      }

      const renewMatch = pathname.match(/^\/admin\/activation-codes\/([^/]+)\/renew$/);
      if (method === "POST" && renewMatch) {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const { body } = await parseRequestBody(request);
        const result = await renewCode(env.DB, normalizeCode(decodeURIComponent(renewMatch[1])), {
          addDays: Number(body.addDays || 0),
          addUses: Number(body.addUses || 0),
          reactivate: body.reactivate === undefined ? true : Boolean(body.reactivate),
        });
        if (!result.ok) return json(400, { code: 400, msg: result.msg });
        return json(200, { code: 200, msg: "ok", data: result.data });
      }

      if (method === "GET" && pathname === "/admin/strategy") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        return json(200, { code: 200, msg: "ok", data: await loadStrategyStore(env.DB) });
      }

      if (method === "PUT" && pathname === "/admin/strategy") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const { body } = await parseRequestBody(request);
        const code = String(body.code || "").trim();
        if (!code) return json(400, { code: 400, msg: "code is required" });
        try {
          const parsedCode = parseStrategyCode(code);
          const validated = executeStrategyWithConfig(parsedCode, {
            period: 1,
            history: [{ period: 1, sum: 6, numbers: [1, 2, 3], open_time: "2026-01-01 00:00:00" }],
            number_list: [1, 2, 3],
          });
          if (!validated.numbers.length) throw new Error("strategy result.numbers is required");
          const saved = await saveStrategy(env.DB, { code, strategyType: "json", strategyConfig: parsedCode, updatedBy: admin.username });
          return json(200, { code: 200, msg: "ok", data: saved });
        } catch (err) {
          return json(400, { code: 400, msg: `strategy save failed: ${err instanceof Error ? err.message : String(err)}` });
        }
      }

      return json(404, { code: 404, msg: "not found" });
    } catch (err) {
      return json(500, { code: 500, msg: `internal error: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
} satisfies ExportedHandler<Env>;

function nowSec() { return Math.floor(Date.now() / 1000); }
function json(status: number, payload: Json, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}
async function parseRequestBody(request: Request): Promise<{ rawBody: string; body: Json }> {
  const rawBody = await request.text();
  if (!rawBody) return { rawBody: "", body: {} };
  try {
    return { rawBody, body: JSON.parse(rawBody) as Json };
  } catch {
    return { rawBody, body: {} };
  }
}
function normalizeCode(input: unknown) { return String(input || "").trim().toUpperCase(); }
function randomHex(byteLen: number) {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function makeSessionCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.max(1, Math.floor(maxAge))}`;
}
function readCookie(rawCookie: string, key: string) {
  for (const part of rawCookie.split(";").map((x) => x.trim())) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === key) return part.slice(i + 1).trim();
  }
  return "";
}
function buildUsageContext(request: Request, body: Record<string, unknown>) {
  const dev = (body.device || {}) as Record<string, unknown>;
  return {
    deviceId: String(request.headers.get("x-device-id") || dev.device_id || dev.deviceId || "UNKNOWN"),
    deviceName: String(request.headers.get("x-device-name") || dev.device_name || dev.deviceName || ""),
    appVersion: String(request.headers.get("x-app-version") || dev.app_version || dev.appVersion || ""),
    clientIp: String(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || ""),
    userAgent: String(request.headers.get("user-agent") || ""),
  };
}

async function requireAdmin(request: Request, env: Env): Promise<{ username: string } | null> {
  const sid = readCookie(request.headers.get("cookie") || "", "admin_session");
  if (!sid) return null;
  const row = await env.DB.prepare("SELECT username, exp FROM admin_sessions WHERE sid = ? LIMIT 1").bind(sid).first<{ username: string; exp: number }>();
  if (!row) return null;
  if (Number(row.exp || 0) < nowSec()) {
    await env.DB.prepare("DELETE FROM admin_sessions WHERE sid = ?").bind(sid).run();
    return null;
  }
  return { username: String(row.username || "") };
}

async function signGuard(request: Request, env: Env, cfg: RuntimeConfig, rawBody: string) {
  const timestampRaw = request.headers.get("x-timestamp") || request.headers.get("timestamp");
  const sign = request.headers.get("x-sign") || request.headers.get("sign");
  if (!timestampRaw || !sign) return json(400, { code: 400, msg: "missing sign/timestamp" });

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) return json(400, { code: 400, msg: "invalid timestamp" });
  if (Math.abs(nowSec() - timestamp) > FIVE_MINUTES) return json(400, { code: 400, msg: "timestamp expired" });

  if ((await generateSign(rawBody || "", timestamp, cfg)) !== sign) {
    return json(401, { code: 401, msg: "invalid sign" });
  }

  const nonce = (request.headers.get("x-nonce") || request.headers.get("nonce") || "").trim();
  if (nonce) {
    const ok = await consumeNonce(env.DB, nonce);
    if (!ok) return json(401, { code: 401, msg: "duplicate nonce" });
  }

  return null;
}

async function consumeNonce(db: D1Database, nonce: string) {
  const now = nowSec();
  await db.prepare("DELETE FROM used_nonces WHERE expires_at < ?").bind(now).run();
  const found = await db.prepare("SELECT nonce FROM used_nonces WHERE nonce = ? LIMIT 1").bind(nonce).first();
  if (found) return false;
  await db.prepare("INSERT INTO used_nonces (nonce, created_at, expires_at) VALUES (?, ?, ?)").bind(nonce, now, now + NONCE_TTL_SEC).run();
  return true;
}

async function verifyAdminCredential(username: string, password: string, cfg: RuntimeConfig) {
  if (username !== cfg.adminUsername) return false;
  if (cfg.adminPasswordHash) return (await sha256Hex(password)) === cfg.adminPasswordHash;
  return password === cfg.adminPassword;
}

async function bootstrapIfNeeded(env: Env, cfg: RuntimeConfig) {
  if (bootstrapDone) return;
  await env.DB.prepare("INSERT OR IGNORE INTO strategy_store (id, strategy_type, strategy_config, code, updated_at, updated_by) VALUES (1, 'default', ?, '', ?, 'system')").bind(JSON.stringify(DEFAULT_STRATEGY), nowSec()).run();
  if (cfg.seedActivationCode) {
    await ensureSeedCode(env.DB, cfg.seedActivationCode, cfg.seedCodeExpiresInDays, cfg.seedCodeMaxUses);
  }
  bootstrapDone = true;
}

async function getConfig(env: Env): Promise<RuntimeConfig> {
  const cfgKey = [env.SN_SIGN_FIXED || "", env.SN_AES_KEY || "", env.SN_AES_IV || "", env.SN_SM4_KEY || "", env.ADMIN_USERNAME || "", env.ADMIN_PASSWORD || "", env.ADMIN_PASSWORD_HASH || "", env.SEED_ACTIVATION_CODE || "", env.SEED_CODE_EXPIRES_DAYS || "", env.SEED_CODE_MAX_USES || "", env.TOKEN_TTL_SEC || ""].join("|");
  if (cachedCfg && cachedCfg.key === cfgKey) return cachedCfg.value;

  const aesKey = await fixedKey(String(env.SN_AES_KEY || "your-32-byte-aes-key-here"), 32);
  const aesIv = await fixedKey(String(env.SN_AES_IV || "your-16-byte-iv-here"), 16);
  const sm4Key = await fixedKey(String(env.SN_SM4_KEY || "your-sm4-key-here"), 16);

  const value: RuntimeConfig = {
    signFixed: String(env.SN_SIGN_FIXED || "bjx"),
    tokenTtlSec: Math.max(60, Number(env.TOKEN_TTL_SEC || 7200)),
    adminUsername: String(env.ADMIN_USERNAME || "superadmin"),
    adminPassword: String(env.ADMIN_PASSWORD || "Super@123456"),
    adminPasswordHash: String(env.ADMIN_PASSWORD_HASH || "").toLowerCase().trim(),
    seedActivationCode: normalizeCode(env.SEED_ACTIVATION_CODE || ""),
    seedCodeExpiresInDays: Math.max(1, Number(env.SEED_CODE_EXPIRES_DAYS || 365)),
    seedCodeMaxUses: Math.max(1, Number(env.SEED_CODE_MAX_USES || 100000)),
    aesIv,
    aesCryptoKey: await crypto.subtle.importKey("raw", aesKey, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]),
    sm4KeyHex: toHex(sm4Key),
  };
  cachedCfg = { key: cfgKey, value };
  return value;
}

async function fixedKey(raw: string, length: number) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(raw))).slice(0, length);
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error("invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

async function aesEncrypt(plainText: string, cfg: RuntimeConfig) {
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv: cfg.aesIv }, cfg.aesCryptoKey, encoder.encode(plainText));
  return bytesToBase64(new Uint8Array(encrypted));
}

async function generateSign(rawBody: string, timestampSec: number, cfg: RuntimeConfig) {
  return aesEncrypt(`${rawBody}${timestampSec}${cfg.signFixed}`, cfg);
}

function sm4Encrypt(data: unknown, cfg: RuntimeConfig) {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return bytesToBase64(hexToBytes(sm4.encrypt(payload, cfg.sm4KeyHex, { padding: "pkcs#7" })));
}

function sm4Decrypt(cipherText: string, cfg: RuntimeConfig): unknown {
  const plain = sm4.decrypt(toHex(base64ToBytes(cipherText)), cfg.sm4KeyHex, { padding: "pkcs#7" });
  try {
    return JSON.parse(plain);
  } catch {
    return plain;
  }
}

function readExternalToken(token: string, cfg: RuntimeConfig): { sn: string; device_id: string; exp: number } | null {
  if (!token) return null;
  try {
    const payload = sm4Decrypt(token, cfg) as Record<string, unknown>;
    const exp = Number(payload.exp || 0);
    if (exp < nowSec()) return null;
    return { sn: normalizeCode(payload.sn), device_id: normalizeCode(payload.device_id), exp };
  } catch {
    return null;
  }
}

async function sha256Hex(input: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input))));
}

function randomCode(prefix = "SN") {
  const p = String(prefix || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const randomPart = randomHex(16).toUpperCase();
  return `${(p + randomPart).slice(0, 4).padEnd(4, "A")}-${randomPart.slice(4, 8).padEnd(4, "B")}`;
}

async function ensureSeedCode(db: D1Database, seedCode: string, expiresInDays: number, maxUses: number) {
  const existing = await db.prepare("SELECT code FROM activation_codes WHERE code = ? LIMIT 1").bind(seedCode).first<{ code: string }>();
  if (existing) return;
  const now = nowSec();
  await db.prepare("INSERT INTO activation_codes (code, status, created_at, expires_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at) VALUES (?, 'active', ?, ?, ?, 0, NULL, 'seed', 'system seed code', 1, ?)").bind(seedCode, now, now + expiresInDays * 86400, maxUses, now).run();
}

function formatCodeRow(row: ActivationCodeRow) {
  return {
    code: row.code,
    status: row.status,
    createdAt: Number(row.created_at || 0),
    expiresAt: Number(row.expires_at || 0),
    maxUses: Number(row.max_uses || 0),
    usedCount: Number(row.used_count || 0),
    lastUsedAt: row.last_used_at ? Number(row.last_used_at) : null,
    issuedTo: String(row.issued_to || ""),
    note: String(row.note || ""),
    deviceLimit: Math.max(1, Number(row.device_limit || 1)),
  };
}

async function createCodes(
  db: D1Database,
  p: { count: number; expiresInDays: number; maxUses: number; prefix: string; issuedTo: string; note: string; deviceLimit: number },
) {
  const c = Math.max(1, Math.min(200, Number(p.count || 1)));
  const days = Math.max(1, Math.min(3650, Number(p.expiresInDays || 30)));
  const uses = Math.max(1, Math.min(1000000, Number(p.maxUses || 1)));
  const dl = Math.max(1, Math.min(20, Number(p.deviceLimit || 1)));
  const now = nowSec();
  const created: ActivationCodeRow[] = [];

  for (let i = 0; i < c; i += 1) {
    let code = randomCode(p.prefix);
    for (let x = 0; x < 5; x += 1) {
      const found = await db.prepare("SELECT code FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<{ code: string }>();
      if (!found) break;
      code = randomCode(p.prefix);
    }

    await db.prepare("INSERT INTO activation_codes (code, status, created_at, expires_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at) VALUES (?, 'active', ?, ?, ?, 0, NULL, ?, ?, ?, ?)").bind(code, now, now + days * 86400, uses, p.issuedTo, p.note, dl, now).run();
    created.push({ code, status: "active", created_at: now, expires_at: now + days * 86400, max_uses: uses, used_count: 0, last_used_at: null, issued_to: p.issuedTo, note: p.note, device_limit: dl, updated_at: now });
  }

  return created.map(formatCodeRow);
}

async function listCodesPage(db: D1Database, p: { page: number; pageSize: number; status: string; keyword: string }) {
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
    whereSql.push("(UPPER(code) LIKE ? OR UPPER(issued_to) LIKE ? OR UPPER(note) LIKE ?)");
    binds.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const where = whereSql.length ? `WHERE ${whereSql.join(" AND ")}` : "";

  const total = Number((await db.prepare(`SELECT COUNT(1) as total FROM activation_codes ${where}`).bind(...binds).first<{ total: number }>())?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;

  const rows = await db.prepare(`SELECT code, status, created_at, expires_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...binds, pageSize, offset).all<ActivationCodeRow>();
  const data = (rows.results || []).map(formatCodeRow);

  for (const item of data) {
    (item as Record<string, unknown>).deviceCount = Number((await db.prepare("SELECT COUNT(1) as c FROM activation_code_devices WHERE code = ?").bind(item.code).first<{ c: number }>())?.c || 0);
  }

  return { data, pagination: { page: currentPage, pageSize, total, totalPages } };
}

async function disableCode(db: D1Database, code: string) {
  return Number((await db.prepare("UPDATE activation_codes SET status = 'disabled', updated_at = ? WHERE code = ?").bind(nowSec(), code).run()).meta?.changes || 0) > 0;
}

async function renewCode(db: D1Database, code: string, p: { addDays: number; addUses: number; reactivate: boolean }) {
  const record = await db.prepare("SELECT code, status, created_at, expires_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
  if (!record) return { ok: false, msg: "activation code not found" };

  const days = Math.max(0, Number(p.addDays || 0));
  const uses = Math.max(0, Number(p.addUses || 0));
  if (days <= 0 && uses <= 0 && !p.reactivate) return { ok: false, msg: "nothing to renew" };

  const now = nowSec();
  const nextExpire = days > 0 ? Math.max(now, Number(record.expires_at || 0)) + days * 86400 : Number(record.expires_at || 0);
  const nextUses = uses > 0 ? Number(record.max_uses || 0) + uses : Number(record.max_uses || 0);
  const nextStatus = p.reactivate ? "active" : String(record.status || "active");

  await db.prepare("UPDATE activation_codes SET expires_at = ?, max_uses = ?, status = ?, updated_at = ? WHERE code = ?").bind(nextExpire, nextUses, nextStatus, now, code).run();
  const fresh = await db.prepare("SELECT code, status, created_at, expires_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
  return { ok: true, data: fresh ? formatCodeRow(fresh) : null };
}

async function getCodeUsages(db: D1Database, code: string) {
  const found = await db.prepare("SELECT code FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first();
  if (!found) return { ok: false, msg: "activation code not found" };

  const rows = await db.prepare("SELECT device_id, device_name, app_version, client_ip, user_agent, first_seen_at, last_seen_at, use_count FROM activation_code_devices WHERE code = ? ORDER BY last_seen_at DESC").bind(code).all<{ device_id: string; device_name: string; app_version: string; client_ip: string; user_agent: string; first_seen_at: number; last_seen_at: number; use_count: number }>();
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
    })),
  };
}

async function validateAndConsumeCode(db: D1Database, code: string, usage: { deviceId: string; deviceName: string; appVersion: string; clientIp: string; userAgent: string }) {
  const record = await db.prepare("SELECT code, status, created_at, expires_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
  if (!record) return { ok: false as const, msg: "invalid activation code" };

  const now = nowSec();
  if (record.status !== "active") return { ok: false as const, msg: "activation code disabled" };
  if (Number(record.expires_at || 0) < now) return { ok: false as const, msg: "activation code expired" };
  if (Number(record.used_count || 0) >= Number(record.max_uses || 0)) return { ok: false as const, msg: "activation code usage limit reached" };

  const currentDeviceId = normalizeCode(usage.deviceId || "UNKNOWN");
  const existingDevice = await db.prepare("SELECT device_id FROM activation_code_devices WHERE code = ? AND device_id = ? LIMIT 1").bind(code, currentDeviceId).first();
  if (existingDevice) return { ok: false as const, msg: "activation code already used on this device" };

  const deviceCount = Number((await db.prepare("SELECT COUNT(1) as c FROM activation_code_devices WHERE code = ?").bind(code).first<{ c: number }>())?.c || 0);
  const deviceLimit = Math.max(1, Number(record.device_limit || 1));
  if (deviceCount >= deviceLimit) return { ok: false as const, msg: "activation code bound to another device" };

  const updated = await db.prepare("UPDATE activation_codes SET used_count = used_count + 1, last_used_at = ?, updated_at = ? WHERE code = ? AND status = 'active' AND expires_at >= ? AND used_count < max_uses").bind(now, now, code, now).run();
  if (Number(updated.meta?.changes || 0) <= 0) return { ok: false as const, msg: "activation code usage limit reached" };

  await db.prepare("INSERT INTO activation_code_devices (code, device_id, device_name, app_version, client_ip, user_agent, first_seen_at, last_seen_at, use_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)").bind(code, currentDeviceId, String(usage.deviceName || ""), String(usage.appVersion || ""), String(usage.clientIp || ""), String(usage.userAgent || ""), now, now).run();

  const fresh = await db.prepare("SELECT code, status, created_at, expires_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
  if (!fresh) return { ok: false as const, msg: "activation code update failed" };
  return { ok: true as const, record: fresh, deviceCount: deviceCount + 1 };
}

function parseStrategyCode(code: string): StrategyConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch {
    throw new Error("Cloudflare runtime does not execute dynamic JS; please submit JSON strategy config");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("strategy config must be JSON object");
  return normalizeStrategyConfig(parsed as Partial<StrategyConfig>);
}

function normalizeStrategyConfig(input: Partial<StrategyConfig>): StrategyConfig {
  return {
    mode: "recent_unique",
    take: Math.max(1, Math.min(28, Number(input.take || DEFAULT_STRATEGY.take))),
    min: Math.max(0, Math.min(27, Number(input.min ?? DEFAULT_STRATEGY.min))),
    max: Math.max(0, Math.min(27, Number(input.max ?? DEFAULT_STRATEGY.max))),
    multiple: Math.max(1, Math.min(1000, Math.floor(Number(input.multiple || DEFAULT_STRATEGY.multiple)))),
  };
}

async function loadStrategyStore(db: D1Database) {
  const row = await db.prepare("SELECT strategy_type, strategy_config, code, updated_at, updated_by FROM strategy_store WHERE id = 1 LIMIT 1").first<{ strategy_type: string; strategy_config: string; code: string; updated_at: number; updated_by: string }>();
  if (!row) {
    return { code: JSON.stringify(DEFAULT_STRATEGY), strategyType: "default", strategyConfig: DEFAULT_STRATEGY, updatedAt: nowSec(), updatedBy: "system" };
  }

  let cfg = DEFAULT_STRATEGY;
  try {
    cfg = normalizeStrategyConfig(JSON.parse(String(row.strategy_config || "{}")) as StrategyConfig);
  } catch {
    cfg = DEFAULT_STRATEGY;
  }

  return {
    code: String(row.code || ""),
    strategyType: String(row.strategy_type || "default"),
    strategyConfig: cfg,
    updatedAt: Number(row.updated_at || nowSec()),
    updatedBy: String(row.updated_by || "unknown"),
  };
}

async function saveStrategy(db: D1Database, p: { code: string; strategyType: string; strategyConfig: StrategyConfig; updatedBy: string }) {
  const now = nowSec();
  await db.prepare("INSERT INTO strategy_store (id, strategy_type, strategy_config, code, updated_at, updated_by) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET strategy_type = excluded.strategy_type, strategy_config = excluded.strategy_config, code = excluded.code, updated_at = excluded.updated_at, updated_by = excluded.updated_by").bind(p.strategyType, JSON.stringify(p.strategyConfig), p.code, now, p.updatedBy).run();
  return { code: p.code, strategyType: p.strategyType, strategyConfig: p.strategyConfig, updatedAt: now, updatedBy: p.updatedBy };
}

async function executeStrategy(db: D1Database, payload: StrategyPayload) {
  return executeStrategyWithConfig((await loadStrategyStore(db)).strategyConfig, payload);
}

function executeStrategyWithConfig(config: StrategyConfig, payload: StrategyPayload) {
  const numberList = Array.isArray(payload.number_list) ? payload.number_list : [];
  const seen = new Set<number>();
  const picked: number[] = [];

  for (const n of numberList) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < config.min || v > config.max) continue;
    if (!seen.has(v)) {
      seen.add(v);
      picked.push(v);
    }
    if (picked.length >= config.take) break;
  }

  for (let i = config.min; picked.length < config.take && i <= config.max; i += 1) {
    if (!seen.has(i)) picked.push(i);
  }

  if (!picked.length) throw new Error("strategy result.numbers has no valid values");
  return {
    period: Number(payload.period || 0),
    numbers: picked,
    multiple: Math.max(1, Math.floor(Number(config.multiple || 1))),
  };
}

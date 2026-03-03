import { sm4 } from "sm-crypto";
import { renderAdminPage, renderLoginPage } from "./renderHtml";

type Json = Record<string, unknown>;
type StrategyPayload = { period?: number; history?: unknown[]; number_list?: unknown[]; token_sn?: string; device?: Record<string, unknown> };
type InternalStrategyConfig = {
  take: number;
  min: number;
  max: number;
  multiple: number;
  lookback: number;
};
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
  card_type: string;
  duration_sec: number;
  activated_at: number | null;
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
const INTERNAL_STRATEGY: InternalStrategyConfig = { take: 6, min: 0, max: 27, multiple: 1, lookback: 50 };
let cachedCfg: { key: string; value: RuntimeConfig } | null = null;
let bootstrapDone = false;

const CARD_TYPE_SECONDS: Record<string, number> = {
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
  trial: 24 * 3600,
  trial3h: 3 * 3600,
  permanent: 0,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const cfg = await getConfig(env);
      await bootstrapIfNeeded(env, cfg);
      await cleanupExpiredCodes(env.DB);
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const pathname = url.pathname;

      if (method === "GET" && pathname === "/admin/login") {
        return new Response(renderLoginPage(), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (method === "GET" && pathname === "/admin") {
        return new Response(renderAdminPage(), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      if (method === "POST" && pathname === "/api/verify") {
        const parsed = await parseRequestBody(request);
        const guard = await signGuard(request, env, cfg, parsed.rawBody);
        if (guard) return guard;
        const body = parsed.body;
        const sn = normalizeCode(body.sn);
        if (!sn) return json(400, { code: 400, msg: "sn is required" });
        if (!/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/.test(sn)) {
          return json(400, { code: 400, msg: "sn must be XXXX-XXXX-XXXX-XXXX (uppercase letters/digits)" });
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
            cardType: String(validated.record.card_type || "month"),
            activatedAt: validated.record.activated_at ? Number(validated.record.activated_at) : null,
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
        const activeCheck = await checkCodeAvailableForScheme(env.DB, payload.sn, normalizeCode(usage.deviceId || "UNKNOWN"));
        if (!activeCheck.ok) {
          return json(401, { code: 401, msg: activeCheck.msg });
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

          const strategy = executeInternalStrategy({
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
        return json(200, { code: 200, msg: "ok" }, { "Set-Cookie": makeSessionCookie("admin_session", sid, cfg.tokenTtlSec, isHttpsRequest(request)) });
      }

      if (method === "POST" && pathname === "/web/logout") {
        const sid = readCookie(request.headers.get("cookie") || "", "admin_session");
        if (sid) await env.DB.prepare("DELETE FROM admin_sessions WHERE sid = ?").bind(sid).run();
        return json(200, { code: 200, msg: "ok" }, { "Set-Cookie": clearSessionCookie("admin_session", isHttpsRequest(request)) });
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
        const cardSpec = resolveCardSpec(body.cardType);
        const created = await createCodes(env.DB, {
          count: Number(body.count || 1),
          cardType: cardSpec.type,
          durationSec: cardSpec.durationSec,
          maxUses: Number(body.maxUses || 1),
          deviceLimit: Number(body.deviceLimit || 1),
          prefix: String(body.prefix || "SN"),
          issuedTo: String(body.issuedTo || ""),
          note: String(body.note || ""),
        });
        return json(200, { code: 200, msg: "ok", data: created });
      }

      if (method === "POST" && pathname === "/admin/activation-codes/batch-disable") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const { body } = await parseRequestBody(request);
        const codes = extractCodesFromBody(body);
        if (!codes.length) return json(400, { code: 400, msg: "codes is required" });
        const result = await batchDisableCodes(env.DB, codes);
        return json(200, { code: 200, msg: "ok", data: result });
      }

      if (method === "POST" && pathname === "/admin/activation-codes/batch-renew") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const { body } = await parseRequestBody(request);
        const codes = extractCodesFromBody(body);
        if (!codes.length) return json(400, { code: 400, msg: "codes is required" });
        const result = await batchRenewCodes(env.DB, codes, {
          addDays: Number(body.addDays || 0),
          addUses: Number(body.addUses || 0),
          reactivate: body.reactivate === undefined ? true : Boolean(body.reactivate),
        });
        if (!result.ok) return json(400, { code: 400, msg: result.msg });
        return json(200, { code: 200, msg: "ok", data: result.data });
      }

      if (method === "POST" && pathname === "/admin/activation-codes/batch-delete") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const { body } = await parseRequestBody(request);
        const codes = extractCodesFromBody(body);
        if (!codes.length) return json(400, { code: 400, msg: "codes is required" });
        const result = await batchDeleteCodes(env.DB, codes);
        return json(200, { code: 200, msg: "ok", data: result });
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

      if (method === "GET" && pathname === "/admin/devices/tree") {
        const admin = await requireAdmin(request, env);
        if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
        const keyword = String(url.searchParams.get("keyword") || "");
        const data = await listDeviceTree(env.DB, keyword);
        return json(200, { code: 200, msg: "ok", data });
      }

      return json(404, { code: 404, msg: "not found" });
    } catch (err) {
      return json(500, { code: 500, msg: `internal error: ${err instanceof Error ? err.message : String(err)}` });
    }
  },
} satisfies ExportedHandler<Env>;

function nowSec() { return Math.floor(Date.now() / 1000); }
function normalizeCardType(input: unknown): string {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "month";
  if (["day", "d", "天卡", "日卡", "1天", "1d"].includes(raw)) return "day";
  if (["week", "w", "周卡", "7天", "7d"].includes(raw)) return "week";
  if (["month", "m", "月卡", "30天", "30d"].includes(raw)) return "month";
  if (["permanent", "forever", "lifetime", "永久", "永久卡"].includes(raw)) return "permanent";
  if (["trial", "体验", "体验卡"].includes(raw)) return "trial";
  if (["trial3h", "trial_3h", "3h", "体验卡3小时", "体验3小时"].includes(raw)) return "trial3h";
  return "month";
}
function resolveCardSpec(input: unknown): { type: string; durationSec: number } {
  const type = normalizeCardType(input);
  return { type, durationSec: Number(CARD_TYPE_SECONDS[type] || CARD_TYPE_SECONDS.month) };
}
function computeExpireAt(type: string, activatedAt: number | null, durationSec: number): number {
  if (type === "permanent") return 0;
  if (!activatedAt) return 0;
  const d = Math.max(0, Number(durationSec || 0));
  return activatedAt + d;
}
function isCodeExpired(row: Pick<ActivationCodeRow, "card_type" | "expires_at" | "activated_at">, now: number) {
  if (String(row.card_type || "") === "permanent") return false;
  if (!Number(row.activated_at || 0)) return false;
  const exp = Number(row.expires_at || 0);
  return exp > 0 && exp < now;
}
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
function makeSessionCookie(name: string, value: string, maxAge: number, secure: boolean) {
  const securePart = secure ? "; Secure" : "";
  return `${name}=${value}; HttpOnly${securePart}; SameSite=Lax; Path=/; Max-Age=${Math.max(1, Math.floor(maxAge))}`;
}
function clearSessionCookie(name: string, secure: boolean) {
  const securePart = secure ? "; Secure" : "";
  return `${name}=; HttpOnly${securePart}; SameSite=Lax; Path=/; Max-Age=0`;
}
function isHttpsRequest(request: Request) {
  const xfProto = (request.headers.get("x-forwarded-proto") || "").toLowerCase();
  if (xfProto) return xfProto === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
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

async function cleanupExpiredCodes(db: D1Database) {
  const now = nowSec();
  await db.prepare(
    "DELETE FROM activation_codes WHERE card_type != 'permanent' AND activated_at IS NOT NULL AND expires_at > 0 AND expires_at < ?",
  ).bind(now).run();
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
  const randomPart = randomHex(32).toUpperCase();
  const merged = (p + randomPart).slice(0, 16).padEnd(16, "A");
  return `${merged.slice(0, 4)}-${merged.slice(4, 8)}-${merged.slice(8, 12)}-${merged.slice(12, 16)}`;
}

function parseCodeList(raw: unknown) {
  let source: unknown[] = [];
  if (Array.isArray(raw)) {
    source = raw;
  } else if (typeof raw === "string") {
    source = raw.split(/[\s,;\n\r]+/).filter(Boolean);
  } else if (raw !== null && raw !== undefined) {
    source = [raw];
  }
  return [...new Set(source.map((x) => normalizeCode(x)).filter((x) => isActivationCodeLike(x)))];
}

function extractCodesFromBody(body: Json) {
  const data = body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  const candidates: unknown[] = [
    body.codes,
    body.code,
    body.activationCodes,
    body.activationCode,
    body.sn,
    data?.codes,
    data?.code,
    data?.activationCodes,
    data?.activationCode,
    data?.sn,
  ];
  for (const item of candidates) {
    const parsed = parseCodeList(item);
    if (parsed.length) return parsed;
  }
  return [];
}

function isActivationCodeLike(code: string) {
  // Backward compatibility:
  // - legacy style: XXXX-XXXX
  // - current style: XXXX-XXXX-XXXX-XXXX
  return /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,3}$/.test(code);
}

async function ensureSeedCode(db: D1Database, seedCode: string, expiresInDays: number, maxUses: number) {
  const existing = await db.prepare("SELECT code FROM activation_codes WHERE code = ? LIMIT 1").bind(seedCode).first<{ code: string }>();
  if (existing) return;
  const now = nowSec();
  const durationSec = Math.max(1, Number(expiresInDays || 365)) * 86400;
  await db.prepare(
    "INSERT INTO activation_codes (code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at) VALUES (?, 'active', ?, 0, 'month', ?, NULL, ?, 0, NULL, 'seed', 'system seed code', 1, ?)",
  ).bind(seedCode, now, durationSec, maxUses, now).run();
}

function formatCodeRow(row: ActivationCodeRow) {
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

async function createCodes(
  db: D1Database,
  p: { count: number; cardType: string; durationSec: number; maxUses: number; prefix: string; issuedTo: string; note: string; deviceLimit: number },
) {
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
      const found = await db.prepare("SELECT code FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<{ code: string }>();
      if (!found) break;
      code = randomCode(p.prefix);
    }

    await db.prepare(
      "INSERT INTO activation_codes (code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at) VALUES (?, 'active', ?, 0, ?, ?, NULL, ?, 0, NULL, ?, ?, ?, ?)",
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

  const total = Number((await db.prepare(`SELECT COUNT(1) as total FROM activation_codes ${where}`).bind(...binds).first<{ total: number }>())?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * pageSize;

  const rows = await db.prepare(`SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...binds, pageSize, offset).all<ActivationCodeRow>();
  const data = (rows.results || []).map(formatCodeRow);

  for (const item of data) {
    (item as Record<string, unknown>).deviceCount = Number((await db.prepare("SELECT COUNT(1) as c FROM activation_code_devices WHERE code = ?").bind(item.code).first<{ c: number }>())?.c || 0);
  }

  return { data, pagination: { page: currentPage, pageSize, total, totalPages } };
}

async function disableCode(db: D1Database, code: string) {
  return Number((await db.prepare("UPDATE activation_codes SET status = 'disabled', updated_at = ? WHERE code = ?").bind(nowSec(), code).run()).meta?.changes || 0) > 0;
}

async function batchDisableCodes(db: D1Database, codes: string[]) {
  const now = nowSec();
  let affected = 0;
  for (const code of codes) {
    const changed = Number((await db.prepare("UPDATE activation_codes SET status = 'disabled', updated_at = ? WHERE code = ?").bind(now, code).run()).meta?.changes || 0);
    affected += changed;
  }
  return { requested: codes.length, affected };
}

async function renewCode(db: D1Database, code: string, p: { addDays: number; addUses: number; reactivate: boolean }) {
  const record = await db.prepare("SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
  if (!record) return { ok: false, msg: "activation code not found" };

  const days = Math.max(0, Number(p.addDays || 0));
  const uses = Math.max(0, Number(p.addUses || 0));
  if (days <= 0 && uses <= 0 && !p.reactivate) return { ok: false, msg: "nothing to renew" };

  const now = nowSec();
  const extraSec = days * 86400;
  const currentDuration = Math.max(0, Number(record.duration_sec || 0));
  const nextDuration = String(record.card_type || "month") === "permanent" ? 0 : (currentDuration + extraSec);
  const nextExpire = computeExpireAt(String(record.card_type || "month"), Number(record.activated_at || 0) || null, nextDuration);
  const nextUses = uses > 0 ? Number(record.max_uses || 0) + uses : Number(record.max_uses || 0);
  const nextStatus = p.reactivate ? "active" : String(record.status || "active");

  await db.prepare("UPDATE activation_codes SET expires_at = ?, duration_sec = ?, max_uses = ?, status = ?, updated_at = ? WHERE code = ?").bind(nextExpire, nextDuration, nextUses, nextStatus, now, code).run();
  const fresh = await db.prepare("SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
  return { ok: true, data: fresh ? formatCodeRow(fresh) : null };
}

async function batchRenewCodes(db: D1Database, codes: string[], p: { addDays: number; addUses: number; reactivate: boolean }) {
  const days = Math.max(0, Number(p.addDays || 0));
  const uses = Math.max(0, Number(p.addUses || 0));
  if (days <= 0 && uses <= 0 && !p.reactivate) return { ok: false as const, msg: "nothing to renew" };
  const now = nowSec();
  const data: Array<ReturnType<typeof formatCodeRow>> = [];
  let affected = 0;

  for (const code of codes) {
    const record = await db.prepare("SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
    if (!record) continue;
    const extraSec = days * 86400;
    const currentDuration = Math.max(0, Number(record.duration_sec || 0));
    const nextDuration = String(record.card_type || "month") === "permanent" ? 0 : (currentDuration + extraSec);
    const nextExpire = computeExpireAt(String(record.card_type || "month"), Number(record.activated_at || 0) || null, nextDuration);
    const nextUses = uses > 0 ? Number(record.max_uses || 0) + uses : Number(record.max_uses || 0);
    const nextStatus = p.reactivate ? "active" : String(record.status || "active");
    const changed = Number((await db.prepare("UPDATE activation_codes SET expires_at = ?, duration_sec = ?, max_uses = ?, status = ?, updated_at = ? WHERE code = ?").bind(nextExpire, nextDuration, nextUses, nextStatus, now, code).run()).meta?.changes || 0);
    affected += changed;
    if (changed > 0) {
      const fresh = await db.prepare("SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
      if (fresh) data.push(formatCodeRow(fresh));
    }
  }

  return { ok: true as const, data: { requested: codes.length, affected, items: data } };
}

async function batchDeleteCodes(db: D1Database, codes: string[]) {
  let affected = 0;
  for (const code of codes) {
    const changed = Number((await db.prepare("DELETE FROM activation_codes WHERE code = ?").bind(code).run()).meta?.changes || 0);
    affected += changed;
  }
  return { requested: codes.length, affected };
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

async function listDeviceTree(db: D1Database, keywordRaw: string) {
  const keyword = String(keywordRaw || "").trim().toUpperCase();
  const where = keyword ? "WHERE (UPPER(d.device_id) LIKE ? OR UPPER(d.device_name) LIKE ? OR UPPER(d.code) LIKE ?)" : "";
  const binds: string[] = keyword ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`] : [];
  const rows = await db.prepare(
    `SELECT
      d.device_id,
      d.device_name,
      d.code,
      d.use_count,
      d.last_seen_at,
      c.status,
      c.expires_at,
      c.max_uses,
      c.used_count
    FROM activation_code_devices d
    INNER JOIN activation_codes c ON c.code = d.code
    ${where}
    ORDER BY d.device_id ASC, d.last_seen_at DESC`,
  ).bind(...binds).all<{
    device_id: string;
    device_name: string;
    code: string;
    use_count: number;
    last_seen_at: number;
    status: string;
    expires_at: number;
    max_uses: number;
    used_count: number;
  }>();

  const deviceMap = new Map<string, {
    deviceId: string;
    deviceName: string;
    totalUses: number;
    codeCount: number;
    lastSeenAt: number;
    children: Array<{ code: string; status: string; expiresAt: number; maxUses: number; usedCount: number; useCount: number; lastSeenAt: number }>;
  }>();
  for (const row of rows.results || []) {
    const key = normalizeCode(row.device_id || "UNKNOWN");
    if (!deviceMap.has(key)) {
      deviceMap.set(key, {
        deviceId: key,
        deviceName: String(row.device_name || ""),
        totalUses: 0,
        codeCount: 0,
        lastSeenAt: 0,
        children: [],
      });
    }
    const node = deviceMap.get(key)!;
    node.totalUses += Number(row.use_count || 0);
    node.codeCount += 1;
    node.lastSeenAt = Math.max(node.lastSeenAt, Number(row.last_seen_at || 0));
    node.children.push({
      code: String(row.code || ""),
      status: String(row.status || ""),
      expiresAt: Number(row.expires_at || 0),
      maxUses: Number(row.max_uses || 0),
      usedCount: Number(row.used_count || 0),
      useCount: Number(row.use_count || 0),
      lastSeenAt: Number(row.last_seen_at || 0),
    });
  }
  return [...deviceMap.values()];
}

async function validateAndConsumeCode(db: D1Database, code: string, usage: { deviceId: string; deviceName: string; appVersion: string; clientIp: string; userAgent: string }) {
  const record = await db.prepare("SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
  if (!record) return { ok: false as const, msg: "invalid activation code" };

  const now = nowSec();
  if (record.status !== "active") return { ok: false as const, msg: "activation code disabled" };
  if (isCodeExpired(record, now)) {
    await db.prepare("DELETE FROM activation_codes WHERE code = ?").bind(code).run();
    return { ok: false as const, msg: "activation code expired" };
  }
  if (Number(record.used_count || 0) >= Number(record.max_uses || 0)) return { ok: false as const, msg: "activation code usage limit reached" };

  const currentDeviceId = normalizeCode(usage.deviceId || "UNKNOWN");
  const existingDevice = await db.prepare("SELECT device_id FROM activation_code_devices WHERE code = ? AND device_id = ? LIMIT 1").bind(code, currentDeviceId).first();
  if (existingDevice) return { ok: false as const, msg: "activation code already used on this device" };

  const deviceCount = Number((await db.prepare("SELECT COUNT(1) as c FROM activation_code_devices WHERE code = ?").bind(code).first<{ c: number }>())?.c || 0);
  const deviceLimit = Math.max(1, Number(record.device_limit || 1));
  if (deviceCount >= deviceLimit) return { ok: false as const, msg: "activation code bound to another device" };

  const activatedAt = Number(record.activated_at || 0) || null;
  const baseDuration = Math.max(0, Number(record.duration_sec || CARD_TYPE_SECONDS.month));
  const computedExpireAt = computeExpireAt(String(record.card_type || "month"), activatedAt || now, baseDuration);
  const updated = await db.prepare(
    "UPDATE activation_codes SET used_count = used_count + 1, last_used_at = ?, updated_at = ?, activated_at = COALESCE(activated_at, ?), expires_at = CASE WHEN card_type = 'permanent' THEN 0 WHEN activated_at IS NULL THEN ? ELSE expires_at END WHERE code = ? AND status = 'active' AND used_count < max_uses AND (card_type = 'permanent' OR activated_at IS NULL OR expires_at >= ?)",
  ).bind(now, now, now, computedExpireAt, code, now).run();
  if (Number(updated.meta?.changes || 0) <= 0) return { ok: false as const, msg: "activation code usage limit reached" };

  await db.prepare("INSERT INTO activation_code_devices (code, device_id, device_name, app_version, client_ip, user_agent, first_seen_at, last_seen_at, use_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)").bind(code, currentDeviceId, String(usage.deviceName || ""), String(usage.appVersion || ""), String(usage.clientIp || ""), String(usage.userAgent || ""), now, now).run();

  const fresh = await db.prepare("SELECT code, status, created_at, expires_at, card_type, duration_sec, activated_at, max_uses, used_count, last_used_at, issued_to, note, device_limit, updated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<ActivationCodeRow>();
  if (!fresh) return { ok: false as const, msg: "activation code update failed" };
  return { ok: true as const, record: fresh, deviceCount: deviceCount + 1 };
}

async function checkCodeAvailableForScheme(db: D1Database, code: string, deviceId: string) {
  const record = await db.prepare("SELECT code, status, expires_at, card_type, activated_at FROM activation_codes WHERE code = ? LIMIT 1").bind(code).first<{ code: string; status: string; expires_at: number; card_type: string; activated_at: number | null }>();
  if (!record) return { ok: false as const, msg: "activation code not found" };
  const now = nowSec();
  if (record.status !== "active") return { ok: false as const, msg: "activation code disabled" };
  if (isCodeExpired({ card_type: record.card_type, expires_at: record.expires_at, activated_at: record.activated_at }, now)) {
    await db.prepare("DELETE FROM activation_codes WHERE code = ?").bind(code).run();
    return { ok: false as const, msg: "activation code expired" };
  }

  const binding = await db.prepare("SELECT device_id FROM activation_code_devices WHERE code = ? AND device_id = ? LIMIT 1").bind(code, normalizeCode(deviceId)).first();
  if (!binding) return { ok: false as const, msg: "activation code device binding invalid" };
  return { ok: true as const };
}

function executeInternalStrategy(payload: StrategyPayload) {
  const config = INTERNAL_STRATEGY;
  type Color = "red" | "blue" | "green";
  const MAPPING: Record<number, Color> = {
    0: "blue", 1: "red", 2: "red", 3: "blue", 4: "red", 5: "red", 6: "red", 7: "red", 8: "red", 9: "red",
    10: "red", 11: "blue", 12: "red", 13: "red", 14: "red", 15: "blue", 16: "red", 17: "red", 18: "red", 19: "red",
    20: "blue", 21: "red", 22: "green", 23: "blue", 24: "blue", 25: "red", 26: "red", 27: "red", 28: "red", 29: "red",
    30: "red", 31: "red", 32: "blue", 33: "red", 34: "red", 35: "red", 36: "blue", 37: "blue", 38: "red", 39: "red",
    40: "blue", 41: "red", 42: "red", 43: "blue", 44: "blue", 45: "red", 46: "red", 47: "blue", 48: "red", 49: "red",
    50: "blue", 51: "blue", 52: "red", 53: "red", 54: "blue", 55: "red", 56: "red", 57: "red", 58: "green", 59: "blue",
    60: "red", 61: "red", 62: "red", 63: "red", 64: "red", 65: "red", 66: "red", 67: "red", 68: "red", 69: "blue",
    70: "red", 71: "red", 72: "red", 73: "red", 74: "red", 75: "red", 76: "blue", 77: "red", 78: "red", 79: "blue",
    80: "blue", 81: "blue", 82: "red", 83: "red", 84: "blue", 85: "blue", 86: "green", 87: "red", 88: "red", 89: "blue",
    90: "red", 91: "blue", 92: "red", 93: "red", 94: "green"
  };
  const blue = [3, 4, 9, 10, 14, 15, 20, 25, 26]
  const green = [5, 6, 11, 16, 17, 21, 22, 27]
  const red = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24]
  const NUMBERS_BY_COLOR: Record<Color, number[]> = { red, blue, green };
  const num = Number(payload.period || 0)
  const remainder = ((num % 95) + 95) % 95
  const predictedColor: Color = MAPPING[remainder] || "red";
  const use = NUMBERS_BY_COLOR[predictedColor] || red;

  return {
    period: Number(payload.period || 0),
    numbers: use,
    multiple: 1,
  };
}

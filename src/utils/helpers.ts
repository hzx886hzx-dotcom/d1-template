import type { Json, UsageContext, CardSpec } from "../types/index";

export const CARD_TYPE_SECONDS: Record<string, number> = {
  day: 86400,
  week: 7 * 86400,
  month: 30 * 86400,
  trial: 24 * 3600,
  trial3h: 3 * 3600,
  permanent: 0,
};

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function normalizeCardType(input: unknown): string {
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

export function resolveCardSpec(input: unknown): CardSpec {
  const type = normalizeCardType(input);
  return { type, durationSec: Number(CARD_TYPE_SECONDS[type] || CARD_TYPE_SECONDS.month) };
}

export function computeExpireAt(type: string, activatedAt: number | null, durationSec: number): number {
  if (type === "permanent") return 0;
  if (!activatedAt) return 0;
  const d = Math.max(0, Number(durationSec || 0));
  return activatedAt + d;
}

export function isCodeExpired(
  row: { card_type?: string; expires_at?: number; activated_at?: number | null },
  now: number
): boolean {
  if (String(row.card_type || "") === "permanent") return false;
  if (!Number(row.activated_at || 0)) return false;
  const exp = Number(row.expires_at || 0);
  return exp > 0 && exp < now;
}

export function json(status: number, payload: Json, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export async function parseRequestBody(request: Request): Promise<{ rawBody: string; body: Json }> {
  const rawBody = await request.text();
  if (!rawBody) return { rawBody: "", body: {} };
  try {
    return { rawBody, body: JSON.parse(rawBody) as Json };
  } catch {
    return { rawBody, body: {} };
  }
}

export function normalizeCode(input: unknown): string {
  return String(input || "").trim().toUpperCase();
}

export function randomHex(byteLen: number): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function makeSessionCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${name}=${value}; HttpOnly${securePart}; SameSite=Lax; Path=/; Max-Age=${Math.max(1, Math.floor(maxAge))}`;
}

export function clearSessionCookie(name: string, secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${name}=; HttpOnly${securePart}; SameSite=Lax; Path=/; Max-Age=0`;
}

export function isHttpsRequest(request: Request): boolean {
  const xfProto = (request.headers.get("x-forwarded-proto") || "").toLowerCase();
  if (xfProto) return xfProto === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

export function readCookie(rawCookie: string, key: string): string {
  for (const part of rawCookie.split(";").map((x) => x.trim())) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === key) return part.slice(i + 1).trim();
  }
  return "";
}

export function buildUsageContext(request: Request, body: Record<string, unknown>): UsageContext {
  const dev = (body.device || {}) as Record<string, unknown>;
  return {
    deviceId: String(request.headers.get("x-device-id") || dev.device_id || dev.deviceId || "UNKNOWN"),
    deviceName: String(request.headers.get("x-device-name") || dev.device_name || dev.deviceName || ""),
    appVersion: String(request.headers.get("x-app-version") || dev.app_version || dev.appVersion || ""),
    clientIp: String(request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || ""),
    userAgent: String(request.headers.get("user-agent") || ""),
  };
}

export function randomCode(prefix = "SN"): string {
  const p = String(prefix || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const randomPart = randomHex(32).toUpperCase();
  const merged = (p + randomPart).slice(0, 16).padEnd(16, "A");
  return `${merged.slice(0, 4)}-${merged.slice(4, 8)}-${merged.slice(8, 12)}-${merged.slice(12, 16)}`;
}

export function parseCodeList(raw: unknown): string[] {
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

export function extractCodesFromBody(body: Json): string[] {
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

export function isActivationCodeLike(code: string): boolean {
  return /^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,3}$/.test(code);
}

export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input))));
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0) throw new Error("invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

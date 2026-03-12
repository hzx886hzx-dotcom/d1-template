import { sm4 } from "sm-crypto";
import type { RuntimeConfig, ExternalTokenPayload } from "../types";
import { toHex, bytesToBase64, base64ToBytes, hexToBytes, sha256Hex } from "../utils/helpers";

const encoder = new TextEncoder();

export async function fixedKey(raw: string, length: number): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(raw))).slice(0, length);
}

export async function getConfig(env: {
  SN_SIGN_FIXED?: string;
  SN_AES_KEY?: string;
  SN_AES_IV?: string;
  SN_SM4_KEY?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_HASH?: string;
  SEED_ACTIVATION_CODE?: string;
  SEED_CODE_EXPIRES_DAYS?: string;
  SEED_CODE_MAX_USES?: string;
  TOKEN_TTL_SEC?: string;
}): Promise<RuntimeConfig> {
  const cfgKey = [
    env.SN_SIGN_FIXED || "",
    env.SN_AES_KEY || "",
    env.SN_AES_IV || "",
    env.SN_SM4_KEY || "",
    env.ADMIN_USERNAME || "",
    env.ADMIN_PASSWORD || "",
    env.ADMIN_PASSWORD_HASH || "",
    env.SEED_ACTIVATION_CODE || "",
    env.SEED_CODE_EXPIRES_DAYS || "",
    env.SEED_CODE_MAX_USES || "",
    env.TOKEN_TTL_SEC || "",
  ].join("|");

  const cached = (globalThis as unknown as { __configCache?: { key: string; value: RuntimeConfig } }).__configCache;
  if (cached && cached.key === cfgKey) return cached.value;

  const aesKey = await fixedKey(String(env.SN_AES_KEY || "d3PpjjbIAJBJSdoY2_rgQ6P47sAXTDdanhOu0SCgxqA"), 32);
  const aesIv = await fixedKey(String(env.SN_AES_IV || "2oKVSzpdw7KpEYziAah6sg"), 16);
  const sm4Key = await fixedKey(String(env.SN_SM4_KEY || "-56LrICSuZ2iBLHHN5P705HFUIQ9dqVJ"), 16);

  const value: RuntimeConfig = {
    signFixed: String(env.SN_SIGN_FIXED || "bjx"),
    tokenTtlSec: Math.max(60, Number(env.TOKEN_TTL_SEC || 7200)),
    adminUsername: String(env.ADMIN_USERNAME || "superadmin"),
    adminPassword: String(env.ADMIN_PASSWORD || "Super@123456"),
    adminPasswordHash: String(env.ADMIN_PASSWORD_HASH || "").toLowerCase().trim(),
    seedActivationCode: String(env.SEED_ACTIVATION_CODE || "").trim().toUpperCase(),
    seedCodeExpiresInDays: Math.max(1, Number(env.SEED_CODE_EXPIRES_DAYS || 365)),
    seedCodeMaxUses: Math.max(1, Number(env.SEED_CODE_MAX_USES || 100000)),
    aesIv,
    aesCryptoKey: await crypto.subtle.importKey("raw", aesKey, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]),
    sm4KeyHex: toHex(sm4Key),
  };

  (globalThis as unknown as { __configCache?: { key: string; value: RuntimeConfig } }).__configCache = { key: cfgKey, value };
  return value;
}

export async function aesEncrypt(plainText: string, cfg: RuntimeConfig): Promise<string> {
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv: cfg.aesIv },
    cfg.aesCryptoKey,
    encoder.encode(plainText)
  );
  return bytesToBase64(new Uint8Array(encrypted));
}

export async function generateSign(rawBody: string, timestampSec: number, cfg: RuntimeConfig): Promise<string> {
  return aesEncrypt(`${rawBody}${timestampSec}${cfg.signFixed}`, cfg);
}

export function sm4Encrypt(data: unknown, cfg: RuntimeConfig): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return bytesToBase64(hexToBytes(sm4.encrypt(payload, cfg.sm4KeyHex, { padding: "pkcs#7" })));
}

export function sm4Decrypt(cipherText: string, cfg: RuntimeConfig): unknown {
  const plain = sm4.decrypt(toHex(base64ToBytes(cipherText)), cfg.sm4KeyHex, { padding: "pkcs#7" });
  try {
    return JSON.parse(plain);
  } catch {
    return plain;
  }
}

export function readExternalToken(token: string, cfg: RuntimeConfig): ExternalTokenPayload | null {
  if (!token) return null;
  try {
    const payload = sm4Decrypt(token, cfg) as Record<string, unknown>;
    const exp = Number(payload.exp || 0);
    return {
      sn: String(payload.sn || "").trim().toUpperCase(),
      device_id: String(payload.device_id || "").trim().toUpperCase(),
      exp,
    };
  } catch {
    return null;
  }
}

export async function verifyAdminCredential(
  username: string,
  password: string,
  cfg: RuntimeConfig
): Promise<boolean> {
  if (username !== cfg.adminUsername) return false;
  if (cfg.adminPasswordHash) return (await sha256Hex(password)) === cfg.adminPasswordHash;
  return password === cfg.adminPassword;
}

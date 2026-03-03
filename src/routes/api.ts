import { validateAndConsumeCode, cleanupExpiredCodes } from "../services/activationCode";
import { checkCodeAvailableForScheme, getDeviceStatus } from "../services/device";
import { sm4Encrypt, sm4Decrypt, readExternalToken } from "../services/crypto";
import { verifySign } from "../middleware/sign";
import { parseRequestBody, buildUsageContext, normalizeCode, json, nowSec } from "../utils/helpers";
import type { RuntimeConfig, StrategyPayload } from "../types";

const INTERNAL_STRATEGY = { take: 6, min: 0, max: 27, multiple: 1, lookback: 50 };

function executeInternalStrategy(payload: StrategyPayload) {
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
    90: "red", 91: "blue", 92: "red", 93: "red", 94: "green",
  };
  const blue = [3, 4, 9, 10, 14, 15, 20, 25, 26];
  const green = [5, 6, 11, 16, 17, 21, 22, 27];
  const red = [1, 2, 7, 8, 12, 13, 18, 19, 23, 24];
  const NUMBERS_BY_COLOR: Record<Color, number[]> = { red, blue, green };
  const num = Number(payload.period || 0);
  const remainder = ((num % 95) + 95) % 95;
  const predictedColor: Color = MAPPING[remainder] || "red";
  const use = NUMBERS_BY_COLOR[predictedColor] || red;

  return {
    period: Number(payload.period || 0),
    numbers: use,
    multiple: 1,
  };
}

export async function handleVerify(
  request: Request,
  db: D1Database,
  cfg: RuntimeConfig
): Promise<Response> {
  const parsed = await parseRequestBody(request);
  const guard = await verifySign(request, db, cfg, parsed.rawBody);
  if (guard) return guard;

  const body = parsed.body;
  const sn = normalizeCode(body.sn);
  if (!sn) return json(400, { code: 400, msg: "sn is required" });
  if (!/^[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/.test(sn)) {
    return json(400, { code: 400, msg: "sn must be XXXX-XXXX-XXXX-XXXX (uppercase letters/digits)" });
  }

  const usage = buildUsageContext(request, body);
  const validated = await validateAndConsumeCode(db, sn, usage);
  if (!validated.ok) return json(401, { code: 401, msg: validated.msg });

  const token = sm4Encrypt(
    {
      token_type: "external",
      sn,
      device_id: normalizeCode(usage.deviceId || "UNKNOWN"),
      iat: nowSec(),
      exp: nowSec() + cfg.tokenTtlSec,
    },
    cfg
  );

  return json(200, {
    code: 200,
    msg: "ok",
    data: token,
    activation: {
      sn: validated.record!.code,
      status: validated.record!.status,
      cardType: String(validated.record!.card_type || "month"),
      activatedAt: validated.record!.activated_at ? Number(validated.record!.activated_at) : null,
      expiresAt: validated.newExpiresAt || Number(validated.record!.expires_at || 0),
      maxUses: Number(validated.record!.max_uses || 0),
      usedCount: Number(validated.record!.used_count || 0),
      deviceCount: validated.deviceCount,
      deviceLimit: Number(validated.record!.device_limit || 1),
      tokenExpiresAt: nowSec() + cfg.tokenTtlSec,
      renewed: validated.renewed || false,
      previousExpiresAt: validated.previousExpiresAt,
    },
  });
}

export async function handleGetScheme(
  request: Request,
  db: D1Database,
  cfg: RuntimeConfig
): Promise<Response> {
  const parsed = await parseRequestBody(request);
  const guard = await verifySign(request, db, cfg, parsed.rawBody);
  if (guard) return guard;

  const payload = readExternalToken(request.headers.get("x-auth-token") || "", cfg);
  if (!payload) return json(401, { code: 401, msg: "invalid x-auth-token" });

  const body = parsed.body;
  const usage = buildUsageContext(request, body);
  if (normalizeCode(payload.device_id) !== normalizeCode(usage.deviceId || "UNKNOWN")) {
    return json(401, { code: 401, msg: "token device mismatch" });
  }

  const activeCheck = await checkCodeAvailableForScheme(db, payload.sn, normalizeCode(usage.deviceId || "UNKNOWN"));
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

    return json(200, {
      code: 200,
      msg: "ok",
      data: sm4Encrypt({ period, numbers: strategy.numbers, multiple: strategy.multiple }, cfg),
    });
  } catch (err) {
    return json(500, {
      code: 500,
      msg: `strategy execute failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

export { cleanupExpiredCodes };

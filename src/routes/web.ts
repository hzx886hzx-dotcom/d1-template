import { handleLogin, handleLogout, requireAdmin } from "../middleware/auth";
import { json } from "../utils/helpers";

export async function handleWebLogin(
  request: Request,
  db: D1Database,
  cfg: {
    tokenTtlSec: number;
    adminUsername: string;
    adminPassword: string;
    adminPasswordHash: string;
  },
  body: Record<string, unknown>
): Promise<Response> {
  return handleLogin(request, db, cfg as { tokenTtlSec: number; adminUsername: string; adminPassword: string; adminPasswordHash: string; signFixed: string; seedActivationCode: string; seedCodeExpiresInDays: number; seedCodeMaxUses: number; aesIv: Uint8Array; aesCryptoKey: CryptoKey; sm4KeyHex: string }, body);
}

export async function handleWebLogout(
  request: Request,
  db: D1Database
): Promise<Response> {
  return handleLogout(request, db);
}

export async function handleWebMe(request: Request, db: D1Database): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });
  return json(200, { code: 200, msg: "ok", data: { username: admin.username } });
}

export async function handleWebScheme(request: Request, db: D1Database, url: URL): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const periodRaw = Number(url.searchParams.get("period") || "1");
  return json(200, {
    code: 200,
    msg: "ok",
    data: { period: Number.isFinite(periodRaw) ? periodRaw : 1, scheme: [1, 2, 3, 4, 5, 6] },
  });
}

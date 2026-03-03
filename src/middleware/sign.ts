import { signGuard } from "../services/session";
import { generateSign } from "../services/crypto";
import type { RuntimeConfig } from "../types";

export { signGuard };

export async function verifySign(
  request: Request,
  db: D1Database,
  cfg: RuntimeConfig,
  rawBody: string
): Promise<Response | null> {
  return signGuard(request, db, cfg, rawBody, generateSign);
}

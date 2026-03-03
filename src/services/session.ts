import type { AdminSession } from "../types";
import { nowSec, readCookie } from "../utils/helpers";

const NONCE_TTL_SEC = 600;

export async function requireAdmin(
  request: Request,
  db: D1Database
): Promise<AdminSession | null> {
  const sid = readCookie(request.headers.get("cookie") || "", "admin_session");
  if (!sid) return null;
  const row = await db.prepare(
    "SELECT username, exp FROM admin_sessions WHERE sid = ? LIMIT 1"
  ).bind(sid).first<{ username: string; exp: number }>();
  if (!row) return null;
  if (Number(row.exp || 0) < nowSec()) {
    await db.prepare("DELETE FROM admin_sessions WHERE sid = ?").bind(sid).run();
    return null;
  }
  return { username: String(row.username || "") };
}

export async function createSession(
  db: D1Database,
  sid: string,
  username: string,
  exp: number
): Promise<void> {
  await db.prepare("INSERT OR REPLACE INTO admin_sessions (sid, username, iat, exp) VALUES (?, ?, ?, ?)")
    .bind(sid, username, nowSec(), exp)
    .run();
}

export async function deleteSession(db: D1Database, sid: string): Promise<void> {
  await db.prepare("DELETE FROM admin_sessions WHERE sid = ?").bind(sid).run();
}

export async function consumeNonce(db: D1Database, nonce: string): Promise<boolean> {
  const now = nowSec();
  await db.prepare("DELETE FROM used_nonces WHERE expires_at < ?").bind(now).run();
  const found = await db.prepare("SELECT nonce FROM used_nonces WHERE nonce = ? LIMIT 1")
    .bind(nonce)
    .first();
  if (found) return false;
  await db.prepare("INSERT INTO used_nonces (nonce, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(nonce, now, now + NONCE_TTL_SEC)
    .run();
  return true;
}

export async function signGuard<TCfg extends { signFixed: string }>(
  request: Request,
  db: D1Database,
  cfg: TCfg,
  rawBody: string,
  generateSignFn: (rawBody: string, timestampSec: number, cfg: TCfg) => Promise<string>
): Promise<Response | null> {
  const timestampRaw = request.headers.get("x-timestamp") || request.headers.get("timestamp");
  const sign = request.headers.get("x-sign") || request.headers.get("sign");
  if (!timestampRaw || !sign) {
    return new Response(JSON.stringify({ code: 400, msg: "missing sign/timestamp" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isFinite(timestamp)) {
    return new Response(JSON.stringify({ code: 400, msg: "invalid timestamp" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  if (Math.abs(nowSec() - timestamp) > 300) {
    return new Response(JSON.stringify({ code: 400, msg: "timestamp expired" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if ((await generateSignFn(rawBody || "", timestamp, cfg)) !== sign) {
    return new Response(JSON.stringify({ code: 401, msg: "invalid sign" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const nonce = (request.headers.get("x-nonce") || request.headers.get("nonce") || "").trim();
  if (nonce) {
    const ok = await consumeNonce(db, nonce);
    if (!ok) {
      return new Response(JSON.stringify({ code: 401, msg: "duplicate nonce" }), {
        status: 401,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  }

  return null;
}

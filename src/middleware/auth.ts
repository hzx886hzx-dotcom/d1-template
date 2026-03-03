import { requireAdmin, createSession, deleteSession } from "../services/session";
import { verifyAdminCredential } from "../services/crypto";
import { randomHex, makeSessionCookie, clearSessionCookie, isHttpsRequest, nowSec } from "../utils/helpers";
import type { RuntimeConfig } from "../types";

export { requireAdmin };

export async function handleLogin(
  request: Request,
  db: D1Database,
  cfg: RuntimeConfig,
  body: { username?: unknown; password?: unknown; sliderPassed?: unknown }
): Promise<Response> {
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();
  const sliderPassed = Boolean(body.sliderPassed);

  if (!sliderPassed) {
    return new Response(JSON.stringify({ code: 400, msg: "slider captcha not passed" }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  if (!(await verifyAdminCredential(username, password, cfg))) {
    return new Response(JSON.stringify({ code: 401, msg: "username or password invalid" }), {
      status: 401,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const sid = randomHex(24);
  const iat = nowSec();
  const exp = iat + cfg.tokenTtlSec;
  await createSession(db, sid, cfg.adminUsername, exp);

  return new Response(JSON.stringify({ code: 200, msg: "ok" }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Set-Cookie": makeSessionCookie("admin_session", sid, cfg.tokenTtlSec, isHttpsRequest(request)),
    },
  });
}

export async function handleLogout(request: Request, db: D1Database): Promise<Response> {
  const cookieHeader = request.headers.get("cookie") || "";
  const sid = cookieHeader.split(";").map((x) => x.trim()).find((x) => x.startsWith("admin_session="));
  if (sid) {
    const sidValue = sid.split("=")[1];
    if (sidValue) await deleteSession(db, sidValue);
  }

  return new Response(JSON.stringify({ code: 200, msg: "ok" }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "Set-Cookie": clearSessionCookie("admin_session", isHttpsRequest(request)),
    },
  });
}

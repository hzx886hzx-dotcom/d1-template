import { renderAdminPage, renderLoginPage } from "./renderHtml";
import { getConfig } from "./services/crypto";
import { ensureSeedCode, cleanupExpiredCodes } from "./services/activationCode";
import { handleVerify, handleGetScheme } from "./routes/api";
import {
  handleActivationCodesList,
  handleCodeUsages,
  handleCreateCodes,
  handleBatchDisable,
  handleBatchRenew,
  handleBatchDelete,
  handleDisableCode,
  handleRenewCode,
  handleDevicesList,
  handleDeviceActivations,
  handleDeviceRenew,
  handleDeleteDevice,
  handleBatchDeleteDevices,
} from "./routes/admin";
import { handleWebLogin, handleWebLogout, handleWebMe, handleWebScheme } from "./routes/web";
import { parseRequestBody, json } from "./utils/helpers";
import type { RuntimeConfig, Env } from "./types/index";

let bootstrapDone = false;

async function bootstrapIfNeeded(env: Env, cfg: RuntimeConfig): Promise<void> {
  if (bootstrapDone) return;
  if (cfg.seedActivationCode) {
    await ensureSeedCode(env.DB, cfg.seedActivationCode, cfg.seedCodeExpiresInDays, cfg.seedCodeMaxUses);
  }
  bootstrapDone = true;
}

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
        return handleVerify(request, env.DB, cfg);
      }

      if (method === "POST" && pathname === "/api/get_scheme") {
        return handleGetScheme(request, env.DB, cfg);
      }

      if (method === "POST" && pathname === "/web/login") {
        const { body } = await parseRequestBody(request);
        return handleWebLogin(request, env.DB, cfg, body);
      }

      if (method === "POST" && pathname === "/web/logout") {
        return handleWebLogout(request, env.DB);
      }

      if (method === "GET" && pathname === "/web/me") {
        return handleWebMe(request, env.DB);
      }

      if (method === "GET" && pathname === "/web/scheme") {
        return handleWebScheme(request, env.DB, url);
      }

      if (method === "GET" && pathname === "/admin/activation-codes") {
        return handleActivationCodesList(request, env.DB, url);
      }

      const usageMatch = pathname.match(/^\/admin\/activation-codes\/([^/]+)\/usages$/);
      if (method === "GET" && usageMatch) {
        return handleCodeUsages(request, env.DB, decodeURIComponent(usageMatch[1]));
      }

      if (method === "POST" && pathname === "/admin/activation-codes") {
        const { body } = await parseRequestBody(request);
        return handleCreateCodes(request, env.DB, body);
      }

      if (method === "POST" && pathname === "/admin/activation-codes/batch-disable") {
        const { body } = await parseRequestBody(request);
        return handleBatchDisable(request, env.DB, body);
      }

      if (method === "POST" && pathname === "/admin/activation-codes/batch-renew") {
        const { body } = await parseRequestBody(request);
        return handleBatchRenew(request, env.DB, body);
      }

      if (method === "POST" && pathname === "/admin/activation-codes/batch-delete") {
        const { body } = await parseRequestBody(request);
        return handleBatchDelete(request, env.DB, body);
      }

      const disableMatch = pathname.match(/^\/admin\/activation-codes\/([^/]+)\/disable$/);
      if (method === "POST" && disableMatch) {
        return handleDisableCode(request, env.DB, decodeURIComponent(disableMatch[1]));
      }

      const renewMatch = pathname.match(/^\/admin\/activation-codes\/([^/]+)\/renew$/);
      if (method === "POST" && renewMatch) {
        const { body } = await parseRequestBody(request);
        return handleRenewCode(request, env.DB, decodeURIComponent(renewMatch[1]), body);
      }

      if (method === "GET" && pathname === "/admin/devices") {
        return handleDevicesList(request, env.DB, url);
      }

      const deviceActivationMatch = pathname.match(/^\/admin\/devices\/([^/]+)\/activations$/);
      if (method === "GET" && deviceActivationMatch) {
        return handleDeviceActivations(request, env.DB, decodeURIComponent(deviceActivationMatch[1]));
      }

      if (method === "POST" && pathname === "/admin/devices/renew") {
        const { body } = await parseRequestBody(request);
        return handleDeviceRenew(request, env.DB, body);
      }

      const deleteDeviceMatch = pathname.match(/^\/admin\/devices\/([^/]+)$/);
      if (method === "DELETE" && deleteDeviceMatch) {
        return handleDeleteDevice(request, env.DB, decodeURIComponent(deleteDeviceMatch[1]));
      }

      if (method === "POST" && pathname === "/admin/devices/batch-delete") {
        const { body } = await parseRequestBody(request);
        return handleBatchDeleteDevices(request, env.DB, body);
      }

      return json(404, { code: 404, msg: "not found" });
    } catch (err) {
      return json(500, {
        code: 500,
        msg: `internal error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  },
} satisfies ExportedHandler<Env>;

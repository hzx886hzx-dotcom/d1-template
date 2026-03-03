import { requireAdmin } from "../middleware/auth";
import {
  listCodesPage,
  createCodes,
  disableCode,
  batchDisableCodes,
  renewCode,
  batchRenewCodes,
  batchDeleteCodes,
  getCodeUsages,
} from "../services/activationCode";
import {
  listDevicesPage,
  getDeviceActivations,
  renewDeviceActivation,
  deleteDevice,
  batchDeleteDevices,
} from "../services/device";
import { resolveCardSpec, extractCodesFromBody, normalizeCode, json } from "../utils/helpers";

export async function handleActivationCodesList(
  request: Request,
  db: D1Database,
  url: URL
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const result = await listCodesPage(db, {
    page: Number(url.searchParams.get("page") || "1"),
    pageSize: Number(url.searchParams.get("pageSize") || "10"),
    status: String(url.searchParams.get("status") || ""),
    keyword: String(url.searchParams.get("keyword") || ""),
  });

  return json(200, { code: 200, msg: "ok", data: result.data, pagination: result.pagination });
}

export async function handleCodeUsages(
  request: Request,
  db: D1Database,
  code: string
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const result = await getCodeUsages(db, normalizeCode(code));
  if (!result.ok) return json(404, { code: 404, msg: result.msg });
  return json(200, { code: 200, msg: "ok", data: result.data });
}

export async function handleCreateCodes(
  request: Request,
  db: D1Database,
  body: Record<string, unknown>
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const cardSpec = resolveCardSpec(body.cardType);
  const created = await createCodes(db, {
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

export async function handleBatchDisable(
  request: Request,
  db: D1Database,
  body: Record<string, unknown>
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const codes = extractCodesFromBody(body);
  if (!codes.length) return json(400, { code: 400, msg: "codes is required" });

  const result = await batchDisableCodes(db, codes);
  return json(200, { code: 200, msg: "ok", data: result });
}

export async function handleBatchRenew(
  request: Request,
  db: D1Database,
  body: Record<string, unknown>
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const codes = extractCodesFromBody(body);
  if (!codes.length) return json(400, { code: 400, msg: "codes is required" });

  const result = await batchRenewCodes(db, codes, {
    addDays: Number(body.addDays || 0),
    addUses: Number(body.addUses || 0),
    reactivate: body.reactivate === undefined ? true : Boolean(body.reactivate),
  });

  if (!result.ok) return json(400, { code: 400, msg: result.msg });
  return json(200, { code: 200, msg: "ok", data: result.data });
}

export async function handleBatchDelete(
  request: Request,
  db: D1Database,
  body: Record<string, unknown>
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const codes = extractCodesFromBody(body);
  if (!codes.length) return json(400, { code: 400, msg: "codes is required" });

  const result = await batchDeleteCodes(db, codes);
  return json(200, { code: 200, msg: "ok", data: result });
}

export async function handleDisableCode(
  request: Request,
  db: D1Database,
  code: string
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const ok = await disableCode(db, normalizeCode(code));
  if (!ok) return json(404, { code: 404, msg: "activation code not found" });
  return json(200, { code: 200, msg: "ok" });
}

export async function handleRenewCode(
  request: Request,
  db: D1Database,
  code: string,
  body: Record<string, unknown>
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const result = await renewCode(db, normalizeCode(code), {
    addDays: Number(body.addDays || 0),
    addUses: Number(body.addUses || 0),
    reactivate: body.reactivate === undefined ? true : Boolean(body.reactivate),
  });

  if (!result.ok) return json(400, { code: 400, msg: result.msg });
  return json(200, { code: 200, msg: "ok", data: result.data });
}

export async function handleDevicesList(
  request: Request,
  db: D1Database,
  url: URL
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const data = await listDevicesPage(db, {
    page: Number(url.searchParams.get("page") || "1"),
    pageSize: Number(url.searchParams.get("pageSize") || "10"),
    keyword: String(url.searchParams.get("keyword") || ""),
  });

  return json(200, { code: 200, msg: "ok", data: data.data, pagination: data.pagination });
}

export async function handleDeviceActivations(
  request: Request,
  db: D1Database,
  deviceId: string
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const data = await getDeviceActivations(db, normalizeCode(deviceId));
  return json(200, { code: 200, msg: "ok", data });
}

export async function handleDeviceRenew(
  request: Request,
  db: D1Database,
  body: Record<string, unknown>
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const deviceId = normalizeCode(String(body.deviceId || ""));
  const activationCode = normalizeCode(String(body.activationCode || ""));

  if (!deviceId || !activationCode) {
    return json(400, { code: 400, msg: "deviceId and activationCode are required" });
  }

  const result = await renewDeviceActivation(db, deviceId, activationCode, {
    addDays: Number(body.addDays || 0),
    addUses: Number(body.addUses || 0),
  });

  if (!result.ok) return json(400, { code: 400, msg: result.msg });
  return json(200, { code: 200, msg: "ok", data: result.data });
}

export async function handleDeleteDevice(
  request: Request,
  db: D1Database,
  deviceId: string
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const result = await deleteDevice(db, normalizeCode(deviceId));
  if (!result.ok) return json(404, { code: 404, msg: result.msg });
  return json(200, { code: 200, msg: "ok" });
}

export async function handleBatchDeleteDevices(
  request: Request,
  db: D1Database,
  body: Record<string, unknown>
): Promise<Response> {
  const admin = await requireAdmin(request, db);
  if (!admin) return json(401, { code: 401, msg: "admin not logged in" });

  const deviceIds = (body.deviceIds as string[]) || [];
  if (!deviceIds.length) return json(400, { code: 400, msg: "deviceIds is required" });

  const result = await batchDeleteDevices(db, deviceIds);
  return json(200, { code: 200, msg: "ok", data: result });
}

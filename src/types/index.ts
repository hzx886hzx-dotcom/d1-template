export type Json = Record<string, unknown>;

export type StrategyPayload = {
  period?: number;
  history?: unknown[];
  number_list?: unknown[];
  token_sn?: string;
  device?: Record<string, unknown>;
};

export type InternalStrategyConfig = {
  take: number;
  min: number;
  max: number;
  multiple: number;
  lookback: number;
};

export type RuntimeConfig = {
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

export type ActivationCodeRow = {
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

export type DeviceRow = {
  device_id: string;
  device_name: string;
  app_version: string;
  client_ip: string;
  user_agent: string;
  first_seen_at: number;
  last_seen_at: number;
  is_active: number;
};

export type DeviceActivationRow = {
  id: number;
  device_id: string;
  activation_code: string;
  activated_at: number;
  expires_at: number;
  is_active: number;
  renewal_count: number;
};

export type DeviceActivationStatus = {
  deviceId: string;
  currentActivationCode: string | null;
  totalValidUntil: number;
  isActive: boolean;
  activationCount: number;
  renewalCount: number;
  lastSeenAt: number;
};

export type UsageContext = {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  clientIp: string;
  userAgent: string;
};

export type CardSpec = {
  type: string;
  durationSec: number;
};

export type CreateCodesParams = {
  count: number;
  cardType: string;
  durationSec: number;
  maxUses: number;
  prefix: string;
  issuedTo: string;
  note: string;
  deviceLimit: number;
};

export type RenewCodeParams = {
  addDays: number;
  addUses: number;
  reactivate: boolean;
};

export type PaginationParams = {
  page: number;
  pageSize: number;
  status?: string;
  keyword?: string;
};

export type PaginationResult<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type FormattedActivationCode = {
  code: string;
  status: string;
  createdAt: number;
  expiresAt: number;
  cardType: string;
  durationSec: number;
  activatedAt: number | null;
  maxUses: number;
  usedCount: number;
  lastUsedAt: number | null;
  issuedTo: string;
  note: string;
  deviceLimit: number;
  deviceCount?: number;
};

export type DeviceInfo = {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  clientIp: string;
  userAgent: string;
  firstSeenAt: number;
  lastSeenAt: number;
  isActive: boolean;
  activationCount: number;
  totalValidUntil: number;
  currentActivationCode: string | null;
  deviceStatus: string;
};

export type DeviceActivationInfo = {
  activationCode: string;
  activatedAt: number;
  expiresAt: number;
  isActive: boolean;
  renewalCount: number;
  codeStatus: string;
  cardType: string;
  durationSec: number;
  maxUses: number;
  usedCount: number;
  issuedTo: string;
  note: string;
};

export type DeviceUsageInfo = {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  clientIp: string;
  userAgent: string;
  firstSeenAt: number;
  lastSeenAt: number;
  useCount: number;
  activatedAt: number;
  expiresAt: number;
  isActive: boolean;
  renewalCount: number;
};

export type DeviceTreeNode = {
  deviceId: string;
  deviceName: string;
  totalUses: number;
  codeCount: number;
  lastSeenAt: number;
  children: Array<{
    code: string;
    status: string;
    expiresAt: number;
    maxUses: number;
    usedCount: number;
    isActive: boolean;
    cardType: string;
  }>;
};

export type AdminSession = {
  username: string;
};

export type TokenPayload = {
  sn: string;
  device_id: string;
  iat: number;
  exp: number;
};

export type ExternalTokenPayload = {
  sn: string;
  device_id: string;
  exp: number;
};

export type StrategyResult = {
  period: number;
  numbers: number[];
  multiple: number;
};

export type ActivationValidationResult = {
  ok: boolean;
  msg?: string;
  record?: ActivationCodeRow;
  deviceCount?: number;
  deviceStatus?: DeviceActivationStatus;
};

export type RenewResult = {
  ok: boolean;
  msg?: string;
  data?: FormattedActivationCode | null;
};

export type BatchRenewResult = {
  ok: boolean;
  msg?: string;
  data?: {
    requested: number;
    affected: number;
    items: FormattedActivationCode[];
  };
};

export type BatchOperationResult = {
  requested: number;
  affected: number;
};

export type DeviceRenewResult = {
  ok: boolean;
  msg?: string;
  data?: {
    deviceId: string;
    activationCode: string;
    newExpiresAt: number;
    renewalCount: number;
    deviceStatus: DeviceActivationStatus;
  };
};

export type Env = {
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
  DB: D1Database;
};

declare module "sm-crypto" {
  export const sm4: {
    encrypt(input: string, key: string, options?: { padding?: "pkcs#7" }): string;
    decrypt(input: string, key: string, options?: { padding?: "pkcs#7" }): string;
  };
}

interface Env {
  DB: D1Database;
  SN_SIGN_FIXED?: string;
  SN_AES_KEY?: string;
  SN_AES_IV?: string;
  SN_SM4_KEY?: string;
  TOKEN_TTL_SEC?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_HASH?: string;
  SEED_ACTIVATION_CODE?: string;
  SEED_CODE_EXPIRES_DAYS?: string;
  SEED_CODE_MAX_USES?: string;
}

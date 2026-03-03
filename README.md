# SN Node Server (Cloudflare Worker + D1)

基于 `d1-template` 改造，已实现原 `node_server` 核心逻辑，并迁移到 Cloudflare：

- 激活码校验与绑定：`POST /api/verify`
- 方案计算：`POST /api/get_scheme`
- 管理登录与会话：`/web/login` `/web/me` `/web/logout`
- 激活码管理：`/admin/activation-codes*`
- 设备树查询：`GET /admin/devices/tree`

## 增强项

- 存储从本地 JSON 文件迁移到 D1，支持多实例部署。
- 管理员会话持久化到 D1，不依赖进程内存。
- 签名接口支持可选 `x-nonce` 防重放（如传入则强校验）。
- 支持 `ADMIN_PASSWORD_HASH`（sha256）避免明文密码。
- 启动自动初始化种子激活码。

## 重要差异

- 方案计算已改为后端内部固定逻辑，不再从“策略配置”读取或动态更新。
- 管理端支持批量激活码操作：
  - `POST /admin/activation-codes/batch-disable`
  - `POST /admin/activation-codes/batch-renew`
  - `POST /admin/activation-codes/batch-delete`

## 环境变量

- `SN_SIGN_FIXED` 默认 `bjx`
- `SN_AES_KEY` 默认 `your-32-byte-aes-key-here`
- `SN_AES_IV` 默认 `your-16-byte-iv-here`
- `SN_SM4_KEY` 默认 `your-sm4-key-here`
- `TOKEN_TTL_SEC` 默认 `7200`
- `ADMIN_USERNAME` 默认 `superadmin`
- `ADMIN_PASSWORD` 默认 `Super@123456`
- `ADMIN_PASSWORD_HASH` 可选，优先于 `ADMIN_PASSWORD`
- `SEED_ACTIVATION_CODE` 可选，启动时自动写入
- `SEED_CODE_EXPIRES_DAYS` 默认 `365`
- `SEED_CODE_MAX_USES` 默认 `100000`

## 本地开发

```bash
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

## 远端部署

1. 创建 D1 并把 `database_id` 写入 `wrangler.json`。
2. 执行迁移：

```bash
npx wrangler d1 migrations apply DB --remote
```

3. 设置密钥类变量（示例）：

```bash
npx wrangler secret put SN_AES_KEY
npx wrangler secret put SN_AES_IV
npx wrangler secret put SN_SM4_KEY
npx wrangler secret put ADMIN_PASSWORD_HASH
```

4. 部署：

```bash
npm run deploy
```

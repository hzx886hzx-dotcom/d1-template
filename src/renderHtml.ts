function shell(title: string, body: string, script: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root { --bg:#f3f4f8; --card:#fff; --text:#111827; --muted:#6b7280; --line:#e5e7eb; --brand:#0f766e; --danger:#b91c1c; --warn:#a16207; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; background:var(--bg); color:var(--text); }
    .wrap { max-width: 1200px; margin: 20px auto; padding: 0 14px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:12px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .grid { display:grid; grid-template-columns: 1.2fr 1fr; gap:12px; }
    @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }
    h2,h3 { margin:0 0 10px; }
    .muted { color:var(--muted); font-size:13px; }
    .ok { color:#166534; }
    .err { color:#b91c1c; }
    .warn { color:var(--warn); }
    label { font-size:13px; color:#374151; display:block; margin-bottom:4px; }
    input,select,textarea,button { border:1px solid var(--line); border-radius:8px; font-size:14px; padding:8px 10px; }
    input,select,textarea { background:#fff; color:var(--text); }
    button { background:var(--brand); border-color:var(--brand); color:#fff; cursor:pointer; }
    button.secondary { background:#fff; color:#111827; }
    button.danger { background:var(--danger); border-color:var(--danger); }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th,td { border-bottom:1px solid var(--line); padding:8px; text-align:left; vertical-align:top; }
    .right { margin-left:auto; }
    .mono { font-family: Consolas, Monaco, monospace; }
    .badge { display:inline-block; padding:2px 6px; border-radius:999px; font-size:12px; }
    .badge.active { background:#dcfce7; color:#166534; }
    .badge.disabled { background:#fee2e2; color:#991b1b; }
    .modal { position:fixed; inset:0; background:rgba(0,0,0,.5); display:none; align-items:center; justify-content:center; z-index:20; }
    .modal.open { display:flex; }
    .modal-card { width:min(980px,92vw); max-height:86vh; overflow:auto; background:#fff; border-radius:12px; padding:14px; }
  </style>
</head>
<body>
  <div class="wrap">${body}</div>
  <script>${script}</script>
</body>
</html>`;
}

export function renderLoginPage() {
  return shell(
    "SN 管理登录",
    `
<div class="card" style="max-width:460px;margin:90px auto;">
  <h2>SN 管理后台登录</h2>
  <p class="muted">登录成功后自动跳转到 <code>/admin</code>。</p>
  <label>用户名</label>
  <input id="username" placeholder="superadmin" style="width:100%" />
  <label style="margin-top:8px">密码</label>
  <input id="password" type="password" placeholder="请输入密码" style="width:100%" />
  <div class="row" style="margin-top:10px"><label><input id="slider" type="checkbox" checked /> 已通过滑块校验</label></div>
  <div class="row" style="margin-top:10px">
    <button id="loginBtn">登录</button>
    <span id="msg" class="muted"></span>
  </div>
</div>`,
    `
const msg = document.getElementById("msg");
document.getElementById("loginBtn").addEventListener("click", async () => {
  msg.className = "muted";
  msg.textContent = "登录中...";
  try {
    const r = await fetch("/web/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value.trim(),
        password: document.getElementById("password").value.trim(),
        sliderPassed: document.getElementById("slider").checked
      })
    });
    const j = await r.json().catch(() => ({}));
    if (j.code === 200) {
      msg.className = "ok";
      msg.textContent = "登录成功，正在跳转...";
      location.href = "/admin";
      return;
    }
    msg.className = "err";
    msg.textContent = j.msg || ("HTTP " + r.status);
  } catch (e) {
    msg.className = "err";
    msg.textContent = String(e);
  }
});`,
  );
}

export function renderAdminPage() {
  return shell(
    "SN 管理后台",
    `
<div class="card row">
  <h2>SN 管理后台</h2>
  <span id="me" class="muted"></span>
  <button id="logoutBtn" class="secondary right">退出登录</button>
</div>

<div class="grid">
  <div class="card">
    <h3>激活码创建</h3>
    <p class="muted">格式固定为 <code>XXXX-XXXX-XXXX-XXXX</code>。下方字段都带后端校验。</p>
    <div class="row">
      <div><label>数量</label><input id="count" type="number" min="1" max="200" value="1" /></div>
      <div><label>有效天数</label><input id="days" type="number" min="1" value="30" /></div>
      <div><label>可用次数</label><input id="maxUses" type="number" min="1" value="1" /></div>
      <div><label>设备上限</label><input id="deviceLimit" type="number" min="1" value="1" /></div>
    </div>
    <div class="row">
      <div><label>前缀(可选)</label><input id="prefix" value="SN" /></div>
      <div style="min-width:220px"><label>发放对象(可选)</label><input id="issuedTo" placeholder="team-a" /></div>
      <div style="flex:1"><label>备注(可选)</label><input id="note" placeholder="用途说明" style="width:100%" /></div>
    </div>
    <div class="row" style="margin-top:8px">
      <button id="createBtn">创建激活码</button>
      <span id="createMsg" class="muted"></span>
    </div>
    <pre id="createDetail" class="muted mono" style="white-space:pre-wrap;margin-top:8px;"></pre>
  </div>

  <div class="card">
    <h3>策略配置</h3>
    <p class="muted">支持模式：recent_unique / hot / cold / custom_pool。可直接编辑 JSON。</p>
    <textarea id="strategyCode" style="width:100%;min-height:180px;"></textarea>
    <div class="row" style="margin-top:8px">
      <button id="presetRecent" class="secondary">Recent 模板</button>
      <button id="presetHot" class="secondary">Hot 模板</button>
      <button id="presetCold" class="secondary">Cold 模板</button>
      <button id="presetPool" class="secondary">Pool 模板</button>
    </div>
    <div class="row" style="margin-top:8px">
      <button id="loadStrategyBtn" class="secondary">读取</button>
      <button id="saveStrategyBtn">保存</button>
      <span id="strategyMsg" class="muted"></span>
    </div>
  </div>
</div>

<div class="card">
  <div class="row">
    <h3>激活码列表</h3>
    <input id="kw" placeholder="关键词: code/issuedTo/note" />
    <select id="status"><option value="">全部</option><option value="active">active</option><option value="disabled">disabled</option></select>
    <button id="queryBtn" class="secondary">查询</button>
    <button id="prevBtn" class="secondary">上一页</button>
    <button id="nextBtn" class="secondary">下一页</button>
    <span id="pageInfo" class="muted"></span>
  </div>
  <table>
    <thead><tr><th>Code</th><th>状态</th><th>次数</th><th>设备</th><th>过期时间</th><th>操作</th></tr></thead>
    <tbody id="tbody"></tbody>
  </table>
  <div class="row"><span id="listMsg" class="muted"></span></div>
</div>

<div id="deviceModal" class="modal">
  <div class="modal-card">
    <div class="row">
      <h3>设备使用明细</h3>
      <button id="closeDeviceModal" class="secondary right">关闭</button>
    </div>
    <table>
      <thead><tr><th>deviceId</th><th>deviceName</th><th>appVersion</th><th>IP</th><th>首次</th><th>最近</th><th>次数</th></tr></thead>
      <tbody id="deviceTbody"></tbody>
    </table>
  </div>
</div>`,
    `
let page = 1;
const pageSize = 20;
let pagination = { page:1, totalPages:1, total:0 };
const meEl = document.getElementById("me");
const tbody = document.getElementById("tbody");
const listMsg = document.getElementById("listMsg");
const pageInfo = document.getElementById("pageInfo");
const createMsg = document.getElementById("createMsg");
const createDetail = document.getElementById("createDetail");
const strategyMsg = document.getElementById("strategyMsg");
const deviceModal = document.getElementById("deviceModal");
const deviceTbody = document.getElementById("deviceTbody");

async function api(path, init) {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
  return j;
}
function fmtTs(v){ if(!v) return "-"; return new Date(Number(v)*1000).toLocaleString(); }
function esc(v){ return String(v ?? "").replace(/[<>&"]/g, (m) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", "\\"":"&quot;" }[m])); }

async function ensureLogin() {
  try {
    const j = await api("/web/me");
    meEl.textContent = "当前用户: " + (j.data?.username || "");
  } catch {
    location.href = "/admin/login";
  }
}

function fillStrategyPreset(mode){
  const presetMap = {
    recent_unique: { mode:"recent_unique", take:6, min:0, max:27, multiple:1, lookback:50, pool:[] },
    hot: { mode:"hot", take:6, min:0, max:27, multiple:1, lookback:60, pool:[] },
    cold: { mode:"cold", take:6, min:0, max:27, multiple:1, lookback:60, pool:[] },
    custom_pool: { mode:"custom_pool", take:6, min:0, max:27, multiple:1, lookback:60, pool:[1,3,5,7,9,11] }
  };
  document.getElementById("strategyCode").value = JSON.stringify(presetMap[mode], null, 2);
}

async function loadList(){
  listMsg.className = "muted";
  listMsg.textContent = "加载中...";
  const kw = document.getElementById("kw").value.trim();
  const status = document.getElementById("status").value;
  try {
    const q = new URLSearchParams({ page:String(page), pageSize:String(pageSize), keyword:kw, status });
    const j = await api("/admin/activation-codes?" + q.toString());
    pagination = j.pagination || pagination;
    const rows = j.data || [];
    tbody.innerHTML = rows.map((x) => \`
      <tr>
        <td class="mono">\${esc(x.code)}</td>
        <td><span class="badge \${x.status==='active'?'active':'disabled'}">\${esc(x.status)}</span></td>
        <td>\${x.usedCount}/\${x.maxUses}</td>
        <td>\${x.deviceCount||0}/\${x.deviceLimit||1}</td>
        <td>\${fmtTs(x.expiresAt)}</td>
        <td class="row">
          <button data-act="devices" data-code="\${esc(x.code)}" class="secondary">设备</button>
          <button data-act="disable" data-code="\${esc(x.code)}" class="danger">禁用</button>
          <button data-act="renew" data-code="\${esc(x.code)}" class="secondary">续期+7天</button>
        </td>
      </tr>\`).join("");
    pageInfo.textContent = \`第 \${pagination.page}/\${pagination.totalPages} 页\`;
    listMsg.textContent = "总数: " + (pagination.total || 0);
  } catch (e) {
    listMsg.className = "err";
    listMsg.textContent = String(e);
  }
}

async function loadDevices(code){
  deviceTbody.innerHTML = "<tr><td colspan='7'>加载中...</td></tr>";
  deviceModal.classList.add("open");
  try {
    const j = await api("/admin/activation-codes/" + encodeURIComponent(code) + "/usages");
    const rows = j.data || [];
    deviceTbody.innerHTML = rows.length ? rows.map((x) => \`
      <tr>
        <td class="mono">\${esc(x.deviceId)}</td>
        <td>\${esc(x.deviceName)}</td>
        <td>\${esc(x.appVersion)}</td>
        <td>\${esc(x.clientIp)}</td>
        <td>\${fmtTs(x.firstSeenAt)}</td>
        <td>\${fmtTs(x.lastSeenAt)}</td>
        <td>\${esc(x.useCount)}</td>
      </tr>\`).join("") : "<tr><td colspan='7'>暂无设备记录</td></tr>";
  } catch (e) {
    deviceTbody.innerHTML = "<tr><td colspan='7'>" + esc(String(e)) + "</td></tr>";
  }
}

tbody.addEventListener("click", async (e) => {
  const t = e.target;
  if (!t.dataset) return;
  const code = t.dataset.code;
  const act = t.dataset.act;
  if (!code || !act) return;
  try {
    if (act === "devices") return loadDevices(code);
    if (act === "disable") {
      if (!confirm("确认禁用激活码 " + code + " ? 禁用后已发 token 将在 get_scheme 实时失效。")) return;
      await api("/admin/activation-codes/" + encodeURIComponent(code) + "/disable", { method:"POST" });
    }
    if (act === "renew") {
      if (!confirm("确认给激活码 " + code + " 续期 7 天并保持激活?")) return;
      await api("/admin/activation-codes/" + encodeURIComponent(code) + "/renew", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ addDays:7, addUses:0, reactivate:true })
      });
    }
    await loadList();
  } catch (e2) {
    alert(String(e2));
  }
});

document.getElementById("queryBtn").addEventListener("click", () => { page = 1; loadList(); });
document.getElementById("prevBtn").addEventListener("click", () => { if (page > 1) { page -= 1; loadList(); } });
document.getElementById("nextBtn").addEventListener("click", () => { if (page < (pagination.totalPages || 1)) { page += 1; loadList(); } });

document.getElementById("createBtn").addEventListener("click", async () => {
  createMsg.className = "muted";
  createDetail.textContent = "";
  createMsg.textContent = "提交中...";
  try {
    const payload = {
      count: Number(document.getElementById("count").value || 1),
      expiresInDays: Number(document.getElementById("days").value || 30),
      maxUses: Number(document.getElementById("maxUses").value || 1),
      deviceLimit: Number(document.getElementById("deviceLimit").value || 1),
      prefix: document.getElementById("prefix").value || "SN",
      issuedTo: document.getElementById("issuedTo").value || "",
      note: document.getElementById("note").value || ""
    };
    const j = await api("/admin/activation-codes", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(payload),
    });
    const created = j.data || [];
    createMsg.className = "ok";
    createMsg.textContent = "创建成功: " + created.length + " 条";
    createDetail.textContent = created.map((x) => x.code).join("\\n");
    await loadList();
  } catch (e) {
    createMsg.className = "err";
    createMsg.textContent = String(e);
  }
});

async function loadStrategy() {
  strategyMsg.className = "muted";
  strategyMsg.textContent = "读取中...";
  try {
    const j = await api("/admin/strategy");
    document.getElementById("strategyCode").value = j.data?.code || JSON.stringify(j.data?.strategyConfig || {}, null, 2);
    strategyMsg.className = "ok";
    strategyMsg.textContent = "已加载";
  } catch (e) {
    strategyMsg.className = "err";
    strategyMsg.textContent = String(e);
  }
}
document.getElementById("saveStrategyBtn").addEventListener("click", async () => {
  strategyMsg.className = "muted";
  strategyMsg.textContent = "保存中...";
  try {
    const raw = document.getElementById("strategyCode").value.trim();
    JSON.parse(raw);
    await api("/admin/strategy", { method:"PUT", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ code: raw }) });
    strategyMsg.className = "ok";
    strategyMsg.textContent = "保存成功";
  } catch (e) {
    strategyMsg.className = "err";
    strategyMsg.textContent = String(e);
  }
});
document.getElementById("loadStrategyBtn").addEventListener("click", loadStrategy);
document.getElementById("presetRecent").addEventListener("click", () => fillStrategyPreset("recent_unique"));
document.getElementById("presetHot").addEventListener("click", () => fillStrategyPreset("hot"));
document.getElementById("presetCold").addEventListener("click", () => fillStrategyPreset("cold"));
document.getElementById("presetPool").addEventListener("click", () => fillStrategyPreset("custom_pool"));
document.getElementById("closeDeviceModal").addEventListener("click", () => deviceModal.classList.remove("open"));
deviceModal.addEventListener("click", (e) => { if (e.target === deviceModal) deviceModal.classList.remove("open"); });
document.getElementById("logoutBtn").addEventListener("click", async () => { await fetch("/web/logout", { method:"POST" }); location.href = "/admin/login"; });

fillStrategyPreset("recent_unique");
ensureLogin();
loadList();
loadStrategy();`,
  );
}

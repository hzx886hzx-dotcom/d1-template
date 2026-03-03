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
    .wrap { max-width: 1280px; margin: 20px auto; padding: 0 14px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:14px; margin-bottom:12px; }
    .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
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
    .tree details { border:1px solid var(--line); border-radius:8px; padding:8px 10px; margin-bottom:8px; }
    .tree summary { cursor:pointer; }
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
    "SN 管理员登录",
    `
<div class="card" style="max-width:460px;margin:90px auto;">
  <h2>SN 管理员登录</h2>
  <p class="muted">登录成功后将被重定向到 <code>/admin</code>。</p>
  <label>用户名</label>
  <input id="username" placeholder="superadmin" style="width:100%" />
  <label style="margin-top:8px">密码</label>
  <input id="password" type="password" placeholder="password" style="width:100%" />
  <div class="row" style="margin-top:10px"><label><input id="slider" type="checkbox" checked /> 滑块验证已通过</label></div>
  <div class="row" style="margin-top:10px">
    <button id="loginBtn">登录</button>
    <span id="msg" class="muted"></span>
  </div>
</div>`,
    `
const msg = document.getElementById("msg");
document.getElementById("loginBtn").addEventListener("click", async () => {
  msg.className = "muted";
  msg.textContent = "正在登录...";
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
      msg.textContent = "登录成功";
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
    <h3>创建激活码</h3>
    <p class="muted">格式: <code>XXXX-XXXX-XXXX-XXXX</code>。</p>
    <div class="row">
      <div><label>数量</label><input id="count" type="number" min="1" max="200" value="1" /></div>
      <div><label>有效期(天)</label><input id="days" type="number" min="1" value="30" /></div>
      <div><label>最大使用次数</label><input id="maxUses" type="number" min="1" value="1" /></div>
      <div><label>设备限制</label><input id="deviceLimit" type="number" min="1" value="1" /></div>
    </div>
    <div class="row">
      <div><label>前缀(可选)</label><input id="prefix" value="SN" /></div>
      <div style="min-width:220px"><label>发放给</label><input id="issuedTo" placeholder="team-a" /></div>
      <div style="flex:1"><label>备注</label><input id="note" placeholder="description" style="width:100%" /></div>
    </div>
    <div class="row" style="margin-top:8px">
      <button id="createBtn">创建</button>
      <span id="createMsg" class="muted"></span>
    </div>
    <pre id="createDetail" class="muted mono" style="white-space:pre-wrap;margin-top:8px;"></pre>
  </div>

  <div class="card">
    <h3>设备树</h3>
    <p class="muted">通过 deviceId/deviceName/code 搜索设备，然后以树形结构查看绑定的激活码。</p>
    <div class="row">
      <input id="deviceKw" placeholder="设备关键字" style="min-width:240px" />
      <button id="deviceQueryBtn" class="secondary">查询</button>
      <span id="deviceTreeMsg" class="muted"></span>
    </div>
    <div id="deviceTree" class="tree" style="margin-top:10px;"></div>
  </div>
</div>

<div class="card">
  <div class="row">
    <h3>激活码列表</h3>
    <input id="kw" placeholder="关键字: code / issuedTo / note / device" />
    <select id="status"><option value="">全部</option><option value="active">启用</option><option value="disabled">禁用</option></select>
    <button id="queryBtn" class="secondary">查询</button>
    <button id="prevBtn" class="secondary">上一页</button>
    <button id="nextBtn" class="secondary">下一页</button>
    <span id="pageInfo" class="muted"></span>
  </div>
  <div class="row" style="margin-bottom:8px;">
    <span id="selectedInfo" class="muted">已选择: 0</span>
    <input id="batchDays" type="number" min="0" value="7" style="width:90px" />
    <input id="batchUses" type="number" min="0" value="0" style="width:90px" />
    <button id="batchDisableBtn" class="danger">批量禁用</button>
    <button id="batchRenewBtn" class="secondary">批量续期</button>
    <button id="batchDeleteBtn" class="danger">批量删除</button>
    <span id="batchMsg" class="muted"></span>
  </div>
  <table>
    <thead><tr><th><input id="checkAll" type="checkbox" /></th><th>激活码</th><th>状态</th><th>使用次数</th><th>设备数</th><th>过期时间</th><th>操作</th></tr></thead>
    <tbody id="tbody"></tbody>
  </table>
  <div class="row"><span id="listMsg" class="muted"></span></div>
</div>

<div id="deviceModal" class="modal">
  <div class="modal-card">
    <div class="row">
      <h3>设备使用详情</h3>
      <button id="closeDeviceModal" class="secondary right">关闭</button>
    </div>
    <table>
      <thead><tr><th>deviceId</th><th>设备名称</th><th>App版本</th><th>IP地址</th><th>首次出现</th><th>最后出现</th><th>使用次数</th></tr></thead>
      <tbody id="deviceTbody"></tbody>
    </table>
  </div>
</div>`,
    `
let page = 1;
const pageSize = 20;
let pagination = { page:1, totalPages:1, total:0 };
const selectedCodes = new Set();

const meEl = document.getElementById("me");
const tbody = document.getElementById("tbody");
const listMsg = document.getElementById("listMsg");
const pageInfo = document.getElementById("pageInfo");
const createMsg = document.getElementById("createMsg");
const createDetail = document.getElementById("createDetail");
const deviceModal = document.getElementById("deviceModal");
const deviceTbody = document.getElementById("deviceTbody");
const batchMsg = document.getElementById("batchMsg");
const selectedInfo = document.getElementById("selectedInfo");
const checkAll = document.getElementById("checkAll");
const deviceTree = document.getElementById("deviceTree");
const deviceTreeMsg = document.getElementById("deviceTreeMsg");

async function api(path, init) {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
  return j;
}
function fmtTs(v){ if(!v) return "-"; return new Date(Number(v)*1000).toLocaleString(); }
function esc(v){ return String(v ?? "").replace(/[<>&"]/g, (m) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", "":"&quot;" }[m])); }
function getSelectedCodes(){ return Array.from(selectedCodes.values()); }
function syncSelectedInfo(){ selectedInfo.textContent = "已选择: " + selectedCodes.size; }

async function ensureLogin() {
  try {
    const j = await api("/web/me");
    meEl.textContent = "当前用户: " + (j.data?.username || "");
  } catch {
    location.href = "/admin/login";
  }
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
    tbody.innerHTML = rows.map((x) => {
      const checked = selectedCodes.has(x.code) ? "checked" : "";
      const statusText = x.status === "active" ? "启用" : "禁用";
      return "<tr>"
        + "<td><input type=\\\"checkbox\\\" data-act=\\\"pick\\\" data-code=\\\"" + esc(x.code) + "\\\" " + checked + " /></td>"
        + "<td class=\\\"mono\\\">" + esc(x.code) + "</td>"
        + "<td><span class=\\\"badge " + (x.status === "active" ? "active" : "disabled") + "\\\">" + statusText + "</span></td>"
        + "<td>" + x.usedCount + "/" + x.maxUses + "</td>"
        + "<td>" + (x.deviceCount || 0) + "/" + (x.deviceLimit || 1) + "</td>"
        + "<td>" + fmtTs(x.expiresAt) + "</td>"
        + "<td class=\\\"row\\\">"
        + "<button data-act=\\\"devices\\\" data-code=\\\"" + esc(x.code) + "\\\" class=\\\"secondary\\\">设备</button>"
        + "<button data-act=\\\"disable\\\" data-code=\\\"" + esc(x.code) + "\\\" class=\\\"danger\\\">禁用</button>"
        + "<button data-act=\\\"renew\\\" data-code=\\\"" + esc(x.code) + "\\\" class=\\\"secondary\\\">续期+7天</button>"
        + "</td>"
        + "</tr>";
    }).join("");
    pageInfo.textContent = "第 " + pagination.page + "/" + pagination.totalPages + " 页";
    listMsg.textContent = "共 " + (pagination.total || 0) + " 条";
    syncSelectedInfo();
    checkAll.checked = rows.length > 0 && rows.every((x) => selectedCodes.has(x.code));
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
    deviceTbody.innerHTML = rows.length ? rows.map((x) => "<tr>"
      + "<td class=\\\"mono\\\">" + esc(x.deviceId) + "</td>"
      + "<td>" + esc(x.deviceName) + "</td>"
      + "<td>" + esc(x.appVersion) + "</td>"
      + "<td>" + esc(x.clientIp) + "</td>"
      + "<td>" + fmtTs(x.firstSeenAt) + "</td>"
      + "<td>" + fmtTs(x.lastSeenAt) + "</td>"
      + "<td>" + esc(x.useCount) + "</td>"
      + "</tr>").join("") : "<tr><td colspan='7'>暂无设备记录</td></tr>";
  } catch (e) {
    deviceTbody.innerHTML = "<tr><td colspan='7'>" + esc(String(e)) + "</td></tr>";
  }
}

async function loadDeviceTree(){
  deviceTreeMsg.className = "muted";
  deviceTreeMsg.textContent = "加载中...";
  deviceTree.innerHTML = "";
  try {
    const keyword = document.getElementById("deviceKw").value.trim();
    const q = new URLSearchParams({ keyword });
    const j = await api("/admin/devices/tree?" + q.toString());
    const rows = j.data || [];
    deviceTree.innerHTML = rows.length ? rows.map((d) => {
      const children = (d.children || []).map((c) => "<tr>"
        + "<td class=\\\"mono\\\">" + esc(c.code) + "</td>"
        + "<td>" + (c.status === "active" ? "启用" : "禁用") + "</td>"
        + "<td>" + fmtTs(c.expiresAt) + "</td>"
        + "<td>" + esc(c.usedCount) + "/" + esc(c.maxUses) + "</td>"
        + "<td>" + esc(c.useCount) + "</td>"
        + "<td>" + fmtTs(c.lastSeenAt) + "</td>"
        + "</tr>").join("");
      return "<details><summary><span class=\\\"mono\\\">" + esc(d.deviceId) + "</span> "
        + esc(d.deviceName || "")
        + " | 激活码: " + esc(d.codeCount)
        + " | 使用: " + esc(d.totalUses)
        + " | 最后: " + fmtTs(d.lastSeenAt)
        + "</summary><div style=\\\"margin-top:8px\\\"><table><thead><tr><th>激活码</th><th>状态</th><th>过期时间</th><th>使用次数</th><th>设备使用</th><th>最后出现</th></tr></thead><tbody>"
        + children
        + "</tbody></table></div></details>";
    }).join("") : "<div class=\\\"muted\\\">未找到设备</div>";
    deviceTreeMsg.className = "ok";
    deviceTreeMsg.textContent = "已加载: " + rows.length + " 条";
  } catch (e) {
    deviceTreeMsg.className = "err";
    deviceTreeMsg.textContent = String(e);
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
      if (!confirm("确定禁用 " + code + " 吗？")) return;
      await api("/admin/activation-codes/" + encodeURIComponent(code) + "/disable", { method:"POST" });
    }
    if (act === "renew") {
      if (!confirm("确定续期 " + code + " 7天并重新激活吗？")) return;
      await api("/admin/activation-codes/" + encodeURIComponent(code) + "/renew", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ addDays:7, addUses:0, reactivate:true })
      });
    }
    await loadList();
    await loadDeviceTree();
  } catch (e2) {
    alert(String(e2));
  }
});

tbody.addEventListener("change", (e) => {
  const t = e.target;
  if (!t.dataset || t.dataset.act !== "pick") return;
  const code = t.dataset.code;
  if (!code) return;
  if (t.checked) selectedCodes.add(code); else selectedCodes.delete(code);
  syncSelectedInfo();
});

checkAll.addEventListener("change", () => {
  const boxes = Array.from(document.querySelectorAll("input[data-act='pick']"));
  boxes.forEach((b) => {
    b.checked = checkAll.checked;
    const code = b.dataset.code;
    if (code) {
      if (checkAll.checked) selectedCodes.add(code); else selectedCodes.delete(code);
    }
  });
  syncSelectedInfo();
});

async function runBatch(path, payload, confirmText){
  const codes = getSelectedCodes();
  if (!codes.length) throw new Error("请先选择激活码");
  if (confirmText && !confirm(confirmText + " (" + codes.length + ")")) return null;
  return api(path, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ ...payload, codes })
  });
}

document.getElementById("batchDisableBtn").addEventListener("click", async () => {
  batchMsg.className = "muted";
  batchMsg.textContent = "处理中...";
  try {
    const j = await runBatch("/admin/activation-codes/batch-disable", {}, "确定批量禁用选中的激活码吗？");
    if (!j) return;
    batchMsg.className = "ok";
    batchMsg.textContent = "已禁用 " + (j.data?.affected || 0) + "/" + (j.data?.requested || 0);
    await loadList();
    await loadDeviceTree();
  } catch (e) {
    batchMsg.className = "err";
    batchMsg.textContent = String(e);
  }
});

document.getElementById("batchRenewBtn").addEventListener("click", async () => {
  batchMsg.className = "muted";
  batchMsg.textContent = "处理中...";
  try {
    const addDays = Number(document.getElementById("batchDays").value || 0);
    const addUses = Number(document.getElementById("batchUses").value || 0);
    const j = await runBatch("/admin/activation-codes/batch-renew", { addDays, addUses, reactivate:true }, "确定批量续期选中的激活码吗？");
    if (!j) return;
    batchMsg.className = "ok";
    batchMsg.textContent = "已续期 " + (j.data?.affected || 0) + "/" + (j.data?.requested || 0);
    await loadList();
    await loadDeviceTree();
  } catch (e) {
    batchMsg.className = "err";
    batchMsg.textContent = String(e);
  }
});

document.getElementById("batchDeleteBtn").addEventListener("click", async () => {
  batchMsg.className = "muted";
  batchMsg.textContent = "处理中...";
  try {
    const j = await runBatch("/admin/activation-codes/batch-delete", {}, "确定批量删除选中的激活码吗？此操作不可撤销。");
    if (!j) return;
    const codes = getSelectedCodes();
    codes.forEach((x) => selectedCodes.delete(x));
    syncSelectedInfo();
    batchMsg.className = "ok";
    batchMsg.textContent = "已删除 " + (j.data?.affected || 0) + "/" + (j.data?.requested || 0);
    await loadList();
    await loadDeviceTree();
  } catch (e) {
    batchMsg.className = "err";
    batchMsg.textContent = String(e);
  }
});

document.getElementById("queryBtn").addEventListener("click", () => { page = 1; loadList(); });
document.getElementById("prevBtn").addEventListener("click", () => { if (page > 1) { page -= 1; loadList(); } });
document.getElementById("nextBtn").addEventListener("click", () => { if (page < (pagination.totalPages || 1)) { page += 1; loadList(); } });
document.getElementById("deviceQueryBtn").addEventListener("click", loadDeviceTree);

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
    createMsg.textContent = "已创建: " + created.length;
    createDetail.textContent = created.map((x) => x.code).join("\\n");
    await loadList();
    await loadDeviceTree();
  } catch (e) {
    createMsg.className = "err";
    createMsg.textContent = String(e);
  }
});

document.getElementById("closeDeviceModal").addEventListener("click", () => deviceModal.classList.remove("open"));
deviceModal.addEventListener("click", (e) => { if (e.target === deviceModal) deviceModal.classList.remove("open"); });
document.getElementById("logoutBtn").addEventListener("click", async () => { await fetch("/web/logout", { method:"POST" }); location.href = "/admin/login"; });

ensureLogin();
loadList();
loadDeviceTree();`,
  );
}

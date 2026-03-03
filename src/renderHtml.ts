function shell(title: string, body: string, script: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root { --bg:#f4f6fb; --card:#fff; --text:#111827; --muted:#6b7280; --line:#e5e7eb; --brand:#0f766e; --danger:#b91c1c; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; background:var(--bg); color:var(--text); }
    .wrap { max-width: 1100px; margin: 24px auto; padding: 0 16px; }
    .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:16px; }
    h1,h2,h3 { margin:0 0 12px; }
    .muted { color:var(--muted); font-size: 13px; }
    .row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
    input,button,textarea,select { border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:14px; }
    input,textarea,select { background:#fff; }
    button { background:var(--brand); color:#fff; cursor:pointer; border-color:var(--brand); }
    button.secondary { background:#fff; color:var(--text); }
    button.danger { background:var(--danger); border-color:var(--danger); }
    table { width:100%; border-collapse: collapse; font-size:13px; }
    th,td { border-bottom:1px solid var(--line); padding:8px; text-align:left; }
    .right { margin-left:auto; }
    .ok { color:#166534; }
    .err { color:#b91c1c; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    code { background:#f3f4f6; padding:2px 4px; border-radius:4px; }
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
<div class="card" style="max-width:440px;margin:80px auto;">
  <h2>SN 管理后台登录</h2>
  <p class="muted">使用 <code>/web/login</code> 登录，成功后跳转到管理页。</p>
  <div class="row"><input id="username" placeholder="用户名" style="width:100%" /></div>
  <div class="row"><input id="password" type="password" placeholder="密码" style="width:100%" /></div>
  <div class="row"><label><input id="slider" type="checkbox" checked /> 已通过滑块校验</label></div>
  <div class="row">
    <button id="loginBtn">登录</button>
    <span id="msg" class="muted"></span>
  </div>
</div>`,
    `
const msg = document.getElementById("msg");
document.getElementById("loginBtn").addEventListener("click", async () => {
  msg.textContent = "登录中...";
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const sliderPassed = document.getElementById("slider").checked;
  try {
    const r = await fetch("/web/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, sliderPassed })
    });
    const j = await r.json();
    if (j.code === 200) {
      msg.textContent = "登录成功，正在跳转...";
      location.href = "/admin";
      return;
    }
    msg.textContent = j.msg || "登录失败";
    msg.className = "err";
  } catch (e) {
    msg.textContent = String(e);
    msg.className = "err";
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
    <div class="row"><input id="count" type="number" value="1" min="1" max="200" /><input id="days" type="number" value="30" min="1" /><input id="maxUses" type="number" value="1" min="1" /></div>
    <div class="row"><input id="deviceLimit" type="number" value="1" min="1" /><input id="prefix" value="SN" /><input id="issuedTo" placeholder="issuedTo" /></div>
    <div class="row"><input id="note" placeholder="note" style="width:100%" /></div>
    <div class="row"><button id="createBtn">创建</button><span id="createMsg" class="muted"></span></div>
  </div>

  <div class="card">
    <h3>策略配置</h3>
    <p class="muted">提交 JSON 字符串到 <code>PUT /admin/strategy</code></p>
    <textarea id="strategyCode" style="width:100%;min-height:140px;"></textarea>
    <div class="row">
      <button id="loadStrategyBtn" class="secondary">读取</button>
      <button id="saveStrategyBtn">保存</button>
      <span id="strategyMsg" class="muted"></span>
    </div>
  </div>
</div>

<div class="card">
  <div class="row">
    <h3>激活码列表</h3>
    <input id="kw" placeholder="keyword" />
    <select id="status"><option value="">全部</option><option value="active">active</option><option value="disabled">disabled</option></select>
    <button id="queryBtn" class="secondary">查询</button>
  </div>
  <table>
    <thead><tr><th>Code</th><th>Status</th><th>Used/Max</th><th>Device</th><th>ExpiresAt</th><th>Actions</th></tr></thead>
    <tbody id="tbody"></tbody>
  </table>
  <div class="row"><span id="listMsg" class="muted"></span></div>
</div>`,
    `
let page = 1;
const pageSize = 20;
const meEl = document.getElementById("me");
const tbody = document.getElementById("tbody");
const listMsg = document.getElementById("listMsg");
const createMsg = document.getElementById("createMsg");
const strategyMsg = document.getElementById("strategyMsg");

async function api(path, init) {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
  return j;
}

async function ensureLogin() {
  try {
    const j = await api("/web/me");
    meEl.textContent = "当前用户: " + (j.data?.username || "");
  } catch {
    location.href = "/admin/login";
  }
}

function fmtTs(v) {
  if (!v) return "-";
  const d = new Date(Number(v) * 1000);
  return d.toLocaleString();
}

async function loadList() {
  listMsg.textContent = "加载中...";
  const kw = document.getElementById("kw").value.trim();
  const status = document.getElementById("status").value;
  try {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize), keyword: kw, status });
    const j = await api("/admin/activation-codes?" + q.toString());
    const rows = j.data || [];
    tbody.innerHTML = rows.map(x => \`
      <tr>
        <td>\${x.code}</td>
        <td>\${x.status}</td>
        <td>\${x.usedCount}/\${x.maxUses}</td>
        <td>\${x.deviceCount || 0}/\${x.deviceLimit || 1}</td>
        <td>\${fmtTs(x.expiresAt)}</td>
        <td>
          <button data-act="disable" data-code="\${x.code}" class="danger">禁用</button>
          <button data-act="renew" data-code="\${x.code}" class="secondary">续期+7天</button>
        </td>
      </tr>\`).join("");
    listMsg.textContent = "总数: " + (j.pagination?.total || 0);
  } catch (e) {
    listMsg.textContent = String(e);
    listMsg.className = "err";
  }
}

document.getElementById("queryBtn").addEventListener("click", () => { page = 1; loadList(); });

tbody.addEventListener("click", async (e) => {
  const t = e.target;
  if (!t.dataset) return;
  const code = t.dataset.code;
  const act = t.dataset.act;
  if (!code || !act) return;
  try {
    if (act === "disable") await api("/admin/activation-codes/" + encodeURIComponent(code) + "/disable", { method: "POST" });
    if (act === "renew") await api("/admin/activation-codes/" + encodeURIComponent(code) + "/renew", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addDays: 7, addUses: 0, reactivate: true }) });
    await loadList();
  } catch (e2) {
    alert(String(e2));
  }
});

document.getElementById("createBtn").addEventListener("click", async () => {
  createMsg.textContent = "提交中...";
  try {
    await api("/admin/activation-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        count: Number(document.getElementById("count").value || 1),
        expiresInDays: Number(document.getElementById("days").value || 30),
        maxUses: Number(document.getElementById("maxUses").value || 1),
        deviceLimit: Number(document.getElementById("deviceLimit").value || 1),
        prefix: document.getElementById("prefix").value || "SN",
        issuedTo: document.getElementById("issuedTo").value || "",
        note: document.getElementById("note").value || ""
      })
    });
    createMsg.textContent = "创建成功";
    createMsg.className = "ok";
    await loadList();
  } catch (e) {
    createMsg.textContent = String(e);
    createMsg.className = "err";
  }
});

async function loadStrategy() {
  strategyMsg.textContent = "读取中...";
  try {
    const j = await api("/admin/strategy");
    document.getElementById("strategyCode").value = j.data?.code || JSON.stringify(j.data?.strategyConfig || {}, null, 2);
    strategyMsg.textContent = "已加载";
    strategyMsg.className = "ok";
  } catch (e) {
    strategyMsg.textContent = String(e);
    strategyMsg.className = "err";
  }
}

document.getElementById("loadStrategyBtn").addEventListener("click", loadStrategy);
document.getElementById("saveStrategyBtn").addEventListener("click", async () => {
  strategyMsg.textContent = "保存中...";
  try {
    await api("/admin/strategy", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: document.getElementById("strategyCode").value })
    });
    strategyMsg.textContent = "保存成功";
    strategyMsg.className = "ok";
  } catch (e) {
    strategyMsg.textContent = String(e);
    strategyMsg.className = "err";
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/web/logout", { method: "POST" });
  location.href = "/admin/login";
});

ensureLogin();
loadList();
loadStrategy();`,
  );
}

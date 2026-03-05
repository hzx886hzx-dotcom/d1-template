export function renderActivationCodeList(): { body: string; script: string } {
  const body = `
<div class="card">
  <div class="row" style="flex-wrap:wrap;gap:8px;">
    <h3>激活码列表</h3>
    <input id="kw" placeholder="关键字: code / issuedTo / note / device" style="flex:1;min-width:150px;" />
    <select id="status">
      <option value="">全部</option>
      <option value="active">启用</option>
      <option value="disabled">禁用</option>
    </select>
    <button id="queryBtn" class="secondary">查询</button>
    <button id="prevBtn" class="secondary">上一页</button>
    <button id="nextBtn" class="secondary">下一页</button>
    <span id="pageInfo" class="muted"></span>
  </div>
  <div class="batch-actions">
    <span id="selectedInfo" class="count">已选择: 0</span>
    <button id="batchCopyBtn" class="secondary batch-copy-btn">批量复制</button>
    <input id="batchDays" type="number" min="0" value="7" title="续期天数" />
    <input id="batchUses" type="number" min="0" value="0" title="增加使用次数" />
    <button id="batchDisableBtn" class="danger">批量禁用</button>
    <button id="batchRenewBtn" class="secondary">批量续期</button>
    <button id="batchDeleteBtn" class="danger">批量删除</button>
    <span id="batchMsg" class="muted"></span>
  </div>
  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th style="width:40px;"><input id="checkAll" type="checkbox" /></th>
          <th>激活码</th>
          <th>卡类型</th>
          <th>状态</th>
          <th>使用次数</th>
          <th class="hide-mobile">设备数</th>
          <th class="hide-mobile">激活时间</th>
          <th class="hide-mobile">过期时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>
  <div class="row"><span id="listMsg" class="muted"></span></div>
</div>`;
  const script = `
let page = 1;
const pageSize = 20;
let pagination = { page:1, totalPages:1, total:0 };
const selectedCodes = new Set();

const tbody = document.getElementById("tbody");
const listMsg = document.getElementById("listMsg");
const pageInfo = document.getElementById("pageInfo");
const batchMsg = document.getElementById("batchMsg");
const selectedInfo = document.getElementById("selectedInfo");
const checkAll = document.getElementById("checkAll");

function fmtTs(v){ if(!v) return "-"; return new Date(Number(v)*1000).toLocaleString(); }
function fmtCardType(v){
  const t = String(v || "").toLowerCase();
  if (t === "day") return "天卡";
  if (t === "week") return "周卡";
  if (t === "month") return "月卡";
  if (t === "trial") return "体验卡";
  if (t === "trial3h") return "体验卡3小时";
  if (t === "permanent") return "永久卡";
  return t || "-";
}
function esc(v){ 
  return String(v ?? "").replace(/[<>&"]/g, (m) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;" }[m] || m)); 
}

async function api(path, init) {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
  return j;
}

function getSelectedCodes(){ return Array.from(selectedCodes.values()); }
function syncSelectedInfo(){ selectedInfo.textContent = "已选择: " + selectedCodes.size; }

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
      return '<tr>'
        + '<td><input type="checkbox" data-act="pick" data-code="' + esc(x.code) + '" ' + checked + ' /></td>'
        + '<td class="mono"><span class="code-text">' + esc(x.code) + '</span><button class="copy-btn" data-act="copy" data-code="' + esc(x.code) + '">复制</button></td>'
        + '<td>' + fmtCardType(x.cardType) + '</td>'
        + '<td><span class="badge ' + (x.status === "active" ? "active" : "disabled") + '">' + statusText + '</span></td>'
        + '<td>' + x.usedCount + '/' + x.maxUses + '</td>'
        + '<td class="hide-mobile">' + (x.deviceCount || 0) + '/' + (x.deviceLimit || 1) + '</td>'
        + '<td class="hide-mobile">' + fmtTs(x.activatedAt) + '</td>'
        + '<td class="hide-mobile">' + fmtTs(x.expiresAt) + '</td>'
        + '<td class="table-actions">'
        + '<button data-act="devices" data-code="' + esc(x.code) + '" class="secondary small">设备</button>'
        + '<button data-act="disable" data-code="' + esc(x.code) + '" class="danger small">禁用</button>'
        + '<button data-act="renew" data-code="' + esc(x.code) + '" class="secondary small">续期+7天</button>'
        + '</td>'
        + '</tr>';
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

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch (err) {
    return false;
  }
}

function showCopyFeedback(btn, originalText) {
  const prevText = btn.textContent;
  btn.textContent = '已复制';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = prevText;
    btn.classList.remove('copied');
  }, 1500);
}

tbody.addEventListener("click", async (e) => {
  const t = e.target;
  if (!t.dataset) return;
  
  if (t.dataset.act === "copy") {
    const code = t.dataset.code;
    const success = await copyToClipboard(code);
    if (success) showCopyFeedback(t, "复制");
    return;
  }
  
  const code = t.dataset.code;
  const act = t.dataset.act;
  if (!code || !act) return;
  try {
    if (act === "devices") return loadDevices(code);
    if (act === "disable") {
      const ok = await showConfirm("禁用激活码", "确定禁用 " + code + " 吗？");
      if (!ok) return;
      await api("/admin/activation-codes/" + encodeURIComponent(code) + "/disable", { method:"POST" });
      showToast("已禁用", "success");
    }
    if (act === "renew") {
      const ok = await showConfirm("续期激活码", "确定续期 " + code + " 7天并重新激活吗？");
      if (!ok) return;
      await api("/admin/activation-codes/" + encodeURIComponent(code) + "/renew", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ addDays:7, addUses:0, reactivate:true })
      });
      showToast("续期成功", "success");
    }
    await loadList();
  } catch (e2) {
    showToast(String(e2), "error");
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
  if (!codes.length) {
    showToast("请先选择激活码", "warning");
    return null;
  }
  if (confirmText) {
    const ok = await showConfirm("确认操作", confirmText + " (" + codes.length + ")");
    if (!ok) return null;
  }
  return api(path, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ ...payload, codes })
  });
}

document.getElementById("batchCopyBtn").addEventListener("click", async () => {
  const codes = getSelectedCodes();
  if (!codes.length) {
    showToast("请先选择激活码", "warning");
    return;
  }
  const text = codes.join("\\n");
  const success = await copyToClipboard(text);
  if (success) {
    const btn = document.getElementById("batchCopyBtn");
    showCopyFeedback(btn, "批量复制");
    showToast("已复制 " + codes.length + " 个激活码", "success");
  }
});

document.getElementById("batchDisableBtn").addEventListener("click", async () => {
  batchMsg.className = "muted";
  batchMsg.textContent = "处理中...";
  try {
    const j = await runBatch("/admin/activation-codes/batch-disable", {}, "确定批量禁用选中的激活码吗？");
    if (!j) return;
    batchMsg.className = "ok";
    const count = (j.data?.affected || 0) + "/" + (j.data?.requested || 0);
    batchMsg.textContent = "已禁用 " + count;
    showToast("已禁用 " + j.data?.affected + " 个激活码", "success");
    await loadList();
  } catch (e) {
    batchMsg.className = "err";
    batchMsg.textContent = String(e);
    showToast(String(e), "error");
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
    const count = (j.data?.affected || 0) + "/" + (j.data?.requested || 0);
    batchMsg.textContent = "已续期 " + count;
    showToast("已续期 " + j.data?.affected + " 个激活码", "success");
    await loadList();
  } catch (e) {
    batchMsg.className = "err";
    batchMsg.textContent = String(e);
    showToast(String(e), "error");
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
    const count = (j.data?.affected || 0) + "/" + (j.data?.requested || 0);
    batchMsg.textContent = "已删除 " + count;
    showToast("已删除 " + j.data?.affected + " 个激活码", "success");
    await loadList();
  } catch (e) {
    batchMsg.className = "err";
    batchMsg.textContent = String(e);
    showToast(String(e), "error");
  }
});

document.getElementById("queryBtn").addEventListener("click", () => { page = 1; loadList(); });
document.getElementById("prevBtn").addEventListener("click", () => { if (page > 1) { page -= 1; loadList(); } });
document.getElementById("nextBtn").addEventListener("click", () => { if (page < (pagination.totalPages || 1)) { page += 1; loadList(); } });

function loadDevices(code) {
  if (typeof openDeviceModal === "function") openDeviceModal(code);
}`;
  return { body, script };
}

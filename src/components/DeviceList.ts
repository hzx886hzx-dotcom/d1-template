export function renderDeviceList(): { body: string; script: string } {
  const body = `
<div class="card">
  <div class="row" style="flex-wrap:wrap;gap:8px;">
    <h3>设备管理</h3>
    <input id="deviceSearchKw" placeholder="搜索设备ID/名称/激活码" style="flex:1;min-width:150px;" />
    <button id="deviceSearchBtn" class="secondary">搜索</button>
    <button id="devicePrevBtn" class="secondary">上一页</button>
    <button id="deviceNextBtn" class="secondary">下一页</button>
    <span id="devicePageInfo" class="muted"></span>
  </div>
  <div class="batch-actions">
    <span id="deviceSelectedInfo" class="count">已选择: 0</span>
    <button id="deviceBatchDeleteBtn" class="danger">批量删除</button>
    <span id="deviceBatchMsg" class="muted"></span>
  </div>
  <div class="table-wrapper">
    <table>
      <thead>
        <tr>
          <th style="width:40px;"><input id="deviceCheckAll" type="checkbox" /></th>
          <th>设备ID</th>
          <th>设备名称</th>
          <th>激活状态</th>
          <th class="hide-mobile">有效期至</th>
          <th class="hide-mobile">激活码数</th>
          <th class="hide-mobile">最后活跃</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody id="deviceTbodyMain"></tbody>
    </table>
  </div>
  <div class="row"><span id="deviceListMsg" class="muted"></span></div>
</div>`;
  const script = `
let devicePage = 1;
let devicePagination = { page:1, totalPages:1, total:0 };
const selectedDevices = new Set();

const deviceTbodyMain = document.getElementById("deviceTbodyMain");
const deviceListMsg = document.getElementById("deviceListMsg");
const devicePageInfo = document.getElementById("devicePageInfo");
const deviceSelectedInfo = document.getElementById("deviceSelectedInfo");
const deviceCheckAll = document.getElementById("deviceCheckAll");
const deviceBatchMsg = document.getElementById("deviceBatchMsg");

async function api(path, init) {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
  return j;
}

function esc(v){ 
  return String(v ?? "").replace(/[<>&"]/g, (m) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;" }[m] || m)); 
}

function getSelectedDevices(){ return Array.from(selectedDevices.values()); }
function syncDeviceSelectedInfo(){ deviceSelectedInfo.textContent = "已选择: " + selectedDevices.size; }

async function loadDevicesPage() {
  deviceListMsg.className = "muted";
  deviceListMsg.textContent = "加载中...";
  const keyword = document.getElementById("deviceSearchKw").value.trim();
  try {
    const q = new URLSearchParams({ 
      page: String(devicePage), 
      pageSize: "10", 
      keyword 
    });
    const j = await api("/admin/devices?" + q.toString());
    devicePagination = j.pagination || devicePagination;
    const rows = j.data || [];
    
    deviceTbodyMain.innerHTML = rows.map((d) => {
      const checked = selectedDevices.has(d.deviceId) ? "checked" : "";
      const status = d.deviceStatus === "active" ? 
        '<span class="badge active">有效</span>' : 
        '<span class="badge disabled">过期</span>';
      const validUntil = d.totalValidUntil ? 
        new Date(Number(d.totalValidUntil) * 1000).toLocaleString() : 
        (d.deviceStatus === "active" ? "永久" : "已过期");
      
      return '<tr>'
        + '<td><input type="checkbox" data-act="pickDevice" data-device="' + esc(d.deviceId) + '" ' + checked + ' /></td>'
        + '<td class="mono">' + esc(d.deviceId) + '</td>'
        + '<td>' + esc(d.deviceName) + '</td>'
        + '<td>' + status + '</td>'
        + '<td class="hide-mobile">' + validUntil + '</td>'
        + '<td class="hide-mobile">' + esc(d.activationCount) + '</td>'
        + '<td class="hide-mobile">' + (d.lastSeenAt ? new Date(Number(d.lastSeenAt) * 1000).toLocaleString() : "-") + '</td>'
        + '<td class="table-actions">'
        + '<button data-act="viewDevice" data-device="' + esc(d.deviceId) + '" class="secondary small">查看激活</button>'
        + '<button data-act="deleteDevice" data-device="' + esc(d.deviceId) + '" class="danger small">删除</button>'
        + '</td>'
        + '</tr>';
    }).join("");
    
    devicePageInfo.textContent = "第 " + devicePagination.page + "/" + devicePagination.totalPages + " 页";
    deviceListMsg.textContent = "共 " + (devicePagination.total || 0) + " 台设备";
    syncDeviceSelectedInfo();
    deviceCheckAll.checked = rows.length > 0 && rows.every((d) => selectedDevices.has(d.deviceId));
  } catch (e) {
    deviceListMsg.className = "err";
    deviceListMsg.textContent = String(e);
  }
}

deviceTbodyMain.addEventListener("click", async (e) => {
  const t = e.target;
  if (!t.dataset) return;
  const deviceId = t.dataset.device;
  const act = t.dataset.act;
  if (!deviceId || !act) return;
  
  if (act === "viewDevice") {
    if (typeof openActivationModal === "function") openActivationModal(deviceId);
  }
  if (act === "deleteDevice") {
    const ok = await showConfirm("删除设备", "确定删除设备 " + deviceId + " 吗？此操作不可撤销。");
    if (!ok) return;
    try {
      await api("/admin/devices/" + encodeURIComponent(deviceId), { method: "DELETE" });
      showToast("设备已删除", "success");
      await loadDevicesPage();
    } catch (e2) {
      showToast(String(e2), "error");
    }
  }
});

deviceTbodyMain.addEventListener("change", (e) => {
  const t = e.target;
  if (!t.dataset || t.dataset.act !== "pickDevice") return;
  const deviceId = t.dataset.device;
  if (!deviceId) return;
  if (t.checked) selectedDevices.add(deviceId); else selectedDevices.delete(deviceId);
  syncDeviceSelectedInfo();
});

deviceCheckAll.addEventListener("change", () => {
  const boxes = Array.from(document.querySelectorAll("input[data-act='pickDevice']"));
  boxes.forEach((b) => {
    b.checked = deviceCheckAll.checked;
    const deviceId = b.dataset.device;
    if (deviceId) {
      if (deviceCheckAll.checked) selectedDevices.add(deviceId); else selectedDevices.delete(deviceId);
    }
  });
  syncDeviceSelectedInfo();
});

document.getElementById("deviceSearchBtn").addEventListener("click", () => { 
  devicePage = 1; 
  loadDevicesPage(); 
});
document.getElementById("devicePrevBtn").addEventListener("click", () => { 
  if (devicePage > 1) { 
    devicePage -= 1; 
    loadDevicesPage(); 
  } 
});
document.getElementById("deviceNextBtn").addEventListener("click", () => { 
  if (devicePage < (devicePagination.totalPages || 1)) { 
    devicePage += 1; 
    loadDevicesPage(); 
  } 
});

document.getElementById("deviceBatchDeleteBtn").addEventListener("click", async () => {
  deviceBatchMsg.className = "muted";
  deviceBatchMsg.textContent = "处理中...";
  try {
    const deviceIds = getSelectedDevices();
    if (!deviceIds.length) {
      deviceBatchMsg.className = "err";
      deviceBatchMsg.textContent = "请先选择设备";
      showToast("请先选择设备", "warning");
      return;
    }
    const ok = await showConfirm("批量删除设备", "确定批量删除选中的 " + deviceIds.length + " 台设备吗？此操作不可撤销。");
    if (!ok) return;
    const j = await api("/admin/devices/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceIds })
    });
    selectedDevices.clear();
    syncDeviceSelectedInfo();
    deviceBatchMsg.className = "ok";
    deviceBatchMsg.textContent = "已删除 " + (j.data?.affected || 0) + "/" + (j.data?.requested || 0);
    showToast("已删除 " + j.data?.affected + " 台设备", "success");
    await loadDevicesPage();
  } catch (e) {
    deviceBatchMsg.className = "err";
    deviceBatchMsg.textContent = String(e);
    showToast(String(e), "error");
  }
});`;
  return { body, script };
}

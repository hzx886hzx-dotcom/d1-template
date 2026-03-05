export function renderActivationModal(): { body: string; script: string } {
  const body = `
<div id="deviceActivationModal" class="modal">
  <div class="modal-card">
    <div class="row" style="justify-content:space-between;">
      <h3>设备激活记录</h3>
      <button id="closeDeviceActivationModal" class="modal-close">&times;</button>
    </div>
    <div id="deviceActivationInfo" class="muted" style="margin-bottom: 12px;"></div>
    <table>
      <thead>
        <tr>
          <th>激活码</th>
          <th>卡类型</th>
          <th>激活时间</th>
          <th>过期时间</th>
          <th>续期次数</th>
          <th>状态</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody id="deviceActivationTbody"></tbody>
    </table>
  </div>
</div>`;
  const script = `
const deviceActivationModal = document.getElementById("deviceActivationModal");
const deviceActivationTbody = document.getElementById("deviceActivationTbody");
const deviceActivationInfo = document.getElementById("deviceActivationInfo");

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
function esc(v){ return String(v ?? "").replace(/[<>&"]/g, (m) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;" }[m] || m)); }

async function api(path, init) {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
  return j;
}

async function openActivationModal(deviceId) {
  deviceActivationTbody.innerHTML = "<tr><td colspan='7'>加载中...</td></tr>";
  deviceActivationModal.classList.add("open");
  
  try {
    const j = await api("/admin/devices/" + encodeURIComponent(deviceId) + "/activations");
    const rows = j.data || [];
    
    deviceActivationInfo.innerHTML = "设备: <span class=\"mono\">" + esc(deviceId) + "</span> | 激活记录: " + rows.length;
    
    deviceActivationTbody.innerHTML = rows.length ? rows.map((a) => {
      const status = a.isActive ? 
        '<span class="badge active">有效</span>' : 
        '<span class="badge disabled">过期</span>';
      const cardTypeText = fmtCardType(a.cardType);
      
      return "<tr>"
        + "<td class=\"mono\">" + esc(a.activationCode) + "</td>"
        + "<td>" + cardTypeText + "</td>"
        + "<td>" + (a.activatedAt ? new Date(Number(a.activatedAt) * 1000).toLocaleString() : "-") + "</td>"
        + "<td>" + (a.expiresAt ? new Date(Number(a.expiresAt) * 1000).toLocaleString() : (a.cardType === "permanent" ? "永久" : "-")) + "</td>"
        + "<td>" + esc(a.renewalCount) + "</td>"
        + "<td>" + status + "</td>"
        + "<td><button data-act=\"renewDevice\" data-device=\"" + esc(deviceId) + "\" data-code=\"" + esc(a.activationCode) + "\" class=\"secondary small\">续期</button></td>"
        + "</tr>";
    }).join("") : "<tr><td colspan='7'>暂无激活记录</td></tr>";
  } catch (e) {
    deviceActivationTbody.innerHTML = "<tr><td colspan='7'>" + esc(String(e)) + "</td></tr>";
  }
}

deviceActivationTbody.addEventListener("click", async (e) => {
  const t = e.target;
  if (!t.dataset) return;
  const deviceId = t.dataset.device;
  const code = t.dataset.code;
  const act = t.dataset.act;
  if (!deviceId || !code || !act) return;
  
  if (act === "renewDevice") {
    const addDays = prompt("续期天数:", "30");
    const addUses = prompt("增加使用次数 (0表示不增加):", "0");
    if (addDays === null || addUses === null) return;
    
    try {
      await api("/admin/devices/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          activationCode: code,
          addDays: Number(addDays || 0),
          addUses: Number(addUses || 0)
        })
      });
      showToast("续期成功", "success");
      await openActivationModal(deviceId);
    } catch (e2) {
      showToast("续期失败: " + String(e2), "error");
    }
  }
});

document.getElementById("closeDeviceActivationModal").addEventListener("click", () => 
  deviceActivationModal.classList.remove("open")
);
deviceActivationModal.addEventListener("click", (e) => { 
  if (e.target === deviceActivationModal) 
    deviceActivationModal.classList.remove("open"); 
});`;
  return { body, script };
}

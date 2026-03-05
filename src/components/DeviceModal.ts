export function renderDeviceModal(): { body: string; script: string } {
  const body = `
<div id="deviceModal" class="modal">
  <div class="modal-card">
    <div class="row" style="justify-content:space-between;">
      <h3>设备使用详情</h3>
      <button id="closeDeviceModal" class="modal-close">&times;</button>
    </div>
    <table>
      <thead>
        <tr>
          <th>deviceId</th>
          <th>设备名称</th>
          <th>App版本</th>
          <th>IP地址</th>
          <th>首次出现</th>
          <th>最后出现</th>
          <th>使用次数</th>
        </tr>
      </thead>
      <tbody id="deviceTbody"></tbody>
    </table>
  </div>
</div>`;
  const script = `
const deviceModal = document.getElementById("deviceModal");
const deviceTbody = document.getElementById("deviceTbody");

function fmtTs(v){ if(!v) return "-"; return new Date(Number(v)*1000).toLocaleString(); }
function esc(v){ return String(v ?? "").replace(/[<>&"]/g, (m) => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;" }[m] || m)); }

async function api(path, init) {
  const r = await fetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
  return j;
}

async function openDeviceModal(code){
  deviceTbody.innerHTML = "<tr><td colspan='7'>加载中...</td></tr>";
  deviceModal.classList.add("open");
  try {
    const j = await api("/admin/activation-codes/" + encodeURIComponent(code) + "/usages");
    const rows = j.data || [];
    deviceTbody.innerHTML = rows.length ? rows.map((x) => '<tr>'
      + '<td class="mono">' + esc(x.deviceId) + '</td>'
      + '<td>' + esc(x.deviceName) + '</td>'
      + '<td>' + esc(x.appVersion) + '</td>'
      + '<td>' + esc(x.clientIp) + '</td>'
      + '<td>' + fmtTs(x.firstSeenAt) + '</td>'
      + '<td>' + fmtTs(x.lastSeenAt) + '</td>'
      + '<td>' + esc(x.useCount) + '</td>'
      + '</tr>').join("") : "<tr><td colspan='7'>暂无设备记录</td></tr>";
  } catch (e) {
    deviceTbody.innerHTML = "<tr><td colspan='7'>" + esc(String(e)) + "</td></tr>";
  }
}

document.getElementById("closeDeviceModal").addEventListener("click", () => deviceModal.classList.remove("open"));
deviceModal.addEventListener("click", (e) => { if (e.target === deviceModal) deviceModal.classList.remove("open"); });`;
  return { body, script };
}

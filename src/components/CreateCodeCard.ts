export function renderCreateCodeCard(): { body: string; script: string } {
  const body = `
<div class="card">
  <h3>创建激活码</h3>
  <p class="muted">格式: <code>XXXX-XXXX-XXXX-XXXX</code>。</p>
  <div class="create-form">
    <div class="form-row">
      <div class="form-group">
        <label>数量</label>
        <input id="count" type="number" min="1" max="200" value="1" />
      </div>
      <div class="form-group">
        <label>卡类型</label>
        <select id="cardType">
          <option value="day">天卡</option>
          <option value="week">周卡</option>
          <option value="month" selected>月卡</option>
          <option value="trial">体验卡</option>
          <option value="trial3h">体验卡3小时</option>
          <option value="permanent">永久卡</option>
        </select>
      </div>
      <div class="form-group">
        <label>最大使用次数</label>
        <input id="maxUses" type="number" min="1" value="1" />
      </div>
      <div class="form-group">
        <label>设备限制</label>
        <input id="deviceLimit" type="number" min="1" value="1" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>前缀(可选)</label>
        <input id="prefix" value="SN" />
      </div>
      <div class="form-group" style="min-width:220px">
        <label>发放给</label>
        <input id="issuedTo" placeholder="team-a" />
      </div>
      <div class="form-group full">
        <label>备注</label>
        <input id="note" placeholder="description" />
      </div>
    </div>
    <div class="row">
      <button id="createBtn">创建</button>
      <span id="createMsg" class="muted"></span>
    </div>
    <pre id="createDetail" class="muted mono" style="white-space:pre-wrap;"></pre>
  </div>
</div>`;
  const script = `
const createMsg = document.getElementById("createMsg");
const createDetail = document.getElementById("createDetail");

document.getElementById("createBtn").addEventListener("click", async () => {
  createMsg.className = "muted";
  createDetail.textContent = "";
  createMsg.textContent = "提交中...";
  try {
    const payload = {
      count: Number(document.getElementById("count").value || 1),
      cardType: document.getElementById("cardType").value || "month",
      maxUses: Number(document.getElementById("maxUses").value || 1),
      deviceLimit: Number(document.getElementById("deviceLimit").value || 1),
      prefix: document.getElementById("prefix").value || "SN",
      issuedTo: document.getElementById("issuedTo").value || "",
      note: document.getElementById("note").value || ""
    };
    const r = await fetch("/admin/activation-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
    const created = j.data || [];
    createMsg.className = "ok";
    createMsg.textContent = "已创建: " + created.length;
    createDetail.textContent = created.map((x) => x.code).join("\\n");
    showToast("成功创建 " + created.length + " 个激活码", "success");
    if (typeof onCodesCreated === "function") onCodesCreated(created.map((x) => x.code));
  } catch (e) {
    createMsg.className = "err";
    createMsg.textContent = String(e);
    showToast(String(e), "error");
  }
});`;
  return { body, script };
}

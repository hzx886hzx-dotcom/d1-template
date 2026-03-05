export function renderLoginPage(): { title: string; body: string; script: string } {
  const title = "SN 管理员登录";
  const body = `
<div class="card login-container">
  <div class="login-header">
    <h2>SN 管理员登录</h2>
    <p class="muted">登录成功后将被重定向到 <code>/admin</code>。</p>
  </div>
  <div class="login-form">
    <div>
      <label>用户名</label>
      <input id="username" placeholder="superadmin" />
    </div>
    <div>
      <label style="margin-top:8px">密码</label>
      <input id="password" type="password" placeholder="password" />
    </div>
    <div class="checkbox-label">
      <input id="slider" type="checkbox" checked />
      <span>滑块验证已通过</span>
    </div>
    <div class="login-actions">
      <button id="loginBtn">登录</button>
      <span id="msg" class="muted"></span>
    </div>
  </div>
</div>`;
  const script = `
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
});`;
  return { title, body, script };
}

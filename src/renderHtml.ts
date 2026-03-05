import {
  renderLoginPage as renderLoginPageComponent,
  renderCreateCodeCard,
  renderActivationCodeList,
  renderDeviceList,
  renderDeviceModal,
  renderActivationModal,
} from "./components";

function shell(title: string, body: string, script: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f8f9fa;
      --card: #ffffff;
      --text: #202124;
      --text-secondary: #5f6368;
      --muted: #80868b;
      --line: #dadce0;
      --brand: #0f766e;
      --brand-light: #14b8a6;
      --brand-dark: #0d5d56;
      --danger: #d93025;
      --danger-light: #fce8e6;
      --warn: #f9ab00;
      --success: #1e8e3e;
      --success-light: #e6f4ea;
      --shadow-1: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
      --shadow-2: 0 1px 3px 0 rgba(60,64,67,0.3), 0 4px 8px 2px rgba(60,64,67,0.15);
      --shadow-3: 0 4px 4px 0 rgba(60,64,67,0.3), 0 8px 12px 6px rgba(60,64,67,0.15);
      --radius: 4px;
      --radius-lg: 8px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Roboto", "Noto Sans SC", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .wrap { max-width: 1200px; margin: 24px auto; padding: 0 16px; }
    .card {
      background: var(--card);
      border-radius: var(--radius-lg);
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: var(--shadow-1);
    }
    .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .row-stretch { align-items: stretch; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }
    h2, h3 { margin: 0 0 16px; font-weight: 500; }
    h2 { font-size: 24px; }
    h3 { font-size: 18px; }
    .muted { color: var(--muted); font-size: 13px; }
    .ok { color: var(--success); }
    .err { color: var(--danger); }
    .warn { color: var(--warn); }
    label { font-size: 13px; color: var(--text-secondary); display: block; margin-bottom: 6px; font-weight: 500; }
    input, select, textarea {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      font-size: 14px;
      padding: 10px 12px;
      background: var(--card);
      color: var(--text);
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--brand);
      box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.2);
    }
    input::placeholder { color: var(--muted); }
    button {
      background: var(--brand);
      border: none;
      border-radius: var(--radius);
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      padding: 10px 24px;
      text-transform: none;
      letter-spacing: 0.25px;
      box-shadow: var(--shadow-1);
      transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
    }
    button:hover { background: var(--brand-dark); box-shadow: var(--shadow-2); }
    button:active { transform: scale(0.98); }
    button:disabled { background: var(--line); color: var(--muted); cursor: not-allowed; box-shadow: none; }
    button.secondary {
      background: var(--card);
      color: var(--brand);
      border: 1px solid var(--line);
      box-shadow: none;
    }
    button.secondary:hover { background: #f1f3f4; box-shadow: var(--shadow-1); }
    button.danger { background: var(--danger); }
    button.danger:hover { background: #b71c1c; }
    button.text { background: transparent; color: var(--brand); box-shadow: none; }
    button.text:hover { background: rgba(15, 118, 110, 0.08); }
    button.small { padding: 6px 12px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 12px; text-align: left; vertical-align: middle; border-bottom: 1px solid var(--line); }
    th { font-weight: 500; color: var(--text-secondary); font-size: 12px; text-transform: uppercase; background: #f8f9fa; }
    .right { margin-left: auto; }
    .mono { font-family: "Roboto Mono", Consolas, Monaco, monospace; font-size: 13px; }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge.active { background: var(--success-light); color: var(--success); }
    .badge.disabled { background: var(--danger-light); color: var(--danger); }
    .modal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: flex-end;
      justify-content: center;
      z-index: 1000;
      padding: 0;
    }
    .modal.open { display: flex; }
    .modal-card {
      width: min(560px, 100vw);
      background: var(--card);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      box-shadow: var(--shadow-3);
      animation: slideUp 0.3s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      border-bottom: 1px solid var(--line);
    }
    .modal-header h3 { margin: 0; }
    .modal-body { padding: 24px; }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 24px;
      border-top: 1px solid var(--line);
    }
    .tree details { border: 1px solid var(--line); border-radius: var(--radius); padding: 12px; margin-bottom: 8px; }
    .tree summary { cursor: pointer; font-weight: 500; }
    @media (max-width: 768px) {
      .wrap { margin: 16px auto; padding: 0 12px; }
      .card { padding: 16px; margin-bottom: 12px; }
      h2 { font-size: 20px; }
      h3 { font-size: 16px; }
      input, select, button { min-height: 44px; font-size: 16px; padding: 12px 16px; }
      button { padding: 12px 20px; }
      table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .row { flex-direction: column; align-items: stretch; }
      .grid { grid-template-columns: 1fr; }
      .right { margin-left: 0; margin-top: 12px; }
      .hide-mobile { display: none; }
      .modal-card { width: 100vw; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
    }
  </style>
  <style>
    .login-container { max-width: 400px; margin: 80px auto; }
    .login-header { margin-bottom: 24px; text-align: center; }
    .login-header h2 { margin-bottom: 8px; }
    .login-form { display: flex; flex-direction: column; gap: 16px; }
    .checkbox-label { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; color: var(--text-secondary); }
    .checkbox-label input { width: 18px; height: 18px; margin: 0; }
    .login-actions { display: flex; align-items: center; gap: 16px; margin-top: 8px; }
    .search-bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
    .search-bar input { flex: 1; min-width: 160px; }
    .search-bar .search-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .batch-actions {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
      margin-bottom: 16px;
    }
    .batch-actions .count { font-size: 14px; color: var(--text-secondary); }
    .batch-actions input[type="number"] { width: 70px; padding: 8px 12px; }
    .table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .table-actions { display: flex; gap: 4px; flex-wrap: wrap; }
    .table-actions button { padding: 6px 12px; font-size: 12px; }
    .create-form { display: flex; flex-direction: column; gap: 16px; }
    .create-form .form-row { display: flex; gap: 16px; flex-wrap: wrap; }
    .create-form .form-group { min-width: 140px; flex: 1; }
    .create-form .form-group.full { flex: 1 1 100%; }
    .create-form input, .create-form select { width: 100%; }
    .copy-btn {
      padding: 4px 8px;
      font-size: 11px;
      margin-left: 6px;
      background: #f1f3f4;
      color: var(--text-secondary);
      border: 1px solid var(--line);
      vertical-align: middle;
    }
    .copy-btn:hover { background: #e8eaed; }
    .copy-btn.copied { background: var(--success); color: #fff; border-color: var(--success); }
    .batch-copy-btn { background: var(--brand); }
    .modal-close {
      background: transparent;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: var(--text-secondary);
      padding: 4px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
    }
    .modal-close:hover { background: #f1f3f4; color: var(--text); }
    .admin-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    .admin-header h2 { margin: 0; }
    .admin-header .user-info { font-size: 14px; color: var(--text-secondary); }
    @media (max-width: 768px) {
      .login-container { margin: 48px auto; padding: 0 16px; }
      .admin-header { flex-direction: column; align-items: flex-start; }
      .search-bar { flex-direction: column; width: 100%; }
      .search-bar input { width: 100%; }
      .batch-actions { flex-direction: column; align-items: flex-start; }
      .batch-actions > * { width: 100%; }
      .create-form .form-row { flex-direction: column; }
      .create-form .form-group { width: 100%; }
      .table-actions { flex-direction: column; }
      .table-actions button { width: 100%; margin-bottom: 4px; }
    }
  </style>
  <style>
    .toast-container {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      background: #323232;
      color: #fff;
      padding: 14px 24px;
      border-radius: 4px;
      font-size: 14px;
      box-shadow: var(--shadow-3);
      animation: toastIn 0.3s ease;
      pointer-events: auto;
      max-width: 400px;
    }
    .toast.success { background: var(--success); }
    .toast.error { background: var(--danger); }
    .toast.warning { background: var(--warn); color: var(--text); }
    @keyframes toastIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: flex-end;
      justify-content: center;
      z-index: 9999;
      padding: 0;
    }
    .confirm-overlay.open { display: flex; }
    .confirm-dialog {
      width: min(400px, 100vw);
      background: var(--card);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      box-shadow: var(--shadow-3);
      animation: slideUp 0.3s ease;
    }
    .confirm-header { padding: 20px 24px 0; }
    .confirm-title { font-size: 20px; font-weight: 500; margin: 0 0 8px; }
    .confirm-message { font-size: 14px; color: var(--text-secondary); margin: 0 0 20px; }
    .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px; border-top: 1px solid var(--line); }
  </style>
</head>
<body>
  <div class="wrap">${body}</div>
  <div id="toastContainer" class="toast-container"></div>
  <div id="confirmOverlay" class="confirm-overlay">
    <div class="confirm-dialog">
      <div class="confirm-header">
        <h3 id="confirmTitle" class="confirm-title">确认操作</h3>
        <p id="confirmMessage" class="confirm-message"></p>
      </div>
      <div class="confirm-actions">
        <button id="confirmCancel" class="secondary">取消</button>
        <button id="confirmOk">确定</button>
      </div>
    </div>
  </div>
  <script>
    function showToast(message, type) {
      var container = document.getElementById('toastContainer');
      var toast = document.createElement('div');
      toast.className = 'toast ' + (type || '');
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        setTimeout(function() { container.removeChild(toast); }, 300);
      }, 3000);
    }
    function showConfirm(title, message) {
      return new Promise(function(resolve) {
        var overlay = document.getElementById('confirmOverlay');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        overlay.classList.add('open');
        function cleanup() {
          overlay.classList.remove('open');
          document.getElementById('confirmOk').onclick = null;
          document.getElementById('confirmCancel').onclick = null;
        }
        document.getElementById('confirmOk').onclick = function() { cleanup(); resolve(true); };
        document.getElementById('confirmCancel').onclick = function() { cleanup(); resolve(false); };
      });
    }
  </script>
  <script>${script}</script>
</body>
</html>`;
}

export function renderLoginPage() {
  const { title, body, script } = renderLoginPageComponent();
  return shell(title, body, script);
}

export function renderAdminPage() {
  const createCode = renderCreateCodeCard();
  const activationList = renderActivationCodeList();
  const deviceList = renderDeviceList();
  const deviceModal = renderDeviceModal();
  const activationModal = renderActivationModal();

  const body = `
<div class="card admin-header">
  <h2>SN 管理后台</h2>
  <div class="row">
    <span id="me" class="user-info"></span>
    <button id="logoutBtn" class="secondary">退出登录</button>
  </div>
</div>

${createCode.body}

${deviceList.body}

${activationList.body}

${deviceModal.body}

${activationModal.body}`;

  const script = `
var meEl = document.getElementById("me");

async function api(path, init) {
  var r = await fetch(path, init);
  var j = await r.json().catch(function() { return {}; });
  if (j.code !== 200) throw new Error(j.msg || ("HTTP " + r.status));
  return j;
}

async function ensureLogin() {
  try {
    var j = await api("/web/me");
    meEl.textContent = "当前用户: " + (j.data && j.data.username || "");
  } catch {
    location.href = "/admin/login";
  }
}

${createCode.script}

${activationList.script}

${deviceList.script}

${deviceModal.script}

${activationModal.script}

document.getElementById("logoutBtn").addEventListener("click", async function() { 
  await fetch("/web/logout", { method: "POST" }); 
  location.href = "/admin/login"; 
});

ensureLogin();
if (typeof loadList === "function") loadList();
if (typeof loadDevicesPage === "function") loadDevicesPage();`;

  return shell("SN 管理后台", body, script);
}

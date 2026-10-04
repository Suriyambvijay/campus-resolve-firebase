// ============================================================
// Campus Resolve - API helper (Firebase edition)
// Every request attaches the current Firebase user's ID token
// as "Authorization: Bearer <token>". The backend verifies it
// with the Firebase Admin SDK - no cookies/sessions involved.
// ============================================================
const API_BASE = '/api';

async function getIdToken() {
  const user = fbAuth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

async function apiRequest(path, { method = 'GET', body = null, isForm = false } = {}) {
  const token = await getIdToken();
  const opts = { method, headers: {} };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;

  if (body && !isForm) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body && isForm) {
    opts.body = body; // FormData - browser sets content-type
  }

  const res = await fetch(`${API_BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = { success: false, message: 'Unexpected server response.' }; }

  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong. Please try again.');
  }
  return data;
}

const Api = {
  get: (path) => apiRequest(path),
  post: (path, body, isForm = false) => apiRequest(path, { method: 'POST', body, isForm }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  patch: (path, body) => apiRequest(path, { method: 'PATCH', body })
};

// ---------------- Toast helper ----------------
function showToast(message, type = 'success') {
  let container = document.getElementById('cr-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cr-toast-container';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = 1080;
    document.body.appendChild(container);
  }
  const bg = { success: 'success', error: 'danger', warning: 'warning', info: 'primary' }[type] || 'primary';
  const el = document.createElement('div');
  el.className = `toast toast-cr align-items-center text-white bg-${bg} border-0`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  container.appendChild(el);
  const toast = new bootstrap.Toast(el, { delay: 4500 });
  toast.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

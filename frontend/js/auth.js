// ============================================================
// Session guard - every dashboard-family page includes this.
// Verifies the session with GET /api/auth/me and renders the
// role-appropriate sidebar. Redirects to login if unauthenticated.
// ============================================================

const NAV_BY_ROLE = {
  student: [
    { href: '/pages/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard' },
    { href: '/pages/raise-complaint.html', icon: 'bi-megaphone', label: 'Raise a Concern' },
    { href: '/pages/my-complaints.html', icon: 'bi-card-list', label: 'My Complaints' },
    { href: '/pages/notifications.html', icon: 'bi-bell', label: 'Notifications' },
    { href: '/pages/profile.html', icon: 'bi-person-circle', label: 'Profile' }
  ],
  staff: [
    { href: '/pages/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard' },
    { href: '/pages/raise-complaint.html', icon: 'bi-megaphone', label: 'Raise a Concern' },
    { href: '/pages/my-complaints.html', icon: 'bi-card-list', label: 'My Complaints' },
    { href: '/pages/notifications.html', icon: 'bi-bell', label: 'Notifications' },
    { href: '/pages/profile.html', icon: 'bi-person-circle', label: 'Profile' }
  ],
  coordinator: [
    { href: '/pages/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard' },
    { href: '/pages/assigned-complaints.html', icon: 'bi-card-checklist', label: 'Assigned Complaints' },
    { href: '/pages/notifications.html', icon: 'bi-bell', label: 'Notifications' },
    { href: '/pages/profile.html', icon: 'bi-person-circle', label: 'Profile' }
  ],
  hod: [
    { href: '/pages/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard' },
    { href: '/pages/department-complaints.html', icon: 'bi-building', label: 'Department Complaints' },
    { href: '/pages/reports.html', icon: 'bi-file-earmark-pdf', label: 'Reports' },
    { href: '/pages/notifications.html', icon: 'bi-bell', label: 'Notifications' },
    { href: '/pages/profile.html', icon: 'bi-person-circle', label: 'Profile' }
  ],
  principal: [
    { href: '/pages/dashboard.html', icon: 'bi-speedometer2', label: 'Executive Dashboard' },
    { href: '/pages/all-complaints.html', icon: 'bi-card-list', label: 'All Complaints' },
    { href: '/pages/reports.html', icon: 'bi-file-earmark-pdf', label: 'Reports' },
    { href: '/pages/notifications.html', icon: 'bi-bell', label: 'Notifications' },
    { href: '/pages/profile.html', icon: 'bi-person-circle', label: 'Profile' }
  ],
  admin: [
    { href: '/pages/dashboard.html', icon: 'bi-speedometer2', label: 'Dashboard' },
    { href: '/pages/all-complaints.html', icon: 'bi-card-list', label: 'All Complaints' },
    { href: '/pages/manage-users.html', icon: 'bi-people', label: 'Manage Users' },
    { href: '/pages/manage-departments.html', icon: 'bi-building-gear', label: 'Departments & Categories' },
    { href: '/pages/reports.html', icon: 'bi-file-earmark-pdf', label: 'Reports' },
    { href: '/pages/notifications.html', icon: 'bi-bell', label: 'Notifications' },
    { href: '/pages/profile.html', icon: 'bi-person-circle', label: 'Profile' }
  ]
};

const ROLE_LABEL = {
  student: 'Student', staff: 'Staff', coordinator: 'Coordinator',
  hod: 'HOD', principal: 'Principal', admin: 'Administrator'
};

let CURRENT_USER = null;

/**
 * Waits for Firebase Auth to resolve the current session (it's
 * asynchronous on page load), then fetches the Firestore profile
 * via GET /api/auth/me using the ID token. Redirects to login if
 * there is no signed-in Firebase user or the profile call fails
 * (e.g. deactivated account).
 */
function requireAuth() {
  return new Promise((resolve) => {
    const unsubscribe = fbAuth.onAuthStateChanged(async (firebaseUser) => {
      unsubscribe();
      if (!firebaseUser) {
        window.location.href = '/login.html';
        return resolve(null);
      }
      try {
        const { user } = await Api.get('/auth/me');
        CURRENT_USER = user;
        renderShell(user);
        resolve(user);
      } catch (err) {
        await fbAuth.signOut().catch(() => {});
        window.location.href = '/login.html';
        resolve(null);
      }
    });
  });
}

function renderShell(user) {
  const currentPage = '/pages/' + window.location.pathname.split('/').pop();
  const nav = NAV_BY_ROLE[user.role] || [];

  const sidebarHtml = `
    <div class="sidebar-cr d-flex flex-column">
      <div class="cr-logo"><i class="bi bi-shield-check"></i> Campus Resolve</div>
      <nav class="flex-grow-1">
        ${nav.map(item => `<a href="${item.href}" class="${item.href === currentPage ? 'active' : ''}"><i class="bi ${item.icon}"></i> ${item.label}</a>`).join('')}
      </nav>
      <div class="p-3">
        <a href="#" id="logoutBtn" class="d-flex align-items-center gap-2 text-white-50 text-decoration-none">
          <i class="bi bi-box-arrow-right"></i> Logout
        </a>
      </div>
    </div>`;

  const sidebarMount = document.getElementById('sidebarMount');
  if (sidebarMount) sidebarMount.innerHTML = sidebarHtml;

  const topbarMount = document.getElementById('topbarMount');
  if (topbarMount) {
    topbarMount.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h4 class="mb-0">${document.title.split(' | ')[0] || 'Dashboard'}</h4>
          <small class="text-muted">${ROLE_LABEL[user.role]} · ${escapeHtml(user.department_name || '')}</small>
        </div>
        <div class="d-flex align-items-center gap-3">
          <a href="/pages/notifications.html" class="text-decoration-none text-dark position-relative">
            <i class="bi bi-bell fs-5"></i>
            <span id="unreadBadge" class="badge bg-danger rounded-pill position-absolute top-0 start-100 translate-middle d-none">0</span>
          </a>
          <div class="text-end">
            <div class="fw-semibold">${escapeHtml(user.full_name)}</div>
            <small class="text-muted">${escapeHtml(user.email)}</small>
          </div>
        </div>
      </div>`;
    loadUnreadBadge();
  }

  document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await Api.post('/auth/logout'); } catch (err) { /* best-effort token revoke */ }
    await fbAuth.signOut();
    window.location.href = '/index.html';
  });
}

async function loadUnreadBadge() {
  try {
    const { unread_count } = await Api.get('/notifications');
    const badge = document.getElementById('unreadBadge');
    if (badge && unread_count > 0) {
      badge.textContent = unread_count > 9 ? '9+' : unread_count;
      badge.classList.remove('d-none');
    }
  } catch (e) { /* silent */ }
}

function guardRole(...roles) {
  if (CURRENT_USER && !roles.includes(CURRENT_USER.role)) {
    window.location.href = '/pages/dashboard.html';
  }
}

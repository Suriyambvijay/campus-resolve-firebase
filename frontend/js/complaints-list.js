// Renders a filterable, paginated complaints table into #complaintsTableWrap
// Used by: my-complaints.html, assigned-complaints.html, department-complaints.html, all-complaints.html

let CR_PAGE = 1;

function statusBadgeClass(status) {
  const map = {
    Submitted: 'Submitted', Assigned: 'Assigned', 'Under Review': 'review',
    'In Progress': 'progress', Resolved: 'Resolved', Feedback: 'Feedback',
    Closed: 'Closed', Escalated: 'Escalated', Reopened: 'Reopened'
  };
  return `badge-status badge-${map[status] || 'Submitted'}`;
}

function renderFilters(withDeptCategory = false) {
  return `
  <div class="cr-card p-3 mb-3">
    <div class="row g-2">
      <div class="col-md-3">
        <input type="text" id="fSearch" class="form-control form-control-sm" placeholder="Search by ID, title, student...">
      </div>
      <div class="col-md-2">
        <select id="fStatus" class="form-select form-select-sm">
          <option value="">All Statuses</option>
          ${['Submitted','Assigned','Under Review','In Progress','Resolved','Feedback','Closed','Escalated','Reopened'].map(s => `<option>${s}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-2">
        <select id="fPriority" class="form-select form-select-sm">
          <option value="">All Priorities</option>
          ${['Low','Medium','High','Critical'].map(p => `<option>${p}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-2" id="fCategoryWrap" style="${withDeptCategory ? '' : 'display:none'}">
        <select id="fCategory" class="form-select form-select-sm"><option value="">All Categories</option></select>
      </div>
      <div class="col-md-3 text-end">
        <button class="btn btn-cr-primary btn-sm" id="fApply"><i class="bi bi-funnel"></i> Apply Filters</button>
      </div>
    </div>
  </div>`;
}

async function populateCategoryFilter() {
  const wrap = document.getElementById('fCategoryWrap');
  if (!wrap || wrap.style.display === 'none') return;
  const { categories } = await Api.get('/public/categories');
  document.getElementById('fCategory').innerHTML += categories.map(c => `<option value="${c.id}">${escapeHtml(c.category_name)}</option>`).join('');
}

function buildQuery(page = 1) {
  const params = new URLSearchParams();
  const search = document.getElementById('fSearch')?.value.trim();
  const status = document.getElementById('fStatus')?.value;
  const priority = document.getElementById('fPriority')?.value;
  const category_id = document.getElementById('fCategory')?.value;
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (category_id) params.set('category_id', category_id);
  params.set('page', page);
  params.set('limit', 15);
  return params.toString();
}

async function loadComplaintsTable(showCoordinatorCol = false) {
  const query = buildQuery(CR_PAGE);
  const { complaints, pagination } = await Api.get(`/complaints?${query}`);

  const wrap = document.getElementById('complaintsTableWrap');
  if (complaints.length === 0) {
    wrap.innerHTML = `<div class="text-center text-muted py-5"><i class="bi bi-inbox fs-1"></i><p class="mt-2">No complaints found.</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-responsive">
    <table class="table align-middle">
      <thead class="table-light">
        <tr>
          <th>Complaint ID</th><th>Title</th><th>Category</th>
          ${showCoordinatorCol ? '<th>Coordinator</th>' : ''}
          <th>Priority</th><th>Submitted</th><th>Deadline</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${complaints.map(c => `
          <tr>
            <td><strong>${c.complaint_code}</strong></td>
            <td>${escapeHtml(c.title)}</td>
            <td>${escapeHtml(c.category_name || '—')}</td>
            ${showCoordinatorCol ? `<td>${escapeHtml(c.coordinator_name || '—')}</td>` : ''}
            <td><span class="priority-${c.priority}">${c.priority}</span></td>
            <td>${formatDate(c.submitted_at)}</td>
            <td><small class="text-${c.deadline_info.level}">${c.deadline_info.text}</small></td>
            <td><span class="${statusBadgeClass(c.status)}">${c.status}</span></td>
            <td><a href="complaint-details.html?id=${c.id}" class="btn btn-sm btn-cr-outline">View</a></td>
          </tr>`).join('')}
      </tbody>
    </table>
    </div>
    <div class="d-flex justify-content-between align-items-center mt-2">
      <small class="text-muted">Showing page ${pagination.page} of ${pagination.pages || 1} (${pagination.total} total)</small>
      <div>
        <button class="btn btn-sm btn-cr-outline" ${pagination.page <= 1 ? 'disabled' : ''} onclick="changePage(-1)">Prev</button>
        <button class="btn btn-sm btn-cr-outline" ${pagination.page >= pagination.pages ? 'disabled' : ''} onclick="changePage(1)">Next</button>
      </div>
    </div>`;
}

function changePage(delta) {
  CR_PAGE = Math.max(1, CR_PAGE + delta);
  loadComplaintsTable(window.CR_SHOW_COORD || false);
}

function wireFilterEvents(showCoordinatorCol = false) {
  window.CR_SHOW_COORD = showCoordinatorCol;
  document.getElementById('fApply').addEventListener('click', () => { CR_PAGE = 1; loadComplaintsTable(showCoordinatorCol); });
  document.getElementById('fSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); CR_PAGE = 1; loadComplaintsTable(showCoordinatorCol); } });
}

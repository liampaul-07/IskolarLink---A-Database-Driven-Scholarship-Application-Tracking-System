// Applicants test console: list, search, create, edit, archive. Depends on common.js.

const $ = (id) => document.getElementById(id);

const me = auth.guard();
renderTopbar();

const state = { page: 1, limit: 10, total: 0, applicants: [] };

const money = (n) => (n === null || n === undefined ? '-' : '₱' + Number(n).toLocaleString('en-PH'));

// Circular initials avatar (no profile photos exist). The color is picked from the name,
// so the same person always gets the same one.
function initials(a) {
  const first = (a.firstName || '').trim().charAt(0);
  const last = (a.lastName || '').trim().charAt(0);
  return (first + last).toUpperCase() || '?';
}
function avatarTone(name) {
  let sum = 0;
  for (const ch of String(name)) sum += ch.charCodeAt(0);
  return 'av-' + ((sum % 4) + 1);
}

// ---------- Summary cards ----------
async function loadSummary() {
  try {
    const res = await api('GET', '/applicants?limit=1');
    $('stat-total').textContent = res.data.pagination.total;
  } catch (err) {
    $('stat-total').textContent = '-';
  }
}

async function refreshAfterChange() {
  await loadApplicants();
  loadSummary();
}

// ---------- List ----------
async function loadApplicants() {
  const params = new URLSearchParams();
  const q = $('filter-q').value.trim();
  if (q) params.set('q', q);
  if ($('filter-archived').checked) params.set('archived', 'true');
  params.set('page', state.page);
  params.set('limit', state.limit);

  try {
    const res = await api('GET', '/applicants?' + params.toString());
    state.applicants = res.data.items;
    state.total = res.data.pagination.total;
    renderApplicants();
  } catch (err) {
    showError(err);
  }
}

function renderApplicants() {
  const body = $('applicants-body');
  body.replaceChildren();
  if (state.applicants.length === 0) {
    body.append(el('tr', {}, el('td', { class: 'empty', colspan: 6 }, 'No applicants found.')));
  }

  for (const a of state.applicants) {
    const fullName = [a.lastName + ',', a.firstName, a.middleName].filter(Boolean).join(' ');
    body.append(el('tr', {},
      el('td', {},
        el('div', { class: 'person' },
          el('span', { class: 'avatar ' + avatarTone(fullName), 'aria-hidden': 'true' }, initials(a)),
          el('div', { class: 'person-text' },
            el('div', { class: 'person-name' },
              el('strong', {}, fullName),
              a.isArchived ? [' ', el('span', { class: 'tag archived' }, 'archived')] : ''),
            el('div', { class: 'sub' }, a.address)))),
      el('td', { class: 'nowrap' }, a.birthDate),
      el('td', {},
        el('div', { class: 'cell-main' }, a.school || '-'),
        a.courseOrStrand ? el('div', { class: 'sub' }, a.courseOrStrand) : ''),
      el('td', { class: 'num' }, a.gwa ?? '-'),
      el('td', { class: 'num' }, money(a.householdIncome)),
      el('td', { class: 'actions' },
        el('button', { class: 'btn small', type: 'button', onclick: () => openForm(a.id) }, 'Edit'),
        a.isArchived
          ? el('button', { class: 'btn small', type: 'button', onclick: () => setArchived(a, false) }, 'Restore')
          : el('button', { class: 'btn small danger', type: 'button', onclick: () => setArchived(a, true) }, 'Archive'))
    ));
  }

  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $('pager-info').textContent = `Page ${state.page} of ${pages} (${state.total} total)`;
  $('btn-prev').disabled = state.page <= 1;
  $('btn-next').disabled = state.page >= pages;
  $('stat-shown').textContent = state.total;
}

// ---------- Add / edit ----------
const FIELDS = {
  firstName: 'a-first', middleName: 'a-middle', lastName: 'a-last', birthDate: 'a-birth', sex: 'a-sex',
  email: 'a-email', contactNumber: 'a-phone', address: 'a-address', school: 'a-school',
  courseOrStrand: 'a-course', yearLevel: 'a-year', gwa: 'a-gwa', householdIncome: 'a-income'
};

async function openForm(id) {
  hideErrorBox('applicant-errors');
  $('applicant-form').reset();
  $('applicant-id').value = id || '';
  $('applicant-dialog-title').textContent = id ? 'Edit applicant' : 'New applicant';
  $('applicant-apps').hidden = true;

  if (id) {
    try {
      const res = await api('GET', '/applicants/' + id); // fresh copy, including their applications
      const a = res.data;
      for (const [key, inputId] of Object.entries(FIELDS)) $(inputId).value = a[key] ?? '';

      const list = $('applicant-apps-list');
      list.replaceChildren();
      if (a.applications.length === 0) list.append(el('li', { class: 'muted' }, 'No applications yet.'));
      for (const app of a.applications) {
        list.append(el('li', {},
          el('code', {}, app.referenceNo), ' ', app.programName, ' (', app.academicYear, ') ',
          phaseTag(app.phase), app.isArchived ? [' ', el('span', { class: 'tag archived' }, 'archived')] : ''));
      }
      $('applicant-apps').hidden = false;
    } catch (err) {
      showError(err);
      return;
    }
  }
  $('applicant-dialog').showModal();
}

$('applicant-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideErrorBox('applicant-errors');

  const id = $('applicant-id').value;
  const body = {};
  for (const [key, inputId] of Object.entries(FIELDS)) body[key] = $(inputId).value;

  try {
    const res = id ? await api('PUT', '/applicants/' + id, body) : await api('POST', '/applicants', body);
    $('applicant-dialog').close();
    showMessage(res.message);
    await refreshAfterChange();
  } catch (err) {
    fillErrorBox('applicant-errors', err); // dialog stays open so the staff member can fix the input
  }
});

$('btn-applicant-cancel').addEventListener('click', () => $('applicant-dialog').close());

// ---------- Archive / restore ----------
async function setArchived(applicant, archived) {
  const name = `${applicant.firstName} ${applicant.lastName}`;
  if (!confirm(`${archived ? 'Archive' : 'Restore'} "${name}"?`)) return;
  try {
    const res = await api('PATCH', `/applicants/${applicant.id}/archive`, { archived });
    showMessage(res.message);
    await refreshAfterChange();
  } catch (err) {
    showError(err); // e.g. 409: still has open applications
  }
}

// ---------- Wiring ----------
$('btn-new').addEventListener('click', () => openForm(null));
$('btn-prev').addEventListener('click', () => { state.page -= 1; loadApplicants(); });
$('btn-next').addEventListener('click', () => { state.page += 1; loadApplicants(); });
$('filter-archived').addEventListener('change', () => { state.page = 1; loadApplicants(); });

let searchTimer = null;
$('filter-q').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.page = 1; loadApplicants(); }, 300);
});

if (me) {
  loadApplicants();
  loadSummary();
}
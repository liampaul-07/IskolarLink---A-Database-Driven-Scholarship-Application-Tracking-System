// Applications test console: list, filters, create, edit, archive, detail view with history.
// Depends on common.js.

const $ = (id) => document.getElementById(id);

const me = auth.guard();
renderTopbar();

const state = { page: 1, limit: 10, total: 0, applications: [] };

const money = (n) => (n === null || n === undefined ? '-' : '₱' + Number(n).toLocaleString('en-PH'));
const yesNo = (b) => (b ? 'Yes' : 'No');

// ---------- Filters ----------
async function loadFilterOptions() {
  try {
    const res = await api('GET', '/programs?limit=100');
    fillSelect($('filter-program'), res.data.items.map((p) => ({ value: p.id, label: p.name })), 'All programs');
  } catch (err) {
    showError(err);
  }
}

// The tier filter only makes sense once a program is chosen (tiers belong to a program).
async function loadTierFilter() {
  const programId = $('filter-program').value;
  const select = $('filter-tier');
  if (!programId) {
    fillSelect(select, [], 'Choose a program first');
    select.disabled = true;
    return;
  }
  try {
    const res = await api('GET', `/programs/${programId}/tiers`);
    fillSelect(select, res.data.map((t) => ({ value: t.id, label: t.tierName })), 'Any tier');
    select.disabled = false;
  } catch (err) {
    showError(err);
  }
}

function currentFilters() {
  const params = new URLSearchParams();
  const add = (key, value) => { if (value) params.set(key, value); };
  add('q', $('filter-q').value.trim());
  add('phase', $('filter-phase').value);
  add('eligibility', $('filter-eligibility').value);
  add('programId', $('filter-program').value);
  add('tierId', $('filter-tier').disabled ? '' : $('filter-tier').value);
  add('dateFrom', $('filter-from').value);
  add('dateTo', $('filter-to').value);
  if ($('filter-archived').checked) params.set('archived', 'true');
  return params;
}

// ---------- List ----------
async function loadApplications() {
  const params = currentFilters();
  params.set('page', state.page);
  params.set('limit', state.limit);
  try {
    const res = await api('GET', '/applications?' + params.toString());
    state.applications = res.data.items;
    state.total = res.data.pagination.total;
    renderApplications();
  } catch (err) {
    showError(err); // e.g. 400 for a bad filter value
  }
}

function renderApplications() {
  const body = $('applications-body');
  body.replaceChildren();
  if (state.applications.length === 0) {
    body.append(el('tr', {}, el('td', { class: 'empty', colspan: 9 }, 'No applications found.')));
  }

  for (const a of state.applications) {
    body.append(el('tr', {},
      el('td', {}, el('code', {}, a.referenceNo), a.isArchived ? [' ', el('span', { class: 'tag archived' }, 'archived')] : ''),
      el('td', {}, a.applicantName),
      el('td', {}, a.programName),
      el('td', { class: 'nowrap' }, a.academicYear),
      el('td', {}, phaseTag(a.phase)),
      el('td', {}, eligibilityTag(a.eligibility)),
      el('td', {}, a.tier || '-'),
      el('td', { class: 'nowrap' }, dateOnly(a.createdAt)),
      el('td', { class: 'actions' },
        el('button', { class: 'btn small', type: 'button', onclick: () => openDetail(a.id) }, 'View'),
        el('button', { class: 'btn small', type: 'button', onclick: () => openForm(a) }, 'Edit'),
        a.isArchived
          ? el('button', { class: 'btn small', type: 'button', onclick: () => setArchived(a, false) }, 'Restore')
          : el('button', { class: 'btn small danger', type: 'button', onclick: () => setArchived(a, true) }, 'Archive'))
    ));
  }

  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $('pager-info').textContent = `Page ${state.page} of ${pages} (${state.total} total)`;
  $('btn-prev').disabled = state.page <= 1;
  $('btn-next').disabled = state.page >= pages;
}

// ---------- New / edit ----------
async function openForm(application) {
  hideErrorBox('application-errors');
  $('application-form').reset();
  const editing = Boolean(application);
  $('application-id').value = editing ? application.id : '';
  $('application-dialog-title').textContent = editing ? `Edit ${application.referenceNo}` : 'New application';

  // Applicant and program are fixed once the application exists.
  $('f-applicant').disabled = editing;
  $('f-program').disabled = editing;

  try {
    if (editing) {
      const res = await api('GET', '/applications/' + application.id);
      const a = res.data;
      fillSelect($('f-applicant'), [{ value: a.applicant.id, label: `${a.applicant.lastName}, ${a.applicant.firstName}` }]);
      fillSelect($('f-program'), [{ value: a.program.id, label: a.program.name }]);
      $('f-year').value = a.academicYear;
      $('f-docs').checked = a.docsComplete;
      $('f-remarks').value = a.remarks ?? '';
    } else {
      // Test-console shortcut: the first 100 applicants and active programs are enough here.
      const [applicants, programs] = await Promise.all([
        api('GET', '/applicants?limit=100'),
        api('GET', '/programs?status=active&limit=100')
      ]);
      fillSelect($('f-applicant'),
        applicants.data.items.map((a) => ({ value: a.id, label: `${a.lastName}, ${a.firstName} (${a.birthDate})` })),
        'Select an applicant');
      fillSelect($('f-program'), programs.data.items.map((p) => ({ value: p.id, label: p.name })), 'Select a program');
      $('f-year').value = '2026-2027';
    }
  } catch (err) {
    showError(err);
    return;
  }
  $('application-dialog').showModal();
}

$('application-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideErrorBox('application-errors');

  const id = $('application-id').value;
  try {
    let res;
    if (id) {
      res = await api('PUT', '/applications/' + id, {
        academicYear: $('f-year').value,
        docsComplete: $('f-docs').checked,
        remarks: $('f-remarks').value
      });
    } else {
      res = await api('POST', '/applications', {
        applicantId: $('f-applicant').value,
        programId: $('f-program').value,
        academicYear: $('f-year').value,
        docsComplete: $('f-docs').checked,
        remarks: $('f-remarks').value
      });
    }
    $('application-dialog').close();
    showMessage(id ? res.message : `${res.message} Reference number: ${res.data.referenceNo}`);
    state.page = 1;
    await loadApplications();
  } catch (err) {
    fillErrorBox('application-errors', err); // keeps the dialog open (409 duplicates show here too)
  }
});

$('btn-application-cancel').addEventListener('click', () => $('application-dialog').close());

// ---------- Archive / restore ----------
async function setArchived(application, archived) {
  if (!confirm(`${archived ? 'Archive' : 'Restore'} ${application.referenceNo}?`)) return;
  try {
    const res = await api('PATCH', `/applications/${application.id}/archive`, { archived });
    showMessage(res.message);
    await loadApplications();
  } catch (err) {
    showError(err);
  }
}

// ---------- Detail view ----------
function infoRow(label, value) {
  return [el('dt', {}, label), el('dd', {}, value === null || value === undefined || value === '' ? '-' : value)];
}

async function openDetail(id) {
  try {
    const res = await api('GET', '/applications/' + id);
    const a = res.data;
    $('detail-title').textContent = `Application ${a.referenceNo}`;

    const grid = el('dl', { class: 'detail-grid' },
      infoRow('Applicant', `${a.applicant.firstName} ${a.applicant.middleName || ''} ${a.applicant.lastName}`.replace(/\s+/g, ' ')),
      infoRow('Birth date', a.applicant.birthDate),
      infoRow('School / course', [a.applicant.school, a.applicant.courseOrStrand].filter(Boolean).join(', ')),
      infoRow('GWA / income', `${a.applicant.gwa ?? '-'} / ${money(a.applicant.householdIncome)}`),
      infoRow('Program', `${a.program.name} (${a.program.type === 'grant' ? 'grant' : 'non-grant'})`),
      infoRow('Academic year', a.academicYear),
      infoRow('Phase', phaseTag(a.phase)),
      infoRow('Eligibility', eligibilityTag(a.eligibility)),
      infoRow('Ineligibility reason', a.ineligibilityReason),
      infoRow('Tier', a.tier ? `${a.tier.tierName}${a.tier.defaultAmount !== null ? ' (' + money(a.tier.defaultAmount) + ')' : ''}` : null),
      infoRow('Requirements checked', yesNo(a.docsComplete)),
      infoRow('Internal remarks', a.remarks),
      infoRow('Created', dateTime(a.createdAt)),
      infoRow('Last updated', dateTime(a.updatedAt))
    );

    const schedule = a.grantSchedule
      ? el('p', {}, `Release: ${a.grantSchedule.releaseDate} at ${a.grantSchedule.venue}, ${money(a.grantSchedule.amount)}`)
      : el('p', { class: 'muted' }, a.program.type === 'grant' ? 'No release schedule yet.' : 'Not applicable (non-grant program).');

    const timeline = el('ol', { class: 'timeline' },
      a.history.map((h) => el('li', {},
        el('strong', {}, h.oldPhase ? `${h.oldPhase} → ${h.newPhase}` : h.newPhase),
        el('div', { class: 'sub' }, `${dateTime(h.changedAt)} by ${h.changedByName}`),
        h.remarks ? el('div', {}, h.remarks) : '')));

    $('detail-content').replaceChildren(
      grid,
      el('h3', {}, 'Grant release schedule'), schedule,
      el('h3', {}, 'Status history'), timeline);
    $('detail-dialog').showModal();
    $('detail-dialog').scrollTop = 0; // the browser focuses the Close button, which scrolls a tall dialog to the bottom
  } catch (err) {
    showError(err);
  }
}

$('btn-detail-close').addEventListener('click', () => $('detail-dialog').close());

// ---------- Wiring ----------
function reload() { state.page = 1; loadApplications(); }

$('btn-new').addEventListener('click', () => openForm(null));
$('btn-prev').addEventListener('click', () => { state.page -= 1; loadApplications(); });
$('btn-next').addEventListener('click', () => { state.page += 1; loadApplications(); });

let searchTimer = null;
$('filter-q').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(reload, 300);
});
for (const id of ['filter-phase', 'filter-eligibility', 'filter-tier', 'filter-from', 'filter-to', 'filter-archived']) {
  $(id).addEventListener('change', reload);
}
$('filter-program').addEventListener('change', async () => {
  await loadTierFilter(); // tiers depend on the chosen program
  reload();
});
$('btn-clear').addEventListener('click', async () => {
  for (const id of ['filter-q', 'filter-phase', 'filter-eligibility', 'filter-program', 'filter-from', 'filter-to']) $(id).value = '';
  $('filter-archived').checked = false;
  await loadTierFilter();
  reload();
});

async function start() {
  await loadFilterOptions();
  await loadTierFilter();
  await loadApplications();
}
if (me) start();
// Programs test console: list, filter, create, edit, archive, and manage tiers.
// Depends on common.js (api, el, showMessage, showError).

const $ = (id) => document.getElementById(id);

const state = { page: 1, limit: 10, total: 0, programs: [], tiersProgram: null };

const money = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-PH'));
const typeLabel = (t) => (t === 'grant' ? 'Grant' : 'Non-grant');

// ---------- List ----------
async function loadPrograms() {
  const params = new URLSearchParams();
  const q = $('filter-q').value.trim();
  if (q) params.set('q', q);
  if ($('filter-type').value) params.set('type', $('filter-type').value);
  if ($('filter-status').value) params.set('status', $('filter-status').value);
  if ($('filter-archived').checked) params.set('archived', 'true');
  params.set('page', state.page);
  params.set('limit', state.limit);

  try {
    const res = await api('GET', '/programs?' + params.toString());
    state.programs = res.data.items;
    state.total = res.data.pagination.total;
    renderPrograms();
  } catch (err) {
    showError(err);
  }
}

function renderPrograms() {
  const body = $('programs-body');
  body.replaceChildren();

  if (state.programs.length === 0) {
    body.append(el('tr', {}, el('td', { class: 'empty', colspan: 6 }, 'No programs found.')));
  }

  for (const p of state.programs) {
    const statusTags = [el('span', { class: 'tag ' + p.status }, p.status)];
    if (p.isArchived) statusTags.push(' ', el('span', { class: 'tag archived' }, 'archived'));

    body.append(el('tr', {},
      el('td', {}, el('strong', {}, p.name), p.description ? el('div', { class: 'sub' }, p.description) : ''),
      el('td', {}, typeLabel(p.type)),
      el('td', {}, statusTags),
      el('td', {}, p.minGwa ?? '-'),
      el('td', {}, money(p.maxHouseholdIncome)),
      el('td', { class: 'actions' },
        el('button', { class: 'btn small', type: 'button', onclick: () => openProgramForm(p) }, 'Edit'),
        el('button', { class: 'btn small', type: 'button', onclick: () => openTiers(p) }, 'Tiers'),
        p.isArchived
          ? el('button', { class: 'btn small', type: 'button', onclick: () => setArchived(p, false) }, 'Restore')
          : el('button', { class: 'btn small danger', type: 'button', onclick: () => setArchived(p, true) }, 'Archive')
      )
    ));
  }

  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $('pager-info').textContent = `Page ${state.page} of ${pages} (${state.total} total)`;
  $('btn-prev').disabled = state.page <= 1;
  $('btn-next').disabled = state.page >= pages;
}

// ---------- Add / edit ----------
function clearErrors(boxId) {
  const box = $(boxId);
  box.hidden = true;
  box.replaceChildren();
}

function showFormErrors(boxId, err) {
  const box = $(boxId);
  box.replaceChildren(el('strong', {}, err.message));
  if (err.errors && err.errors.length) {
    box.append(el('ul', {}, err.errors.map((e) => el('li', {}, `${e.field}: ${e.message}`))));
  }
  box.hidden = false;
}

function openProgramForm(program) {
  clearErrors('program-errors');
  $('program-form').reset();
  $('program-id').value = program ? program.id : '';
  $('program-dialog-title').textContent = program ? 'Edit program' : 'New program';
  if (program) {
    $('f-name').value = program.name;
    $('f-type').value = program.type;
    $('f-status').value = program.status;
    $('f-description').value = program.description ?? '';
    $('f-criteria').value = program.criteria ?? '';
    $('f-min-gwa').value = program.minGwa ?? '';
    $('f-max-income').value = program.maxHouseholdIncome ?? '';
  }
  $('program-dialog').showModal();
}

$('program-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors('program-errors');

  const id = $('program-id').value;
  const body = {
    name: $('f-name').value,
    type: $('f-type').value,
    status: $('f-status').value,
    description: $('f-description').value,
    criteria: $('f-criteria').value,
    minGwa: $('f-min-gwa').value,
    maxHouseholdIncome: $('f-max-income').value
  };

  try {
    const res = id ? await api('PUT', '/programs/' + id, body) : await api('POST', '/programs', body);
    $('program-dialog').close();
    showMessage(res.message);
    await loadPrograms(); // refresh the table after every change
  } catch (err) {
    showFormErrors('program-errors', err); // keep the dialog open so the user can fix it
  }
});

$('btn-program-cancel').addEventListener('click', () => $('program-dialog').close());

// ---------- Archive / restore ----------
async function setArchived(program, archived) {
  const verb = archived ? 'Archive' : 'Restore';
  if (!confirm(`${verb} "${program.name}"?`)) return;
  try {
    const res = await api('PATCH', `/programs/${program.id}/archive`, { archived });
    showMessage(res.message);
    await loadPrograms();
  } catch (err) {
    showError(err);
  }
}

// ---------- Tiers ----------
async function openTiers(program) {
  state.tiersProgram = program;
  $('tiers-title').textContent = `Tiers: ${program.name}`;
  resetTierForm();
  $('tiers-dialog').showModal();
  await loadTiers();
}

async function loadTiers() {
  const body = $('tiers-body');
  try {
    const res = await api('GET', `/programs/${state.tiersProgram.id}/tiers`);
    body.replaceChildren();
    if (res.data.length === 0) {
      body.append(el('tr', {}, el('td', { class: 'empty', colspan: 4 }, 'No tiers yet.')));
    }
    for (const t of res.data) {
      body.append(el('tr', {},
        el('td', {}, t.tierName),
        el('td', {}, t.description ?? ''),
        el('td', {}, money(t.defaultAmount)),
        el('td', { class: 'actions' },
          el('button', { class: 'btn small', type: 'button', onclick: () => editTier(t) }, 'Edit'),
          el('button', { class: 'btn small danger', type: 'button', onclick: () => deleteTier(t) }, 'Delete')
        )
      ));
    }
  } catch (err) {
    showFormErrors('tier-errors', err);
  }
}

function resetTierForm() {
  clearErrors('tier-errors');
  $('tier-form').reset();
  $('tier-id').value = '';
  $('tier-form-title').textContent = 'Add tier';
}

function editTier(tier) {
  clearErrors('tier-errors');
  $('tier-id').value = tier.id;
  $('t-name').value = tier.tierName;
  $('t-description').value = tier.description ?? '';
  $('t-amount').value = tier.defaultAmount ?? '';
  $('tier-form-title').textContent = 'Edit tier';
}

async function deleteTier(tier) {
  if (!confirm(`Delete tier "${tier.tierName}"?`)) return;
  clearErrors('tier-errors');
  try {
    const res = await api('DELETE', '/tiers/' + tier.id);
    showMessage(res.message);
    await loadTiers();
  } catch (err) {
    showFormErrors('tier-errors', err);
  }
}

$('tier-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors('tier-errors');

  const id = $('tier-id').value;
  const body = {
    tierName: $('t-name').value,
    description: $('t-description').value,
    defaultAmount: $('t-amount').value
  };

  try {
    const res = id
      ? await api('PUT', '/tiers/' + id, body)
      : await api('POST', `/programs/${state.tiersProgram.id}/tiers`, body);
    showMessage(res.message);
    resetTierForm();
    await loadTiers();
  } catch (err) {
    showFormErrors('tier-errors', err);
  }
});

$('btn-tier-reset').addEventListener('click', resetTierForm);
$('btn-tiers-close').addEventListener('click', () => $('tiers-dialog').close());

// ---------- Wiring ----------
$('btn-new').addEventListener('click', () => openProgramForm(null));
$('btn-prev').addEventListener('click', () => { state.page -= 1; loadPrograms(); });
$('btn-next').addEventListener('click', () => { state.page += 1; loadPrograms(); });

let searchTimer = null;
$('filter-q').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.page = 1; loadPrograms(); }, 300);
});
for (const id of ['filter-type', 'filter-status', 'filter-archived']) {
  $(id).addEventListener('change', () => { state.page = 1; loadPrograms(); });
}

loadPrograms();
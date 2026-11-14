// Applications test console: list, filters, create, edit, archive, detail view with history,
// workflow panel, one-time PIN display and PIN reissue.
// Depends on common.js and confirm.js.

const $ = (id) => document.getElementById(id);

const me = auth.guard();
renderTopbar();

const state = { page: 1, limit: 10, total: 0, applications: [] };

const money = (n) => (n === null || n === undefined ? '-' : '₱' + Number(n).toLocaleString('en-PH'));
const yesNo = (b) => (b ? 'Yes' : 'No');

// Allowed phase moves (the server enforces these too, the UI only offers the valid ones).
const WORKFLOW = {
  'Submitted': ['Under Review'],
  'Under Review': ['For Evaluation', 'Ineligible'],
  'For Evaluation': ['Approved', 'Ineligible'],
  'Approved': ['Granted', 'For Evaluation'], // Approved -> For Evaluation is the admin-only "reopen"
  'Ineligible': [],
  'Granted': []
};

// ---------- Summary cards ----------
// Each card is a real count from the server (not filtered by the search boxes, archived excluded).
async function countApplications(filter) {
  const params = new URLSearchParams(filter);
  params.set('limit', 1);
  const res = await api('GET', '/applications?' + params.toString());
  return res.data.pagination.total;
}

async function loadSummary() {
  const cards = [
    ['stat-total', {}],
    ['stat-submitted', { phase: 'Submitted' }],
    ['stat-review', { phase: 'Under Review' }],
    ['stat-approved', { phase: 'Approved' }]
  ];
  await Promise.all(cards.map(async ([id, filter]) => {
    try {
      $(id).textContent = await countApplications(filter);
    } catch (err) {
      $(id).textContent = '-';
    }
  }));
}

// Reload the list and the summary cards after anything that changes data.
async function refreshAfterChange() {
  await loadApplications();
  loadSummary();
}

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
  closeRowMenu(); // the row that opened a menu may be gone after a reload
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
        el('button', { class: 'btn small btn-view', type: 'button', onclick: () => openDetail(a.id) }, 'View'),
        el('button', {
          class: 'btn small icon-btn',
          type: 'button',
          'aria-label': `More actions for ${a.referenceNo}`,
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          onclick: (event) => openRowMenu(event.currentTarget, a)
        }, '⋮'))
    ));
  }

  const pages = Math.max(1, Math.ceil(state.total / state.limit));
  $('pager-info').textContent = `Page ${state.page} of ${pages} (${state.total} total)`;
  $('btn-prev').disabled = state.page <= 1;
  $('btn-next').disabled = state.page >= pages;
}

// ---------- Three-dot menu (Edit, New PIN, Archive / Restore) ----------
// One shared menu lives on the page and is moved next to whichever button opened it,
// so the table never clips it.
const rowMenu = el('div', { class: 'row-menu', role: 'menu', hidden: true });
document.body.append(rowMenu);
let rowMenuButton = null;

function closeRowMenu() {
  rowMenu.hidden = true;
  rowMenu.replaceChildren();
  if (rowMenuButton) rowMenuButton.setAttribute('aria-expanded', 'false');
  rowMenuButton = null;
}

function menuItem(label, handler, danger) {
  return el('button', {
    class: 'menu-item' + (danger ? ' danger' : ''),
    type: 'button',
    role: 'menuitem',
    onclick: () => { closeRowMenu(); handler(); }
  }, label);
}

function openRowMenu(button, application) {
  if (rowMenuButton === button) { closeRowMenu(); return; } // second click closes it
  closeRowMenu();

  const items = [menuItem('Edit', () => openForm(application))];
  if (!application.isArchived) items.push(menuItem('New PIN', () => reissuePin(application)));
  items.push(application.isArchived
    ? menuItem('Restore', () => setArchived(application, false))
    : menuItem('Archive', () => setArchived(application, true), true));

  rowMenu.replaceChildren(...items);
  rowMenu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  rowMenuButton = button;

  // Place it under the button, right-aligned; flip above if there is no room below.
  const rect = button.getBoundingClientRect();
  const width = rowMenu.offsetWidth;
  const height = rowMenu.offsetHeight;
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 8) top = rect.top - height - 6;
  rowMenu.style.left = Math.max(8, rect.right - width) + 'px';
  rowMenu.style.top = Math.max(8, top) + 'px';
  items[0].focus();
}

document.addEventListener('click', (event) => {
  if (rowMenu.hidden) return;
  if (rowMenu.contains(event.target)) return;
  if (rowMenuButton && rowMenuButton.contains(event.target)) return;
  closeRowMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || rowMenu.hidden) return;
  const button = rowMenuButton;
  closeRowMenu();
  if (button) button.focus();
});
window.addEventListener('scroll', () => { if (!rowMenu.hidden) closeRowMenu(); }, true);
window.addEventListener('resize', () => { if (!rowMenu.hidden) closeRowMenu(); });

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
    if (!id) showPin(res.data.referenceNo, res.data.lookupPin, 'Application created');
    state.page = 1;
    await refreshAfterChange();
  } catch (err) {
    fillErrorBox('application-errors', err); // keeps the dialog open (409 duplicates show here too)
  }
});

$('btn-application-cancel').addEventListener('click', () => $('application-dialog').close());

// ---------- Archive / restore ----------
async function setArchived(application, archived) {
  const ok = await uiConfirm(archived
    ? {
        title: 'Archive this application?',
        message: `${application.referenceNo} will be hidden from the main list. You can restore it later.`,
        confirmText: 'Archive',
        danger: true
      }
    : {
        title: 'Restore this application?',
        message: `${application.referenceNo} will go back to the main list.`,
        confirmText: 'Restore'
      });
  if (!ok) return;
  try {
    const res = await api('PATCH', `/applications/${application.id}/archive`, { archived });
    showMessage(res.message);
    await refreshAfterChange();
  } catch (err) {
    showError(err);
  }
}

// ---------- Detail view ----------
function infoRow(label, value) {
  return [el('dt', {}, label), el('dd', {}, value === null || value === undefined || value === '' ? '-' : value)];
}

// Runs one workflow action. On success the detail view and the list are reloaded.
// On failure the server message is shown inside the workflow panel (the page banner is
// hidden behind the dialog).
async function runAction(id, method, path, body, notice) {
  hideErrorBox('workflow-errors');
  try {
    const res = await api(method, path, body);
    await openDetail(id, res.message || notice);
    await refreshAfterChange();
  } catch (err) {
    fillErrorBox('workflow-errors', err);
  }
}

function showWorkflowProblem(message) {
  fillErrorBox('workflow-errors', { message, errors: [] });
}

// Eligibility and tier picker (only while the phase is For Evaluation).
function buildEligibilityBox(id, a, tiers, tiersFailed) {
  const isEligible = a.eligibility === 'eligible';
  const select = el('select', { id: 'wf-tier' });
  fillSelect(select,
    tiers.map((t) => ({
      value: t.id,
      label: t.tierName + (t.defaultAmount !== null && t.defaultAmount !== undefined ? ` (${money(t.defaultAmount)})` : '')
    })),
    'Select a tier');
  if (a.tier && a.tier.id) select.value = a.tier.id;

  const box = el('div', { class: 'workflow-box' },
    el('h4', {}, 'Eligibility and tier'),
    el('p', { class: 'muted' }, isEligible
      ? 'This applicant is marked eligible. You can change the tier below.'
      : 'Eligibility is still pending. To mark the applicant as not eligible, use "Mark as Ineligible" below.'),
    el('div', { class: 'field' },
      el('label', { for: 'wf-tier' }, 'Tier'),
      select));

  if (tiersFailed) {
    box.append(el('p', { class: 'workflow-hint' }, 'Could not load the tiers of this program.'));
  } else if (tiers.length === 0) {
    box.append(el('p', { class: 'workflow-hint' }, 'This program has no tiers yet. An admin can add them on the Programs page.'));
  }

  box.append(el('button', {
    class: 'btn primary small',
    type: 'button',
    onclick: () => {
      const tierId = select.value;
      if (isEligible) {
        if (!tierId) { showWorkflowProblem('Please select a tier first.'); return; }
        runAction(id, 'PATCH', `/applications/${id}/tier`, { tierId }, 'Tier saved.');
      } else {
        const body = { eligibility: 'eligible' };
        if (tierId) body.tierId = tierId;
        runAction(id, 'PATCH', `/applications/${id}/eligibility`, body, 'Marked as eligible.');
      }
    }
  }, isEligible ? 'Save tier' : 'Mark as eligible'));

  return box;
}

// Phase move buttons, with the remarks and reason boxes.
function buildMovesBox(id, a) {
  const isAdmin = Boolean(me && me.role === 'admin');
  const moves = (WORKFLOW[a.phase] || []).filter((m) => !(a.phase === 'Approved' && m === 'For Evaluation' && !isAdmin));

  const box = el('div', { class: 'workflow-box' }, el('h4', {}, 'Move to the next phase'));

  if (moves.length === 0) {
    box.append(el('p', { class: 'workflow-final' }, a.phase === 'Approved' && !isAdmin
      ? 'No moves available for your role.'
      : `${a.phase} is a final phase. No more moves are possible.`));
    return box;
  }

  const isReopen = (m) => a.phase === 'Approved' && m === 'For Evaluation';
  const needsReason = (m) => m === 'Ineligible' || isReopen(m);
  const anyReason = moves.some(needsReason);

  const remarksInput = el('input', { id: 'wf-remarks', type: 'text', placeholder: 'Optional note for the history', autocomplete: 'off' });
  const reasonInput = el('textarea', { id: 'wf-reason', rows: '2', placeholder: 'Required for Ineligible and for reopening' });

  box.append(el('div', { class: 'field' }, el('label', { for: 'wf-remarks' }, 'Remarks (optional)'), remarksInput));
  if (anyReason) {
    box.append(el('div', { class: 'field' }, el('label', { for: 'wf-reason' }, 'Reason'), reasonInput));
  }

  const buttons = [];
  for (const m of moves) {
    let blocked = '';
    if (a.phase === 'Under Review' && m === 'For Evaluation' && !a.docsComplete) {
      blocked = 'Requirements are not marked as received yet. Edit the application and tick the checkbox first.';
    }
    if (a.phase === 'For Evaluation' && m === 'Approved' && !(a.eligibility === 'eligible' && a.tier)) {
      blocked = 'To approve, mark the applicant as eligible and choose a tier first.';
    }
    if (a.phase === 'Approved' && m === 'Granted' && a.program.type === 'grant' && !a.grantSchedule) {
      blocked = 'This is a grant program. Save a release schedule first (see the schedule section below).';
    }
    if (blocked) box.append(el('p', { class: 'workflow-hint' }, blocked));

    const label = isReopen(m) ? 'Reopen to For Evaluation' : (m === 'Ineligible' ? 'Mark as Ineligible' : `Move to ${m}`);
    const cls = m === 'Ineligible' ? 'btn danger' : (isReopen(m) ? 'btn' : 'btn primary');

    buttons.push(el('button', {
      class: cls,
      type: 'button',
      disabled: Boolean(blocked),
      onclick: async () => {
        const reason = reasonInput.value.trim();
        if (needsReason(m) && !reason) {
          showWorkflowProblem('Please write a reason first.');
          return;
        }

        // Confirmation (UI only): final moves are red and say they cannot be undone.
        let confirmOptions = null;
        if (m === 'Ineligible') {
          confirmOptions = {
            title: 'Mark as Ineligible?',
            message: 'This is a final phase and cannot be undone.',
            confirmText: 'Mark as Ineligible',
            danger: true
          };
        } else if (m === 'Granted') {
          confirmOptions = {
            title: 'Move to Granted?',
            message: 'This is a final phase and cannot be undone.',
            confirmText: 'Move to Granted'
          };
        } else if (isReopen(m)) {
          confirmOptions = {
            title: 'Reopen this application?',
            message: 'It will go back to For Evaluation.',
            confirmText: 'Reopen'
          };
        } else if (m === 'Approved') {
          confirmOptions = {
            title: 'Approve this application?',
            message: 'It will move to the Approved phase.',
            confirmText: 'Approve'
          };
        }
        if (confirmOptions && !(await uiConfirm(confirmOptions))) return;

        const body = { newPhase: m };
        const remarks = remarksInput.value.trim();
        if (remarks) body.remarks = remarks;
        if (needsReason(m)) body.reason = reason;
        runAction(id, 'PATCH', `/applications/${id}/phase`, body, `Moved to ${m}.`);
      }
    }, label));
  }
  box.append(el('div', { class: 'workflow-moves' }, buttons));
  return box;
}

// The whole workflow panel.
function buildWorkflowPanel(id, a, tiers, tiersFailed, notice) {
  const panel = el('section', { class: 'detail-card' }, el('h3', {}, 'Workflow'));
  if (notice) panel.append(el('div', { class: 'form-notice' }, notice));
  panel.append(el('div', { id: 'workflow-errors', class: 'form-errors', hidden: true }));

  if (a.isArchived) {
    panel.append(el('p', { class: 'workflow-hint' }, 'This application is archived. Restore it first before making any changes.'));
    return panel;
  }
  if (a.phase === 'For Evaluation') panel.append(buildEligibilityBox(id, a, tiers, tiersFailed));
  panel.append(buildMovesBox(id, a));
  return panel;
}

// Grant release schedule form (grant programs, phase Approved only).
function buildScheduleForm(id, a) {
  const s = a.grantSchedule;
  const release = el('input', { id: 'wf-release', type: 'date', value: s ? dateOnly(s.releaseDate) : false });
  const venue = el('input', { id: 'wf-venue', type: 'text', autocomplete: 'off', value: s ? s.venue : false });
  const amount = el('input', { id: 'wf-amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: s && s.amount !== null && s.amount !== undefined ? s.amount : false });

  const box = el('div', { class: 'workflow-box' },
    el('h4', {}, s ? 'Edit release schedule' : 'Add release schedule'),
    el('div', { class: 'row' },
      el('div', { class: 'field' }, el('label', { for: 'wf-release' }, 'Release date'), release),
      el('div', { class: 'field' }, el('label', { for: 'wf-amount' }, 'Amount'), amount)),
    el('div', { class: 'field' }, el('label', { for: 'wf-venue' }, 'Venue'), venue));

  const actions = [
    el('button', {
      class: 'btn primary small',
      type: 'button',
      onclick: () => {
        const text = amount.value.trim();
        const number = Number(text);
        runAction(id, 'PUT', `/applications/${id}/grant-schedule`, {
          releaseDate: release.value,
          venue: venue.value.trim(),
          amount: text !== '' && !Number.isNaN(number) ? number : text
        }, 'Release schedule saved.');
      }
    }, 'Save schedule')
  ];
  if (s) {
    actions.push(el('button', {
      class: 'btn danger small',
      type: 'button',
      onclick: async () => {
        const ok = await uiConfirm({
          title: 'Delete release schedule?',
          message: 'The saved release date, venue and amount will be removed.',
          confirmText: 'Delete schedule',
          danger: true
        });
        if (!ok) return;
        runAction(id, 'DELETE', `/applications/${id}/grant-schedule`, undefined, 'Release schedule deleted.');
      }
    }, 'Delete schedule'));
  }
  box.append(el('div', { class: 'workflow-moves' }, actions));
  return box;
}

// Small label + value block for the summary strip.
function summaryItem(label, content) {
  return el('div', { class: 'sum-item' }, el('div', { class: 'sum-label' }, label), el('div', {}, content));
}

async function openDetail(id, notice) {
  try {
    const res = await api('GET', '/applications/' + id);
    const a = res.data;
    $('detail-title').textContent = `Application ${a.referenceNo}`;

    // Tiers are only needed for the picker (phase For Evaluation, not archived).
    let tiers = [];
    let tiersFailed = false;
    if (a.phase === 'For Evaluation' && !a.isArchived) {
      try {
        const tierRes = await api('GET', `/programs/${a.program.id}/tiers`);
        tiers = tierRes.data;
      } catch (tierErr) {
        tiersFailed = true;
      }
    }

    const tierText = a.tier
      ? `${a.tier.tierName}${a.tier.defaultAmount !== null && a.tier.defaultAmount !== undefined ? ' (' + money(a.tier.defaultAmount) + ')' : ''}`
      : '-';

    const summary = el('div', { class: 'detail-summary' },
      summaryItem('Phase', phaseTag(a.phase)),
      summaryItem('Eligibility', eligibilityTag(a.eligibility)),
      summaryItem('Tier', tierText),
      summaryItem('Requirements', yesNo(a.docsComplete)),
      a.isArchived ? summaryItem('Status', el('span', { class: 'tag archived' }, 'archived')) : null);

    const applicantCard = el('section', { class: 'detail-card' },
      el('h3', {}, 'Applicant'),
      el('dl', { class: 'detail-grid' },
        infoRow('Name', `${a.applicant.firstName} ${a.applicant.middleName || ''} ${a.applicant.lastName}`.replace(/\s+/g, ' ')),
        infoRow('Birth date', a.applicant.birthDate),
        infoRow('School / course', [a.applicant.school, a.applicant.courseOrStrand].filter(Boolean).join(', ')),
        infoRow('GWA / income', `${a.applicant.gwa ?? '-'} / ${money(a.applicant.householdIncome)}`)));

    const applicationCard = el('section', { class: 'detail-card' },
      el('h3', {}, 'Application'),
      el('dl', { class: 'detail-grid' },
        infoRow('Program', `${a.program.name} (${a.program.type === 'grant' ? 'grant' : 'non-grant'})`),
        infoRow('Academic year', a.academicYear),
        infoRow('Ineligibility reason', a.ineligibilityReason),
        infoRow('Internal remarks', a.remarks),
        infoRow('Created', dateTime(a.createdAt)),
        infoRow('Last updated', dateTime(a.updatedAt))));

    const scheduleText = a.grantSchedule
      ? el('p', { class: 'schedule-line' }, `Release: ${a.grantSchedule.releaseDate} at ${a.grantSchedule.venue}, ${money(a.grantSchedule.amount)}`)
      : el('p', { class: 'muted' }, a.program.type === 'grant' ? 'No release schedule yet.' : 'Not applicable (non-grant program).');

    const showScheduleForm = a.program.type === 'grant' && a.phase === 'Approved' && !a.isArchived;
    const scheduleCard = el('section', { class: 'detail-card' },
      el('h3', {}, 'Grant release schedule'),
      scheduleText,
      showScheduleForm ? buildScheduleForm(id, a) : null);

    const timeline = el('ol', { class: 'timeline' },
      a.history.map((h) => el('li', {},
        el('strong', {}, h.oldPhase ? `${h.oldPhase} → ${h.newPhase}` : h.newPhase),
        el('div', { class: 'sub' }, `${dateTime(h.changedAt)} by ${h.changedByName}`),
        h.remarks ? el('div', {}, h.remarks) : null)));
    const historyCard = el('section', { class: 'detail-card' }, el('h3', {}, 'Status history'), timeline);

    const dialog = $('detail-dialog');
    const wasOpen = dialog.open; // after an action the dialog is already open, so do not open it twice

    // Drop empty items first, because replaceChildren would print null as the text "null".
    $('detail-content').replaceChildren(...[
      summary,
      buildWorkflowPanel(id, a, tiers, tiersFailed, notice),
      applicantCard,
      applicationCard,
      scheduleCard,
      historyCard
    ].filter(Boolean));

    if (!wasOpen) {
      dialog.showModal();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // no input starts focused
      dialog.scrollTop = 0;
    }
  } catch (err) {
    showError(err);
  }
}

$('btn-detail-close').addEventListener('click', () => $('detail-dialog').close());

// ---------- One-time PIN ----------
function showPin(referenceNo, pin, title) {
  $('pin-title').textContent = title;
  $('pin-ref').textContent = 'Reference number: ' + referenceNo;
  $('pin-value').textContent = pin; // text, not a number, so a leading 0 stays
  $('btn-pin-copy').textContent = 'Copy PIN';
  $('pin-dialog').showModal();
}

async function reissuePin(application) {
  const ok = await uiConfirm({
    title: 'Issue a new PIN?',
    message: `The old PIN for ${application.referenceNo} will stop working right away.`,
    confirmText: 'Issue new PIN',
    danger: true
  });
  if (!ok) return;
  try {
    const res = await api('PATCH', `/applications/${application.id}/pin`);
    showPin(res.data.referenceNo, res.data.lookupPin, 'New PIN issued');
  } catch (err) {
    showError(err);
  }
}

$('btn-pin-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('pin-value').textContent);
    $('btn-pin-copy').textContent = 'Copied!';
  } catch (e) {
    $('btn-pin-copy').textContent = 'Copy failed. Select it by hand.';
  }
});

// The PIN cannot be shown again, so ask before closing.
$('btn-pin-close').addEventListener('click', async () => {
  const ok = await uiConfirm({
    title: 'Close without the PIN?',
    message: 'The PIN cannot be shown again after this. Make sure you copied it.',
    confirmText: 'Yes, close'
  });
  if (ok) $('pin-dialog').close();
});

// Pressing Esc must not close it by accident, because the PIN cannot be shown again.
$('pin-dialog').addEventListener('cancel', (event) => event.preventDefault());

// Wipe the PIN from the page once the dialog closes.
$('pin-dialog').addEventListener('close', () => { $('pin-value').textContent = ''; });

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
  loadSummary();
}
if (me) start();
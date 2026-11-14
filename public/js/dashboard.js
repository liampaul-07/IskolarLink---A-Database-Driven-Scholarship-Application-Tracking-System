// Dashboard page: a summary of all applications, from GET /api/dashboard.
// Depends on common.js (auth, api, el, slug, renderTopbar, showError).
// Everything is written with textContent / el(), never innerHTML.

const $ = (id) => document.getElementById(id);

const me = auth.guard();
renderTopbar();

// Order of the bars: the normal flow first, then the two final results.
const PHASE_BARS = ['Submitted', 'Under Review', 'For Evaluation', 'Approved', 'Granted', 'Ineligible'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmtNumber = (n) => Number(n || 0).toLocaleString('en-PH');
const fmtPeso = (n) => '₱' + Number(n || 0).toLocaleString('en-PH');

// ---------- Summary cards ----------
function renderStats(d) {
  const p = d.byPhase || {};
  const inProgress = (p['Submitted'] || 0) + (p['Under Review'] || 0) + (p['For Evaluation'] || 0);
  $('d-total').textContent = fmtNumber(d.totalApplications);
  $('d-progress').textContent = fmtNumber(inProgress);
  $('d-approved').textContent = fmtNumber(p['Approved']);
  $('d-granted').textContent = fmtNumber(p['Granted']);
}

// ---------- Bars: applications per phase ----------
function renderPhaseBars(d) {
  const p = d.byPhase || {};
  const max = Math.max(1, ...PHASE_BARS.map((name) => p[name] || 0));

  const columns = PHASE_BARS.map((name) => {
    const n = p[name] || 0;
    const bar = el('div', { class: 'bar bar-' + slug(name) + (n === 0 ? ' bar-zero' : '') });
    bar.style.height = n === 0 ? '6px' : Math.max(12, Math.round((n / max) * 100)) + '%';
    return el('div', { class: 'bar-col', title: `${name}: ${n}` },
      el('span', { class: 'bar-count' }, fmtNumber(n)),
      el('div', { class: 'bar-track' }, bar),
      el('span', { class: 'bar-label' }, name));
  });
  $('phase-bars').replaceChildren(...columns);
}

// ---------- Half-circle progress ----------
function renderGauge(d) {
  const p = d.byPhase || {};
  const granted = p['Granted'] || 0;
  const progress = (p['Under Review'] || 0) + (p['For Evaluation'] || 0) + (p['Approved'] || 0);
  const pending = p['Submitted'] || 0;
  const ineligible = p['Ineligible'] || 0;
  const total = granted + progress + pending + ineligible;

  const parts = [
    { name: 'Granted', value: granted, color: 'var(--forest)', swatch: 'sw-granted' },
    { name: 'In progress', value: progress, color: 'var(--leaf)', swatch: 'sw-progress' },
    { name: 'Submitted', value: pending, color: '#c6d8cd', swatch: 'sw-pending' },
    { name: 'Ineligible', value: ineligible, color: 'var(--accent)', swatch: 'sw-ineligible' }
  ];

  const arc = $('gauge-arc');
  if (total === 0) {
    arc.style.background = 'var(--border-soft)';
  } else {
    // The half circle is 180 degrees, so each part gets its share of 180.
    let start = 0;
    const stops = [];
    for (const part of parts) {
      if (part.value === 0) continue;
      const end = start + (part.value / total) * 180;
      stops.push(`${part.color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`);
      start = end;
    }
    arc.style.background = `conic-gradient(from -90deg, ${stops.join(', ')}, transparent 180deg)`;
  }

  const percent = total === 0 ? 0 : Math.round((granted / total) * 100);
  $('gauge-percent').textContent = percent + '%';
  $('gauge').setAttribute('aria-label', `${percent}% of applications are granted`);

  $('gauge-legend').replaceChildren(...parts.map((part) =>
    el('li', {},
      el('span', { class: 'swatch ' + part.swatch }),
      part.name,
      el('span', { class: 'legend-count' }, fmtNumber(part.value)))));
}

// ---------- Eligibility ----------
function renderEligibility(d) {
  const e = d.eligibility || {};
  const parts = [
    { name: 'Pending', value: e.pending || 0, seg: 'seg-pending', swatch: 'sw-pending' },
    { name: 'Eligible', value: e.eligible || 0, seg: 'seg-eligible', swatch: 'sw-eligible' },
    { name: 'Ineligible', value: e.ineligible || 0, seg: 'seg-ineligible', swatch: 'sw-ineligible' }
  ];

  const segments = parts.filter((x) => x.value > 0).map((x) => {
    const seg = el('div', { class: 'stack-seg ' + x.seg, title: `${x.name}: ${x.value}` });
    seg.style.flexGrow = String(x.value);
    return seg;
  });
  $('elig-stack').replaceChildren(...segments);

  $('elig-legend').replaceChildren(...parts.map((x) =>
    el('li', {},
      el('span', { class: 'swatch ' + x.swatch }),
      x.name,
      el('span', { class: 'legend-count' }, fmtNumber(x.value)))));
}

// ---------- Applications per tier ----------
function renderTiers(d) {
  const rows = d.byTier || [];
  const box = $('tier-list');
  if (rows.length === 0) {
    box.replaceChildren(el('li', { class: 'empty-note' }, 'No tier has been assigned yet.'));
    return;
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  box.replaceChildren(...rows.map((r) => {
    const fill = el('div', { class: 'mini-fill' });
    fill.style.width = Math.max(4, Math.round((r.count / max) * 100)) + '%';
    return el('li', {},
      el('div', { class: 'tier-row-top' },
        el('div', {},
          el('div', { class: 'tier-name' }, r.tier),
          el('div', { class: 'tier-program' }, r.program)),
        el('span', { class: 'tier-count' }, fmtNumber(r.count))),
      el('div', { class: 'mini-track' }, fill));
  }));
}

// ---------- Upcoming grant releases ----------
function renderReleases(d) {
  const list = d.upcomingReleases || [];
  const box = $('release-list');
  if (list.length === 0) {
    box.replaceChildren(el('li', { class: 'empty-note' }, 'No grant releases are scheduled.'));
    return;
  }
  box.replaceChildren(...list.map((r) => {
    // The date comes as YYYY-MM-DD; it is split by hand so no time zone can shift it.
    const parts = String(r.releaseDate).slice(0, 10).split('-');
    const month = MONTH_NAMES[Number(parts[1]) - 1] || '';
    const day = String(Number(parts[2]) || '');
    return el('li', { class: 'release-item' },
      el('div', { class: 'date-badge' }, el('span', {}, month), el('strong', {}, day)),
      el('div', {},
        el('div', { class: 'release-name' }, r.applicantName),
        el('div', { class: 'release-meta' }, `${r.referenceNo} · ${r.venue}`),
        el('div', { class: 'release-amount' }, fmtPeso(r.amount))));
  }));
}

// ---------- Load ----------
function markFailed() {
  $('phase-bars').replaceChildren(el('p', { class: 'empty-note' }, 'Could not load this part.'));
  $('tier-list').replaceChildren(el('li', { class: 'empty-note' }, 'Could not load this part.'));
  $('release-list').replaceChildren(el('li', { class: 'empty-note' }, 'Could not load this part.'));
}

async function loadDashboard() {
  try {
    const res = await api('GET', '/dashboard');
    const d = res.data;
    renderStats(d);
    renderPhaseBars(d);
    renderGauge(d);
    renderEligibility(d);
    renderTiers(d);
    renderReleases(d);
  } catch (err) {
    showError(err);
    markFailed();
  }
}

if (me) loadDashboard();
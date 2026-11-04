// Public lookup page (home). Depends on common.js (api, auth, el, showMessage, phaseTag, eligibilityTag, dateOnly).

const topNav = document.getElementById('topbar-right');
topNav.append(auth.getToken() && auth.getUser()
  ? el('a', { href: '/applications.html' }, 'Staff console')
  : el('a', { href: '/login.html' }, 'Staff login'));

const lookupForm = document.getElementById('lookup-form');
const resultBox = document.getElementById('result');

const peso = (n) => Number(n).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
const row = (label, value) => el('p', {}, el('strong', {}, label + ': '), value);

function renderResult(d) {
  const parts = [
    el('h3', {}, 'Application ' + d.referenceNo),
    row('Program', d.program),
    row('Phase', phaseTag(d.phase)),
    row('Eligibility', eligibilityTag(d.eligibility))
  ];
  if (d.tier) parts.push(row('Tier', d.tier));
  if (d.phase === 'Ineligible') {
    parts.push(el('p', {}, 'Please contact the scholarship office for details.'));
  }
  if (d.grantSchedule) {
    parts.push(
      el('h4', {}, 'Grant release'),
      row('Date', dateOnly(d.grantSchedule.releaseDate)),
      row('Venue', d.grantSchedule.venue),
      row('Amount', peso(d.grantSchedule.amount)));
  }
  parts.push(
    el('h4', {}, 'Timeline'),
    el('ul', {}, d.timeline.map((t) => el('li', {}, `${dateOnly(t.date)}: ${t.phase}`))));
  resultBox.replaceChildren(...parts);
  resultBox.hidden = false;
}

lookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.getElementById('btn-lookup');
  button.disabled = true;
  resultBox.hidden = true;

  try {
    const res = await api('POST', '/public/lookup', {
      referenceNo: document.getElementById('referenceNo').value,
      birthDate: document.getElementById('birthDate').value,
      pin: document.getElementById('pin').value
    });
    renderResult(res.data);
    showMessage('Application found.', 'success');
  } catch (err) {
    if (err.status === 404) {
      showMessage('No matching application found. Check your reference number, birth date and PIN. '
        + 'If you lost your PIN, ask the scholarship office for a new one.', 'error');
    } else if (err.status === 429) {
      showMessage('Too many attempts. Please try again in a few minutes.', 'error');
    } else {
      showMessage(err.message || 'Something went wrong.', 'error');
    }
  } finally {
    document.getElementById('pin').value = ''; // never leave the PIN sitting in the form
    button.disabled = false;
  }
});
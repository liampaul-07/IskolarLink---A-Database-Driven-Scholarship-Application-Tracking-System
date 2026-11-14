// Shared frontend helpers: API calls, DOM building, and user messages.
// Everything user-supplied is inserted with textContent / text nodes (never innerHTML),
// so script tags typed into text fields are displayed as plain text (XSS-safe).

// ---------- Login session ----------
// The JWT is kept in sessionStorage (cleared when the tab closes). Trade-off to mention at the
// defense: script injected into the page could read it, which is why the pages never use innerHTML.
const auth = {
  getToken() {
    try { return sessionStorage.getItem('il_token'); } catch (e) { return null; }
  },
  getUser() {
    try { return JSON.parse(sessionStorage.getItem('il_user') || 'null'); } catch (e) { return null; }
  },
  save(token, user) {
    try {
      sessionStorage.setItem('il_token', token);
      sessionStorage.setItem('il_user', JSON.stringify(user));
    } catch (e) { /* storage blocked: the user will simply be asked to log in again */ }
  },
  clear() {
    try { sessionStorage.removeItem('il_token'); sessionStorage.removeItem('il_user'); } catch (e) { /* ignore */ }
  },
  logout() {
    auth.clear();
    window.location.href = '/login.html';
  },
  // Call at the top of a protected page. Returns the user, or null after redirecting.
  // `roles` is optional: guard(['admin']) bounces everyone else back to the home page.
  guard(roles) {
    const user = auth.getUser();
    if (!auth.getToken() || !user) {
      window.location.href = '/login.html';
      return null;
    }
    if (roles && !roles.includes(user.role)) {
      window.location.href = '/applications.html'; // not allowed to see this page
      return null;
    }
    return user;
  }
};

// Fills <nav id="topbar-right"> with links, the user's name, and a Log out button.
// On wide screens styles.css shows this navigation as a sidebar.
// (Hiding links by role is only for convenience; the server enforces the real permissions.)
function renderTopbar() {
  const nav = document.getElementById('topbar-right');
  const user = auth.getUser();
  if (!nav || !user) return;

  // Tells the stylesheet that this page has the sidebar navigation.
  document.body.classList.add('has-sidebar');

  const links = [
    { href: '/dashboard.html', label: 'Dashboard' },
    { href: '/applications.html', label: 'Applications' },
    { href: '/applicants.html', label: 'Applicants' },
    { href: '/programs.html', label: 'Programs' }
  ];
  if (user.role === 'admin') links.push({ href: '/users.html', label: 'Users' });

  // Two letters for the round avatar, for example "System Administrator" -> "SA".
  const words = String(user.fullName || '').trim().split(/\s+/).filter(Boolean);
  const initials = words.length
    ? (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
    : '?';

  const items = [
    // The link of the page we are on gets the "active" class.
    ...links.map((l) =>
      el('a', { href: l.href, class: window.location.pathname === l.href ? 'active' : false }, l.label)
    ),
    el('span', { class: 'who' },
      el('span', { class: 'who-avatar' }, initials),
      el('span', { class: 'who-text' },
        el('strong', {}, user.fullName),
        el('small', {}, user.role))),
    el('button', { class: 'btn small', type: 'button', onclick: auth.logout }, 'Log out')
  ];
  nav.replaceChildren(...items);
}

// ---------- API ----------
// api('GET', '/programs') -> resolves with the parsed { success, message, data } body.
// Rejects with an Error that has .status (HTTP code) and .errors (validation list).
// Sends the login token automatically; a 401 anywhere else sends the user to the login page.
async function api(method, path, body) {
  const options = { method, headers: {} };
  const token = auth.getToken();
  if (token) options.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch('/api' + path, options);
  } catch (networkError) {
    const err = new Error('Cannot reach the server. Is it running?');
    err.status = 0;
    err.errors = [];
    if (api.onResponse) api.onResponse(method, path, 0);
    throw err;
  }

  let json;
  try {
    json = await res.json();
  } catch (parseError) {
    json = { success: false, message: 'Unexpected response from the server.', data: null };
  }

  if (api.onResponse) api.onResponse(method, path, res.status);

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    auth.clear(); // token expired or account deactivated
    window.location.href = '/login.html';
  }

  if (!res.ok || !json.success) {
    const err = new Error(json.message || 'Request failed.');
    err.status = res.status;
    err.errors = (json.data && json.data.errors) || [];
    throw err;
  }
  return json;
}

// ---------- DOM ----------
// el('button', { class: 'btn', onclick: fn }, 'Save')
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    node.append(child instanceof Node ? child : document.createTextNode(child ?? ''));
  }
  return node;
}

// ---------- Display helpers ----------
const dateOnly = (s) => (s ? String(s).slice(0, 10) : '');
const dateTime = (s) => (s ? String(s).slice(0, 16) : '');
const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '-');
const phaseTag = (phase) => el('span', { class: 'tag ph-' + slug(phase) }, phase);
const eligibilityTag = (value) => el('span', { class: 'tag el-' + value }, value);

// ---------- Friendly validation errors ----------
// Field names from the server (like academicYear) are turned into readable labels.
const FIELD_LABELS = {
  academicYear: 'Academic year',
  applicantId: 'Applicant',
  programId: 'Program',
  tierId: 'Tier',
  docsComplete: 'Requirements',
  remarks: 'Remarks',
  reason: 'Reason',
  newPhase: 'New phase',
  eligibility: 'Eligibility',
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  birthDate: 'Birth date',
  sex: 'Sex',
  email: 'Email',
  contactNumber: 'Contact number',
  phone: 'Contact number',
  address: 'Address',
  school: 'School',
  courseOrStrand: 'Course or strand',
  yearLevel: 'Year level',
  gwa: 'GWA',
  householdIncome: 'Monthly household income',
  username: 'Username',
  password: 'Password',
  fullName: 'Full name',
  role: 'Role',
  name: 'Name',
  type: 'Type',
  status: 'Status',
  description: 'Description',
  criteria: 'Eligibility criteria',
  minGwa: 'Minimum GWA',
  maxIncome: 'Maximum household income',
  tierName: 'Tier name',
  defaultAmount: 'Default amount',
  releaseDate: 'Release date',
  venue: 'Venue',
  amount: 'Amount',
  referenceNo: 'Reference number',
  pin: 'PIN'
};

function friendlyField(name) {
  const key = String(name || '').split('.').pop();
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (!key) return 'Field';
  const words = key.replace(/([A-Z])/g, ' $1').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// "Validation failed." is not helpful, so show a clear heading when there is a list of fields.
function errorHeading(err) {
  return err.errors && err.errors.length ? 'Please fix the following:' : (err.message || 'Something went wrong.');
}

// <ul> of "Field name: message" lines.
function errorList(list) {
  return el('ul', { class: 'error-list' },
    list.map((e) => el('li', {},
      el('span', { class: 'err-field' }, friendlyField(e.field)),
      ' ',
      e.message)));
}

// Error box inside a dialog (the red box under the title).
function hideErrorBox(id) {
  const box = document.getElementById(id);
  box.hidden = true;
  box.replaceChildren();
}
function fillErrorBox(id, err) {
  const box = document.getElementById(id);
  box.replaceChildren(el('strong', {}, errorHeading(err)));
  if (err.errors && err.errors.length) box.append(errorList(err.errors));
  box.hidden = false;
}

// Replaces a <select>'s options. options = [{ value, label }]
function fillSelect(select, options, firstLabel) {
  const items = options.map((o) => el('option', { value: o.value }, o.label));
  select.replaceChildren(...(firstLabel === undefined ? [] : [el('option', { value: '' }, firstLabel)]), ...items);
}

// ---------- Messages ----------
let bannerTimer = null;

function showMessage(text, type = 'success', details = []) {
  const banner = document.getElementById('banner');
  banner.className = 'banner ' + type;
  banner.replaceChildren(el('strong', {}, text));
  if (details.length) banner.append(errorList(details));
  banner.hidden = false;
  clearTimeout(bannerTimer);
  if (type === 'success') bannerTimer = setTimeout(() => { banner.hidden = true; }, 4000);
}

function showError(err) {
  showMessage(errorHeading(err), 'error', err.errors || []);
}

// Shows the last request and its status code in the strip under the toolbar.
function trackLastCall(method, path, status) {
  const strip = document.getElementById('last-call');
  if (!strip) return;
  const ok = status >= 200 && status < 300;
  strip.className = 'last-call ' + (ok ? 'ok' : 'bad');
  strip.textContent = `${method} /api${path}  →  ${status === 0 ? 'no response' : status}`;
}
api.onResponse = trackLastCall;

// Click on the dark area outside a dialog closes it.
// The PIN dialog is skipped on purpose: the PIN can only be shown once.
let pressedOnBackdrop = false;

document.addEventListener('pointerdown', (event) => {
  pressedOnBackdrop = event.target instanceof HTMLDialogElement;
});

document.addEventListener('click', (event) => {
  const dialog = event.target;
  if (pressedOnBackdrop && dialog instanceof HTMLDialogElement && dialog.open && dialog.id !== 'pin-dialog') {
    dialog.close();
  }
  pressedOnBackdrop = false;
});
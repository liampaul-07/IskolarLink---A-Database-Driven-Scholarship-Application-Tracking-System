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
      window.location.href = '/';
      return null;
    }
    return user;
  }
};

// Fills <nav id="topbar-right"> with links, the user's name, and a Log out button.
// (Hiding links by role is only for convenience; the server enforces the real permissions.)
function renderTopbar() {
  const nav = document.getElementById('topbar-right');
  const user = auth.getUser();
  if (!nav || !user) return;
  const items = [
    el('a', { href: '/' }, 'Home'),
    el('a', { href: '/applications.html' }, 'Applications'),
    el('a', { href: '/applicants.html' }, 'Applicants'),
    el('a', { href: '/programs.html' }, 'Programs'),
    user.role === 'admin' ? el('a', { href: '/users.html' }, 'Users') : null,
    el('span', { class: 'who' }, `${user.fullName} (${user.role})`),
    el('button', { class: 'btn small', type: 'button', onclick: auth.logout }, 'Log out')
  ];
  // replaceChildren would print a null item as the text "null", so drop the empty ones first.
  nav.replaceChildren(...items.filter(Boolean));
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

// Error box inside a dialog (the red list under the title).
function hideErrorBox(id) {
  const box = document.getElementById(id);
  box.hidden = true;
  box.replaceChildren();
}
function fillErrorBox(id, err) {
  const box = document.getElementById(id);
  box.replaceChildren(el('strong', {}, err.message));
  if (err.errors && err.errors.length) {
    box.append(el('ul', {}, err.errors.map((e) => el('li', {}, `${e.field}: ${e.message}`))));
  }
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
  if (details.length) {
    banner.append(el('ul', {}, details.map((d) => el('li', {}, `${d.field}: ${d.message}`))));
  }
  banner.hidden = false;
  clearTimeout(bannerTimer);
  if (type === 'success') bannerTimer = setTimeout(() => { banner.hidden = true; }, 4000);
}

function showError(err) {
  showMessage(err.message || 'Something went wrong.', 'error', err.errors || []);
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
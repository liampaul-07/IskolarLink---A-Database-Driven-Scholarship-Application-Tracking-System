// Shared frontend helpers: API calls, DOM building, and user messages.
// Everything user-supplied is inserted with textContent / text nodes (never innerHTML),
// so script tags typed into text fields are displayed as plain text (XSS-safe).

// ---------- API ----------
// api('GET', '/programs') -> resolves with the parsed { success, message, data } body.
// Rejects with an Error that has .status (HTTP code) and .errors (validation list).
async function api(method, path, body) {
  const options = { method, headers: {} };
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
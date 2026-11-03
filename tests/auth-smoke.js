// Smoke test for authentication, roles, and the programs routes.
// Usage (server must be running, database freshly seeded):
//   node tests/auth-smoke.js            -> uses http://localhost:3000
//   BASE=http://localhost:3055 node tests/auth-smoke.js
// Note: failed logins are rate limited (10 per 15 min per IP). Restart the server to reset.

const BASE = (process.env.BASE || 'http://localhost:3000') + '/api';
let passed = 0;
let failed = 0;

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON */ }
  return { status: res.status, json };
}

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log('  PASS', name); }
  else { failed++; console.log('  FAIL', name, detail); }
}

async function login(username, password) {
  const r = await call('POST', '/auth/login', { body: { username, password } });
  return r;
}

(async () => {
  console.log('Login');
  let r = await login('admin', 'Admin@12345');
  check('admin can log in (200 + token)', r.status === 200 && r.json.data.token);
  const adminToken = r.json.data.token;
  check('login response has no password hash', !JSON.stringify(r.json).includes('$2'));

  r = await login('staff1', 'Staff@12345');
  check('staff can log in', r.status === 200 && r.json.data.user.role === 'staff');
  const staffToken = r.json.data.token;

  const wrongPw = await login('admin', 'wrong-password-1');
  const unknown = await login('nobody', 'whatever123');
  const inactive = await login('staff2', 'Staff@12345');
  check('wrong password -> 401', wrongPw.status === 401);
  check('unknown user -> 401', unknown.status === 401);
  check('inactive account -> 401', inactive.status === 401);
  check('all three failures share one identical message',
    wrongPw.json.message === unknown.json.message && unknown.json.message === inactive.json.message,
    wrongPw.json.message);
  r = await call('POST', '/auth/login', { body: {} });
  check('missing fields -> 400 with errors', r.status === 400 && r.json.data.errors.length === 2);

  console.log('Token checks');
  r = await call('GET', '/auth/me');
  check('/auth/me without token -> 401', r.status === 401);
  r = await call('GET', '/auth/me', { token: 'garbage.token.value' });
  check('/auth/me with garbage token -> 401', r.status === 401);
  r = await call('GET', '/auth/me', { token: adminToken });
  check('/auth/me with token -> 200', r.status === 200 && r.json.data.username === 'admin');
  const tampered = adminToken.slice(0, -2) + (adminToken.endsWith('aa') ? 'bb' : 'aa');
  r = await call('GET', '/auth/me', { token: tampered });
  check('tampered token -> 401', r.status === 401);

  console.log('Programs: roles');
  r = await call('GET', '/programs');
  check('GET /programs without token -> 401', r.status === 401);
  r = await call('GET', '/programs', { token: staffToken });
  check('staff can read programs', r.status === 200 && r.json.data.items.length >= 1);
  r = await call('POST', '/programs', { token: staffToken, body: { name: 'Staff Attempt', type: 'grant' } });
  check('staff cannot create a program -> 403', r.status === 403);
  r = await call('PATCH', '/programs/1/archive', { token: staffToken, body: { archived: true } });
  check('staff cannot archive a program -> 403', r.status === 403);
  r = await call('DELETE', '/tiers/1', { token: staffToken });
  check('staff cannot delete a tier -> 403', r.status === 403);
  r = await call('POST', '/programs', { token: adminToken, body: { name: 'Auth Test Program', type: 'grant' } });
  check('admin can create a program -> 201', r.status === 201);

  console.log('Users: admin only');
  r = await call('GET', '/users', { token: staffToken });
  check('staff cannot list users -> 403', r.status === 403);
  r = await call('GET', '/users');
  check('no token on /users -> 401', r.status === 401);
  r = await call('GET', '/users', { token: adminToken });
  check('admin can list users', r.status === 200 && r.json.data.items.length >= 3);
  check('user list never contains password hashes', !JSON.stringify(r.json).includes('password'));

  const uname = 'tester' + Date.now().toString().slice(-6);
  r = await call('POST', '/users', { token: adminToken, body: { username: uname, password: 'Passw0rd123', fullName: 'Test User', role: 'staff' } });
  check('admin creates a user -> 201', r.status === 201, JSON.stringify(r.json));
  const newId = r.json && r.json.data && r.json.data.id;
  r = await call('POST', '/users', { token: adminToken, body: { username: uname, password: 'Passw0rd123', fullName: 'Dup', role: 'staff' } });
  check('duplicate username -> 409', r.status === 409);
  r = await call('POST', '/users', { token: adminToken, body: { username: 'ab', password: 'short', fullName: '', role: 'boss' } });
  check('bad user data -> 400 with 4 errors', r.status === 400 && r.json.data.errors.length === 4, JSON.stringify(r.json));
  r = await call('POST', '/users', { token: adminToken, body: { username: 'weakpw1', password: 'onlyletters', fullName: 'Weak', role: 'staff' } });
  check('password without a number -> 400', r.status === 400);

  r = await login(uname, 'Passw0rd123');
  check('new user can log in', r.status === 200);
  const newToken = r.json.data && r.json.data.token;

  console.log('Users: updates');
  r = await call('PATCH', '/users/' + newId, { token: adminToken, body: { isActive: false } });
  check('admin deactivates user', r.status === 200 && r.json.data.isActive === false);
  r = await call('GET', '/auth/me', { token: newToken });
  check('deactivated user\'s existing token stops working immediately -> 401', r.status === 401);
  r = await call('PATCH', '/users/' + newId, { token: adminToken, body: { isActive: true, role: 'admin', password: 'NewPassw0rd9' } });
  check('admin reactivates, promotes, resets password', r.status === 200 && r.json.data.role === 'admin');
  r = await login(uname, 'NewPassw0rd9');
  check('login works with the new password', r.status === 200);
  r = await call('PATCH', '/users/' + newId, { token: adminToken, body: {} });
  check('empty update -> 400', r.status === 400);
  r = await call('PATCH', '/users/99999', { token: adminToken, body: { fullName: 'X' } });
  check('unknown user -> 404', r.status === 404);
  r = await call('PATCH', '/users/abc', { token: adminToken, body: { fullName: 'X' } });
  check('bad id -> 400', r.status === 400);
  r = await call('PATCH', '/users/1', { token: adminToken, body: { role: 'staff' } });
  check('admin cannot demote self -> 409', r.status === 409);
  r = await call('PATCH', '/users/1', { token: adminToken, body: { isActive: false } });
  check('admin cannot deactivate self -> 409', r.status === 409);

  console.log('Errors and headers');
  const raw = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
  check('malformed JSON -> 400', raw.status === 400);
  const health = await fetch(BASE + '/health');
  check('helmet headers present', health.headers.get('x-content-type-options') === 'nosniff' && !!health.headers.get('content-security-policy'));
  check('X-Powered-By hidden', health.headers.get('x-powered-by') === null);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Test run crashed:', e); process.exit(1); });
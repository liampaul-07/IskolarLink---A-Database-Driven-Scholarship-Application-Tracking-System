// node tests/security-smoke.js   (server running; re-import seed_applicants.sql afterward)
const crypto = require('crypto');
const BASE = process.env.BASE_URL || 'http://localhost:3000/api';
let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`, extra === undefined ? '' : extra); }
};

async function raw(method, path, { body, token, rawBody } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (rawBody !== undefined) { payload = rawBody; headers['Content-Type'] = 'application/json'; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers['Content-Type'] = 'application/json'; }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { status: res.status, headers: res.headers, text, json };
}
const login = async (u, p) => (await raw('POST', '/auth/login', { body: { username: u, password: p } }));

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function forge(alg, secret) {
  const h = b64({ alg, typ: 'JWT' }), p = b64({ id: 1, username: 'admin', role: 'admin' });
  if (alg === 'none') return `${h}.${p}.`;
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`;
}

const LEAK = /stack|sqlMessage|sqlState|ER_[A-Z_]+|node_modules|SyntaxError|at .*\(.*:\d+:\d+\)|SELECT |INSERT |UPDATE /;

// Every staff route (none needs a body to be refused with 401).
const STAFF_ROUTES = [
  ['GET', '/auth/me'], ['GET', '/users'], ['POST', '/users'], ['PATCH', '/users/1'],
  ['GET', '/programs'], ['GET', '/programs/1'], ['POST', '/programs'], ['PUT', '/programs/1'],
  ['PATCH', '/programs/1/archive'], ['GET', '/programs/1/tiers'], ['POST', '/programs/1/tiers'],
  ['PUT', '/tiers/1'], ['DELETE', '/tiers/1'],
  ['GET', '/applicants'], ['GET', '/applicants/1'], ['POST', '/applicants'], ['PUT', '/applicants/1'],
  ['PATCH', '/applicants/1/archive'],
  ['GET', '/applications'], ['GET', '/applications/1'], ['POST', '/applications'], ['PUT', '/applications/1'],
  ['PATCH', '/applications/1/archive'], ['PATCH', '/applications/1/pin'], ['GET', '/applications/1/history'],
  ['PATCH', '/applications/1/phase'], ['PATCH', '/applications/1/eligibility'], ['PATCH', '/applications/1/tier'],
  ['GET', '/applications/1/grant-schedule'], ['PUT', '/applications/1/grant-schedule'],
  ['DELETE', '/applications/1/grant-schedule'], ['GET', '/dashboard']
];

(async () => {
  const staffLogin = await login('staff1', 'Staff@12345');
  const adminLogin = await login('admin', 'Admin@12345');
  const staff = staffLogin.json.data.token, admin = adminLogin.json.data.token;
  const tampered = staff.slice(0, -3) + (staff.endsWith('AAA') ? 'BBB' : 'AAA');

  console.log('401 sweep: no token');
  const noToken = [];
  for (const [m, p] of STAFF_ROUTES) noToken.push([m, p, (await raw(m, p)).status]);
  check(`all ${STAFF_ROUTES.length} staff routes refuse a missing token`,
    noToken.every((r) => r[2] === 401), noToken.filter((r) => r[2] !== 401));

  console.log('401 sweep: bad tokens');
  for (const [label, tok] of [
    ['tampered signature', tampered],
    ['signed with the wrong secret', forge('HS256', 'not-the-real-secret')],
    ['alg=none', forge('none')],
    ['garbage', 'not.a.jwt']
  ]) {
    const bad = [];
    for (const [m, p] of [['GET', '/auth/me'], ['GET', '/applications'], ['GET', '/dashboard'], ['GET', '/users']]) {
      const s = (await raw(m, p, { token: tok })).status;
      if (s !== 401) bad.push([m, p, s]);
    }
    check(`${label}: refused`, bad.length === 0, bad);
  }
  check('inactive account (staff2) cannot log in', (await login('staff2', 'Staff@12345')).status === 401);

  console.log('403 sweep: staff on admin-only routes');
  const adminOnly = [
    ['GET', '/users'], ['POST', '/users', { username: 'sectest', password: 'Secret123', fullName: 'Sec Test' }],
    ['PATCH', '/users/1', { fullName: 'System Administrator' }],
    ['POST', '/programs', { name: 'Security Test Program', type: 'grant' }],
    ['PUT', '/programs/1', { name: 'Municipal Academic Scholarship', type: 'grant' }],
    ['PATCH', '/programs/1/archive', { archived: true }],
    ['POST', '/programs/1/tiers', { tierName: 'Sec Tier' }],
    ['PUT', '/tiers/1', { tierName: 'Tier 1' }], ['DELETE', '/tiers/1']
  ];
  const not403 = [];
  for (const [m, p, body] of adminOnly) {
    const s = (await raw(m, p, { token: staff, body })).status;
    if (s !== 403) not403.push([m, p, s]);
  }
  check(`all ${adminOnly.length} admin-only routes return 403 for staff`, not403.length === 0, not403);
  const reopen = await raw('PATCH', '/applications/12/phase',
    { token: staff, body: { newPhase: 'For Evaluation', reason: 'security test' } });
  check('staff cannot reopen an approved application (403)', reopen.status === 403, reopen.status);
  check('admin can still use admin routes', (await raw('GET', '/users', { token: admin })).status === 200);

  console.log('XSS: stored as plain data');
  const rand = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  const xss = '<script>alert(1)</script>';
  const made = await raw('POST', '/applicants', { token: staff, body:
    { firstName: xss, lastName: `Xss${rand}`, birthDate: '2001-01-01', address: '<img src=x onerror=alert(1)>' } });
  check('applicant with script text is accepted as data', made.status === 201, made.json);
  const got = await raw('GET', `/applicants/${made.json && made.json.data && made.json.data.id}`, { token: staff });
  check('read back unchanged, served as JSON (not HTML)',
    got.json && got.json.data.firstName === xss && /application\/json/.test(got.headers.get('content-type')),
    got.headers.get('content-type'));

  console.log('Security headers');
  const h = (await raw('GET', '/health')).headers;
  check('Content-Security-Policy present', Boolean(h.get('content-security-policy')));
  check('X-Content-Type-Options: nosniff', h.get('x-content-type-options') === 'nosniff');
  check('X-Powered-By hidden', !h.get('x-powered-by'));
  check('Cache-Control: no-store on API responses', /no-store/.test(h.get('cache-control') || ''), h.get('cache-control'));
  const cors = await fetch(BASE + '/health', { headers: { Origin: 'http://evil.example' } });
  const allowed = cors.headers.get('access-control-allow-origin');
  check('CORS does not allow a foreign origin', allowed !== 'http://evil.example' && allowed !== '*', allowed);

  console.log('Error leakage');
  const probes = [
    ['malformed JSON', await raw('POST', '/auth/login', { rawBody: '{"username": ' }), 400],
    ['oversized body', await raw('POST', '/auth/login', { rawBody: JSON.stringify({ username: 'x'.repeat(200000) }) }), 400],
    ['non-numeric id', await raw('GET', '/applications/abc', { token: staff }), 400],
    ['unknown API route', await raw('GET', '/nope/nothing', { token: staff }), 404],
    ['SQL injection in login', await raw('POST', '/auth/login', { body: { username: "' OR '1'='1", password: "' OR '1'='1" } }), 401],
    ['SQL injection in search', await raw('GET', "/applicants?q=" + encodeURIComponent("' OR 1=1; --"), { token: staff }), 200],
    ['SQL injection in lookup', await raw('POST', '/public/lookup', { body: { referenceNo: "' OR 1=1 --", birthDate: '2005-03-14', pin: '123456' } }), 404]
  ];
  for (const [label, r, want] of probes) {
    check(`${label}: ${want}, standard format, no internals`,
      r.status === want && r.json && typeof r.json.success === 'boolean' && !LEAK.test(r.text), [r.status, r.text.slice(0, 120)]);
  }
  const users = await raw('GET', '/users', { token: admin });
  check('user list never contains password hashes', !/\$2[aby]\$/.test(users.text) && !/password/i.test(users.text));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
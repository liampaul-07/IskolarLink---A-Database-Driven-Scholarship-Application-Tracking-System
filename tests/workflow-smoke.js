// Workflow smoke test. Run with the server up and a freshly seeded database:
//   node tests/workflow-smoke.js        (set BASE=http://localhost:PORT if needed)
// Creates its own fictional applicants each run, so it can be run repeatedly.
const BASE = process.env.BASE || 'http://localhost:3000';
let passed = 0;
let failed = 0;

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, body: json };
}

function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}  ${detail}`); }
}

function expect(name, r, status) {
  check(`${name} -> ${status}`, r.status === status, `(got ${r.status}: ${r.body && r.body.message})`);
  return r;
}

const items = (d) => (Array.isArray(d) ? d : (d && d.items) || []);

(async () => {
  const login = async (username, password) =>
    (await call('POST', '/auth/login', null, { username, password })).body.data.token;
  const admin = await login('admin', 'Admin@12345');
  const staff = await login('staff1', 'Staff@12345');
  const stamp = Date.now();
  let n = 0;

  const mkApp = async (programId) => {
    n += 1;
    const a = await call('POST', '/applicants', staff,
      { firstName: `Smoke${n}`, lastName: `Test${stamp}`, birthDate: '2000-01-01', address: 'Test address' });
    const r = await call('POST', '/applications', staff,
      { applicantId: a.body.data.id, programId, academicYear: '2026-2027' });
    return r.body.data.id;
  };
  const phase = (id, tok, newPhase, extra = {}) =>
    call('PATCH', `/applications/${id}/phase`, tok, { newPhase, ...extra });
  const tiersOf = async (pid) =>
    items((await call('GET', `/programs/${pid}/tiers`, staff)).body.data).map((t) => t.id);
  const getApp = async (id) => (await call('GET', `/applications/${id}`, staff)).body.data;
  const schedule = { releaseDate: '2026-12-10', venue: 'Municipal Hall', amount: 10000 };

  const [grantTier] = await tiersOf(1);
  const [otherTier] = await tiersOf(2);

  console.log('\n-- Basics --');
  expect('phase without token', await call('PATCH', '/applications/1/phase', null, { newPhase: 'Under Review' }), 401);
  expect('phase with bad id', await phase('abc', staff, 'Under Review'), 400);
  expect('phase on missing application', await phase(99999999, staff, 'Under Review'), 404);

  console.log('\n-- A: grant program happy path --');
  const A = await mkApp(1);
  expect('skip Submitted -> Approved', await phase(A, staff, 'Approved'), 409);
  expect('bad phase value', await phase(A, staff, 'Banana'), 400);
  expect('Submitted -> Under Review', await phase(A, staff, 'Under Review'), 200);
  expect('For Evaluation without docs', await phase(A, staff, 'For Evaluation'), 409);
  expect('mark docs complete', await call('PUT', `/applications/${A}`, staff, { docsComplete: true }), 200);
  expect('Under Review -> For Evaluation', await phase(A, staff, 'For Evaluation'), 200);
  expect('Approved without eligibility/tier', await phase(A, staff, 'Approved'), 409);
  expect('tier before eligible', await call('PATCH', `/applications/${A}/tier`, staff, { tierId: grantTier }), 409);
  expect('eligibility "ineligible" here', await call('PATCH', `/applications/${A}/eligibility`, staff, { eligibility: 'ineligible' }), 400);
  expect('tier from another program', await call('PATCH', `/applications/${A}/eligibility`, staff, { eligibility: 'eligible', tierId: otherTier }), 409);
  expect('eligible + own tier', await call('PATCH', `/applications/${A}/eligibility`, staff, { eligibility: 'eligible', tierId: grantTier }), 200);
  expect('For Evaluation -> Approved', await phase(A, staff, 'Approved'), 200);
  expect('Granted without schedule', await phase(A, staff, 'Granted'), 409);
  expect('schedule amount 0', await call('PUT', `/applications/${A}/grant-schedule`, staff, { ...schedule, amount: 0 }), 400);
  expect('schedule create', await call('PUT', `/applications/${A}/grant-schedule`, staff, schedule), 201);
  expect('schedule replace', await call('PUT', `/applications/${A}/grant-schedule`, staff, schedule), 200);
  expect('schedule read', await call('GET', `/applications/${A}/grant-schedule`, staff), 200);

  console.log('\n-- B: reopen --');
  expect('staff reopen', await phase(A, staff, 'For Evaluation', { reason: 'Wrong tier' }), 403);
  expect('admin reopen, no reason', await phase(A, admin, 'For Evaluation'), 400);
  expect('admin reopen with reason', await phase(A, admin, 'For Evaluation', { reason: 'Wrong tier' }), 200);
  const reopened = await getApp(A);
  check('reopen keeps eligibility and tier', reopened.eligibility === 'eligible' && reopened.tier !== null);
  expect('re-approve', await phase(A, staff, 'Approved'), 200);
  expect('Granted with schedule', await phase(A, staff, 'Granted'), 200);
  expect('delete schedule after Granted', await call('DELETE', `/applications/${A}/grant-schedule`, staff), 409);
  expect('phase change after Granted', await phase(A, staff, 'Approved'), 409);
  expect('admin reopen of Granted', await phase(A, admin, 'For Evaluation', { reason: 'x' }), 409);
  const hist = (await call('GET', `/applications/${A}/history`, staff)).body.data;
  check('history has 7 rows (6 changes + submission)', Array.isArray(hist) && hist.length === 7,
    `(got ${Array.isArray(hist) ? hist.length : 'none'})`);

  console.log('\n-- C: ineligible path --');
  const C = await mkApp(3);
  await phase(C, staff, 'Under Review');
  expect('Ineligible without reason', await phase(C, staff, 'Ineligible'), 400);
  expect('Ineligible with reason', await phase(C, staff, 'Ineligible', { reason: 'Incomplete requirements' }), 200);
  const inel = await getApp(C);
  check('ineligible sets eligibility, reason, no tier',
    inel.eligibility === 'ineligible' && inel.ineligibilityReason === 'Incomplete requirements' && inel.tier === null);
  expect('change after Ineligible', await phase(C, staff, 'Under Review'), 409);

  console.log('\n-- D: non-grant program --');
  const D = await mkApp(2);
  await phase(D, staff, 'Under Review');
  await call('PUT', `/applications/${D}`, staff, { docsComplete: true });
  await phase(D, staff, 'For Evaluation');
  expect('eligibility outside own tier', await call('PATCH', `/applications/${D}/eligibility`, staff, { eligibility: 'eligible', tierId: grantTier }), 409);
  expect('eligible + own tier', await call('PATCH', `/applications/${D}/eligibility`, staff, { eligibility: 'eligible', tierId: otherTier }), 200);
  await phase(D, staff, 'Approved');
  expect('schedule on non-grant', await call('PUT', `/applications/${D}/grant-schedule`, staff, schedule), 409);
  expect('non-grant Granted without schedule', await phase(D, staff, 'Granted'), 200);

  console.log('\n-- E: phase/eligibility stay in sync --');
  const list = items((await call('GET', '/applications?limit=100', staff)).body.data);
  const bad = list.filter((a) => (a.phase === 'Ineligible') !== (a.eligibility === 'ineligible'));
  check(`no mismatched rows among ${list.length} applications`, bad.length === 0, `(${bad.length} mismatched)`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error('Script crashed:', err); process.exit(1); });
// node tests/lookup-smoke.js   (server running; restart it first, the IP-limit test trips the limiter)
const BASE = process.env.BASE_URL || 'http://localhost:3000/api';
const NOT_FOUND = 'No matching application found.';
let passed = 0, failed = 0;

function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`, extra === undefined ? '' : extra); }
}

async function call(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, json };
}
const lookup = (b) => call('POST', '/public/lookup', b);
const login = async (u, p) => (await call('POST', '/auth/login', { username: u, password: p })).json.data.token;
const phase = (id, newPhase, token, extra = {}) => call('PATCH', `/applications/${id}/phase`, { newPhase, ...extra }, token);

(async () => {
  const staff = await login('staff1', 'Staff@12345');
  const admin = await login('admin', 'Admin@12345');
  const rand = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
  const BIRTH = '2003-05-17';

  console.log('Setup');
  const ap = await call('POST', '/applicants',
    { firstName: 'Pin', lastName: `Lookup${rand}`, birthDate: BIRTH, address: 'Secret Street 99, Hidden Town' }, staff);
  check('applicant created', ap.status === 201, ap.json);
  const applicantId = ap.json.data.id;

  const a1 = await call('POST', '/applications', { applicantId, programId: 1, academicYear: '2026-2027' }, staff);
  const a2 = await call('POST', '/applications', { applicantId, programId: 2, academicYear: '2026-2027' }, staff);
  check('application 1 created with a 6-digit PIN', a1.status === 201 && /^\d{6}$/.test(a1.json.data.lookupPin), a1.json);
  check('create response has no hash', !JSON.stringify(a1.json).includes('lookup_pin_hash') && !JSON.stringify(a1.json).includes('$2'));
  const g1 = await call('GET', `/applications/${a1.json.data.id}`, undefined, staff);
  check('GET application has no lookupPin / hash', !('lookupPin' in g1.json.data) && !JSON.stringify(g1.json).includes('$2'));

  const id1 = a1.json.data.id, ref1 = a1.json.data.referenceNo; let pin1 = a1.json.data.lookupPin;
  const id2 = a2.json.data.id, ref2 = a2.json.data.referenceNo; const pin2 = a2.json.data.lookupPin;
  const wrongPin = (p) => (p === '000000' ? '111111' : '000000');

  console.log('Successful lookup');
  let r = await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: pin1 });
  check('200 with correct credentials', r.status === 200 && r.json.success === true, r.json);
  check('exact public fields only',
    JSON.stringify(Object.keys(r.json.data).sort()) ===
    JSON.stringify(['eligibility', 'grantSchedule', 'phase', 'program', 'referenceNo', 'tier', 'timeline']), Object.keys(r.json.data));
  check('Submitted, no schedule, one timeline entry',
    r.json.data.phase === 'Submitted' && r.json.data.grantSchedule === null && r.json.data.timeline.length === 1);
  check('no address or name in response',
    !JSON.stringify(r.json).includes('Secret Street') && !JSON.stringify(r.json).includes(`Lookup${rand}`));
  r = await lookup({ referenceNo: ref1.toLowerCase(), birthDate: BIRTH, pin: pin1 });
  check('reference is case-insensitive', r.status === 200);

  console.log('Identical failures');
  const failures = [
    await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: wrongPin(pin1) }),
    await lookup({ referenceNo: ref1, birthDate: '2003-05-18', pin: pin1 }),
    await lookup({ referenceNo: 'ZZZZZZZZZZ', birthDate: BIRTH, pin: pin1 }),
    await lookup({ referenceNo: '', birthDate: '', pin: '' }),
    await lookup({ referenceNo: ref1, birthDate: BIRTH }),
    await lookup({ referenceNo: { $ne: 1 }, birthDate: BIRTH, pin: 123456 }),
    await call('POST', '/public/lookup')
  ];
  const first = JSON.stringify(failures[0].json);
  check('all failures are 404 with the identical body',
    failures.every((f) => f.status === 404 && f.json.message === NOT_FOUND && JSON.stringify(f.json) === first),
    failures.map((f) => f.status));

  console.log('PIN re-issue');
  check('re-issue needs login', (await call('PATCH', `/applications/${id1}/pin`)).status === 401);
  const re = await call('PATCH', `/applications/${id1}/pin`, undefined, staff);
  check('re-issue returns a new PIN', re.status === 200 && /^\d{6}$/.test(re.json.data.lookupPin), re.json);
  const oldPin = pin1; pin1 = re.json.data.lookupPin;
  if (oldPin !== pin1) {
    check('old PIN no longer works', (await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: oldPin })).status === 404);
  }
  check('new PIN works', (await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: pin1 })).status === 200);

  console.log('Phase-dependent visibility');
  await phase(id1, 'Under Review', staff);
  await call('PUT', `/applications/${id1}`, { docsComplete: true }, staff);
  await phase(id1, 'For Evaluation', staff);
  await call('PATCH', `/applications/${id1}/eligibility`, { eligibility: 'eligible', tierId: 1 }, staff);
  const appr = await phase(id1, 'Approved', staff);
  check('application approved (setup)', appr.status === 200, appr.json);
  r = await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: pin1 });
  check('Approved without schedule: grantSchedule null, tier shown',
    r.json.data.phase === 'Approved' && r.json.data.grantSchedule === null && typeof r.json.data.tier === 'string', r.json);
  await call('PUT', `/applications/${id1}/grant-schedule`, { releaseDate: '2027-01-15', venue: 'Municipal Hall', amount: 5000 }, staff);
  r = await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: pin1 });
  check('Approved with schedule: only releaseDate, venue, amount',
    r.json.data.grantSchedule && JSON.stringify(Object.keys(r.json.data.grantSchedule).sort()) ===
    JSON.stringify(['amount', 'releaseDate', 'venue']) && r.json.data.grantSchedule.amount === 5000, r.json);
  const reopen = await phase(id1, 'For Evaluation', admin, { reason: 'SECRETREOPENREASON' });
  check('admin reopen (setup)', reopen.status === 200, reopen.json);
  r = await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: pin1 });
  check('after reopen: schedule hidden, reason not leaked',
    r.json.data.phase === 'For Evaluation' && r.json.data.grantSchedule === null &&
    !JSON.stringify(r.json).includes('SECRETREOPENREASON'), r.json);
  await phase(id1, 'Approved', staff);
  r = await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: pin1 });
  check('after re-approval: schedule visible again', r.json.data.grantSchedule !== null, r.json);

  console.log('Ineligible reason stays hidden');
  await phase(id2, 'Under Review', staff);
  await phase(id2, 'Ineligible', staff, { reason: 'SECRETINELIGIBLEREASON' });
  r = await lookup({ referenceNo: ref2, birthDate: BIRTH, pin: pin2 });
  check('ineligible result shown, reason hidden',
    r.status === 200 && r.json.data.eligibility === 'ineligible' && !JSON.stringify(r.json).includes('SECRETINELIGIBLEREASON'), r.json);

  console.log('Archived');
  await call('PATCH', `/applications/${id1}/archive`, { archived: true }, staff);
  check('archived application -> generic 404',
    (await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: pin1 })).status === 404);
  check('re-issue on archived -> 409', (await call('PATCH', `/applications/${id1}/pin`, undefined, staff)).status === 409);
  await call('PATCH', `/applications/${id1}/archive`, { archived: false }, staff);
  check('restored application works again',
    (await lookup({ referenceNo: ref1, birthDate: BIRTH, pin: pin1 })).status === 200);

  console.log('Per-reference lockout');
  for (let i = 0; i < 5; i++) await lookup({ referenceNo: ref2, birthDate: BIRTH, pin: wrongPin(pin2) });
  r = await lookup({ referenceNo: ref2, birthDate: BIRTH, pin: pin2 });
  check('locked after 5 failures, even with correct credentials',
    r.status === 404 && r.json.message === NOT_FOUND, r);

  console.log('IP rate limit');
  let got429 = false;
  for (let i = 0; i < 60 && !got429; i++) {
    const x = await lookup({ referenceNo: `NOPE${rand}${i}`, birthDate: BIRTH, pin: '000000' });
    if (x.status === 429) { got429 = true; check('429 uses the standard format', x.json.success === false && typeof x.json.message === 'string'); }
  }
  check('IP limiter eventually returns 429', got429);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
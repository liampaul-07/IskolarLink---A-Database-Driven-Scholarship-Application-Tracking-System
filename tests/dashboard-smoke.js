// node tests/dashboard-smoke.js   (server running)
const BASE = process.env.BASE_URL || 'http://localhost:3000/api';
let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failed++; console.log(`  FAIL ${name}`, extra === undefined ? '' : extra); }
};
async function call(method, path, token) {
  const res = await fetch(BASE + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  let json = null; try { json = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, json };
}
const login = async (u, p) => {
  const res = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p }) });
  return (await res.json()).data.token;
};
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

(async () => {
  const staff = await login('staff1', 'Staff@12345');
  const admin = await login('admin', 'Admin@12345');

  check('needs login', (await call('GET', '/dashboard')).status === 401);

  for (const [who, token] of [['staff', staff], ['admin', admin]]) {
    const r = await call('GET', '/dashboard', token);
    check(`${who}: 200`, r.status === 200 && r.json.success === true, r.json);
    const d = r.json.data;
    check(`${who}: exact top-level keys`,
      JSON.stringify(Object.keys(d).sort()) ===
      JSON.stringify(['byPhase', 'byTier', 'eligibility', 'totalApplications', 'upcomingReleases']), Object.keys(d));
    check(`${who}: totalApplications is a number`, Number.isInteger(d.totalApplications), d.totalApplications);
    check(`${who}: byPhase has all 6 phases and sums to total`,
      Object.keys(d.byPhase).length === 6 && sum(d.byPhase) === d.totalApplications, d.byPhase);
    check(`${who}: eligibility has 3 keys and sums to total`,
      Object.keys(d.eligibility).length === 3 && sum(d.eligibility) === d.totalApplications, d.eligibility);
    check(`${who}: byTier counts do not exceed total`,
      d.byTier.reduce((a, t) => a + t.count, 0) <= d.totalApplications);
    check(`${who}: upcomingReleases at most 10, sorted, correct fields`,
      d.upcomingReleases.length <= 10 &&
      d.upcomingReleases.every((u, i, arr) =>
        JSON.stringify(Object.keys(u).sort()) ===
          JSON.stringify(['amount', 'applicantName', 'referenceNo', 'releaseDate', 'venue']) &&
        (i === 0 || arr[i - 1].releaseDate <= u.releaseDate)), d.upcomingReleases);
    check(`${who}: no sensitive field names`,
      !/"(address|birthDate|contactNumber|email|lookupPin|lookup_pin_hash|remarks)"\s*:/.test(JSON.stringify(d)));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
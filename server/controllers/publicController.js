const pool = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');
const { verifyPin } = require('../utils/pin');
const lockout = require('../utils/lookupLockout');

const NOT_FOUND = 'No matching application found.';
const fail = (res) => sendError(res, 404, NOT_FOUND);

// Anything that is not a string becomes '' (which can never match); length is capped.
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// POST /api/public/lookup   body: { referenceNo, birthDate, pin }
exports.lookup = async (req, res) => {
  const body = req.body || {};
  const referenceNo = text(body.referenceNo, 32).toUpperCase();
  const birthDate = text(body.birthDate, 32);
  const pin = text(body.pin, 20);

  // Locked references get the same generic answer as any other failure.
  if (lockout.isLocked(referenceNo)) return fail(res);

  const [rows] = await pool.execute(
    `SELECT ap.id, ap.reference_no, ap.current_phase, ap.eligibility, ap.lookup_pin_hash, ap.is_archived,
            a.birth_date, p.name AS program_name, t.tier_name
       FROM applications ap
       JOIN applicants a ON a.id = ap.applicant_id
       JOIN scholarship_programs p ON p.id = ap.program_id
       LEFT JOIN program_tiers t ON t.id = ap.tier_id
      WHERE ap.reference_no = ?`, [referenceNo]);
  const row = rows[0] || null;

  // Always one bcrypt compare, found or not, so timing does not reveal valid references.
  const pinOk = await verifyPin(pin, row && row.lookup_pin_hash);
  const dobOk = Boolean(row) && birthDate !== '' && row.birth_date === birthDate; // dateStrings: 'YYYY-MM-DD'

  if (!row || row.is_archived || !pinOk || !dobOk) {
    lockout.recordFailure(referenceNo);
    return fail(res);
  }
  lockout.clear(referenceNo);

  let grantSchedule = null;
  if (row.current_phase === 'Approved' || row.current_phase === 'Granted') {
    const [s] = await pool.execute(
      'SELECT release_date, venue, amount FROM grant_schedules WHERE application_id = ?', [row.id]);
    if (s.length) {
      grantSchedule = { releaseDate: s[0].release_date, venue: s[0].venue, amount: Number(s[0].amount) };
    }
  }

  const [history] = await pool.execute(
    'SELECT new_phase, changed_at FROM status_history WHERE application_id = ? ORDER BY changed_at, id',
    [row.id]);

  return sendSuccess(res, {
    referenceNo: row.reference_no,
    phase: row.current_phase,
    eligibility: row.eligibility,
    tier: row.tier_name,
    program: row.program_name,
    grantSchedule,
    timeline: history.map((h) => ({ phase: h.new_phase, date: String(h.changed_at).slice(0, 10) }))
  }, 'Application found.');
};
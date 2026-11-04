const pool = require('../config/db');
const { sendSuccess } = require('../utils/response');
const { PHASES, ELIGIBILITY } = require('../utils/constants');

// Every key present, 0 when nothing matches, so the front end never handles missing keys.
function countsFor(keys, rows) {
  const result = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const r of rows) result[r.k] = Number(r.count);
  return result;
}

const query = async (sql) => (await pool.execute(sql))[0]; // rows only; no user input in these queries

// GET /api/dashboard
exports.get = async (req, res) => {
  const [totalRows, phaseRows, eligRows, tierRows, releaseRows] = await Promise.all([
    query('SELECT COUNT(*) AS total FROM applications WHERE is_archived = 0'),
    query(`SELECT current_phase AS k, COUNT(*) AS count FROM applications
            WHERE is_archived = 0 GROUP BY current_phase`),
    query(`SELECT eligibility AS k, COUNT(*) AS count FROM applications
            WHERE is_archived = 0 GROUP BY eligibility`),
    query(`SELECT p.name AS program, t.tier_name AS tier, COUNT(*) AS count
             FROM applications ap
             JOIN program_tiers t ON t.id = ap.tier_id
             JOIN scholarship_programs p ON p.id = ap.program_id
            WHERE ap.is_archived = 0
            GROUP BY p.id, p.name, t.id, t.tier_name
            ORDER BY p.name, t.tier_name`),
    query(`SELECT ap.reference_no, CONCAT(a.first_name, ' ', a.last_name) AS applicant_name,
                  g.release_date, g.venue, g.amount
             FROM grant_schedules g
             JOIN applications ap ON ap.id = g.application_id
             JOIN applicants a ON a.id = ap.applicant_id
            WHERE ap.is_archived = 0 AND ap.current_phase = 'Approved' AND g.release_date >= CURDATE()
            ORDER BY g.release_date, ap.id
            LIMIT 10`)
  ]);

  return sendSuccess(res, {
    totalApplications: Number(totalRows[0].total),
    byPhase: countsFor(PHASES, phaseRows),
    eligibility: countsFor(ELIGIBILITY, eligRows),
    byTier: tierRows.map((r) => ({ program: r.program, tier: r.tier, count: Number(r.count) })),
    upcomingReleases: releaseRows.map((r) => ({
      referenceNo: r.reference_no,
      applicantName: r.applicant_name,
      releaseDate: r.release_date,
      venue: r.venue,
      amount: Number(r.amount)
    }))
  }, 'Dashboard retrieved.');
};
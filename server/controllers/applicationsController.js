const pool = require('../config/db');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const {
  parseId, parsePagination, checkString, checkAcademicYear, checkBoolean, isValidDateString
} = require('../utils/validators');
const { toApplicant, toApplicationRow, toGrantSchedule, toHistoryEntry, toTier } = require('../utils/mappers');
const { PHASES, ELIGIBILITY } = require('../utils/constants');
const { generateReferenceNo } = require('../utils/referenceNo');
const { generatePin, hashPin } = require('../utils/pin');

// ---------- helpers ----------

async function loadHistory(applicationId) {
  const [rows] = await pool.execute(
    `SELECT h.id, h.old_phase, h.new_phase, h.remarks, h.changed_at, u.full_name AS changed_by_name
       FROM status_history h
       JOIN users u ON u.id = h.changed_by
      WHERE h.application_id = ?
      ORDER BY h.changed_at, h.id`, [applicationId]);
  return rows.map(toHistoryEntry);
}

// Full record: application + applicant + program + tier + grant schedule + history.
async function loadApplication(id) {
  const [rows] = await pool.execute('SELECT * FROM applications WHERE id = ?', [id]);
  if (rows.length === 0) return null;
  const a = rows[0];

  const [[applicantRow]] = await pool.execute('SELECT * FROM applicants WHERE id = ?', [a.applicant_id]);
  const [[programRow]] = await pool.execute(
    'SELECT id, name, type, status FROM scholarship_programs WHERE id = ?', [a.program_id]);

  let tier = null;
  if (a.tier_id) {
    const [tierRows] = await pool.execute('SELECT * FROM program_tiers WHERE id = ?', [a.tier_id]);
    if (tierRows.length) tier = toTier(tierRows[0]);
  }

  const [scheduleRows] = await pool.execute('SELECT * FROM grant_schedules WHERE application_id = ?', [id]);

  return {
    id: a.id,
    referenceNo: a.reference_no,
    academicYear: a.academic_year,
    phase: a.current_phase,
    eligibility: a.eligibility,
    ineligibilityReason: a.ineligibility_reason,
    docsComplete: Boolean(a.docs_complete),
    remarks: a.remarks,
    isArchived: Boolean(a.is_archived),
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    applicant: toApplicant(applicantRow),
    program: { id: programRow.id, name: programRow.name, type: programRow.type, status: programRow.status },
    tier,
    grantSchedule: scheduleRows.length ? toGrantSchedule(scheduleRows[0]) : null,
    history: await loadHistory(id)
  };
}

// Which unique key caused a duplicate-entry error (works for MySQL and MariaDB messages).
const isDuplicateOf = (err, keyName) =>
  err.code === 'ER_DUP_ENTRY' && String(err.sqlMessage || '').includes(keyName);

const DUPLICATE_MESSAGE = 'This applicant already has an application for that program and academic year.';

// A query-string value must be a single, non-empty string to count as a filter.
function queryValue(query, key, errors) {
  const v = query[key];
  if (v === undefined || v === '') return undefined;
  if (typeof v !== 'string') {
    errors.push({ field: key, message: 'Must be a single value.' });
    return undefined;
  }
  return v;
}

// ---------- handlers ----------

// GET /api/applications?q=&phase=&eligibility=&programId=&tierId=&dateFrom=&dateTo=&archived=&page=&limit=
exports.list = async (req, res) => {
  const errors = [];
  const where = ['ap.is_archived = ?'];
  const params = [req.query.archived === 'true' ? 1 : 0];

  const q = queryValue(req.query, 'q', errors);
  if (q && q.trim() !== '') {
    const like = `%${q.trim()}%`;
    where.push(`(a.first_name LIKE ? OR a.last_name LIKE ? OR CONCAT(a.first_name, ' ', a.last_name) LIKE ?
                 OR ap.reference_no LIKE ?)`);
    params.push(like, like, like, like);
  }

  const phase = queryValue(req.query, 'phase', errors);
  if (phase !== undefined) {
    if (!PHASES.includes(phase)) errors.push({ field: 'phase', message: `Must be one of: ${PHASES.join(', ')}.` });
    else { where.push('ap.current_phase = ?'); params.push(phase); }
  }

  const eligibility = queryValue(req.query, 'eligibility', errors);
  if (eligibility !== undefined) {
    if (!ELIGIBILITY.includes(eligibility)) {
      errors.push({ field: 'eligibility', message: `Must be one of: ${ELIGIBILITY.join(', ')}.` });
    } else { where.push('ap.eligibility = ?'); params.push(eligibility); }
  }

  for (const [key, column] of [['programId', 'ap.program_id'], ['tierId', 'ap.tier_id']]) {
    const raw = queryValue(req.query, key, errors);
    if (raw === undefined) continue;
    const id = parseId(raw);
    if (!id) errors.push({ field: key, message: 'Must be a positive whole number.' });
    else { where.push(`${column} = ?`); params.push(id); }
  }

  for (const [key, operator] of [['dateFrom', '>='], ['dateTo', '<=']]) {
    const raw = queryValue(req.query, key, errors);
    if (raw === undefined) continue;
    if (!isValidDateString(raw)) errors.push({ field: key, message: 'Must be a date in YYYY-MM-DD format.' });
    else { where.push(`DATE(ap.created_at) ${operator} ?`); params.push(raw); }
  }

  if (errors.length) return sendValidationError(res, errors);

  const whereSql = where.join(' AND '); // fixed fragments only; every value is a bound parameter
  const { page, limit, offset } = parsePagination(req.query);
  const fromSql = `FROM applications ap
                   JOIN applicants a ON a.id = ap.applicant_id
                   JOIN scholarship_programs p ON p.id = ap.program_id
                   LEFT JOIN program_tiers t ON t.id = ap.tier_id`;

  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total ${fromSql} WHERE ${whereSql}`, params);
  const [rows] = await pool.execute(
    `SELECT ap.id, ap.reference_no, ap.applicant_id, CONCAT(a.first_name, ' ', a.last_name) AS applicant_name,
            ap.program_id, p.name AS program_name, ap.academic_year, ap.current_phase, ap.eligibility,
            t.tier_name, ap.docs_complete, ap.is_archived, ap.created_at
       ${fromSql}
      WHERE ${whereSql}
      ORDER BY ap.created_at DESC, ap.id DESC
      LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)]);

  return sendSuccess(res, { items: rows.map(toApplicationRow), pagination: { page, limit, total } },
    'Applications retrieved.');
};

// GET /api/applications/:id
exports.getOne = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');
  const application = await loadApplication(id);
  if (!application) return sendError(res, 404, 'Application not found.');
  return sendSuccess(res, application, 'Application retrieved.');
};

// GET /api/applications/:id/history
exports.history = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');
  const [rows] = await pool.execute('SELECT id FROM applications WHERE id = ?', [id]);
  if (rows.length === 0) return sendError(res, 404, 'Application not found.');
  return sendSuccess(res, await loadHistory(id), 'History retrieved.');
};

// POST /api/applications   body: { applicantId, programId, academicYear, docsComplete?, remarks? }
exports.create = async (req, res) => {
  const body = req.body || {};
  const errors = [];

  const applicantId = parseId(body.applicantId);
  if (!applicantId) errors.push({ field: 'applicantId', message: 'Required (a positive whole number).' });
  const programId = parseId(body.programId);
  if (!programId) errors.push({ field: 'programId', message: 'Required (a positive whole number).' });
  const academicYear = checkAcademicYear(body, 'academicYear', errors, { required: true });
  const docsComplete = checkBoolean(body, 'docsComplete', errors, { defaultValue: false });
  const remarks = checkString(body, 'remarks', errors, { max: 5000 });
  if (errors.length) return sendValidationError(res, errors);

  const [applicantRows] = await pool.execute('SELECT id, is_archived FROM applicants WHERE id = ?', [applicantId]);
  if (applicantRows.length === 0) return sendError(res, 404, 'Applicant not found.');
  const [programRows] = await pool.execute(
    'SELECT id, status, is_archived FROM scholarship_programs WHERE id = ?', [programId]);
  if (programRows.length === 0) return sendError(res, 404, 'Program not found.');

  if (applicantRows[0].is_archived) return sendError(res, 409, 'This applicant is archived.');
  if (programRows[0].is_archived || programRows[0].status !== 'active') {
    return sendError(res, 409, 'This program is not accepting applications (inactive or archived).');
  }

  const pin = generatePin();
  const pinHash = await hashPin(pin); // hashed before the transaction so bcrypt never holds a connection
  
  // Application row and its first history row are saved together or not at all.
  const conn = await pool.getConnection();
  let newId = null;
  try {
    await conn.beginTransaction();

    for (let attempt = 0; attempt < 5 && !newId; attempt++) {
      try {
        const [result] = await conn.execute(
          `INSERT INTO applications (reference_no, applicant_id, program_id, academic_year, docs_complete, remarks, lookup_pin_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [generateReferenceNo(), applicantId, programId, academicYear, docsComplete ? 1 : 0, remarks, pinHash]);
        newId = result.insertId;
      } catch (err) {
        if (isDuplicateOf(err, 'uq_reference_no')) continue; // astronomically rare: draw a new number
        throw err;
      }
    }
    if (!newId) throw new Error('Could not generate a unique reference number.');

    await conn.execute(
      `INSERT INTO status_history (application_id, old_phase, new_phase, changed_by, remarks)
       VALUES (?, NULL, 'Submitted', ?, 'Application submitted.')`, [newId, req.user.id]);

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch (rollbackError) { /* connection already gone */ }
    if (isDuplicateOf(err, 'uq_application_dup')) return sendError(res, 409, DUPLICATE_MESSAGE);
    throw err;
  } finally {
    conn.release();
  }

  // The plain PIN is returned this once and never stored.
  const record = await loadApplication(newId);
  return sendSuccess(res, { ...record, lookupPin: pin }, 'Application created.', 201);
};

// PUT /api/applications/:id   body: any of { academicYear, docsComplete, remarks }
// Workflow fields (phase, eligibility, tier, grant schedule) are NOT editable here.
exports.update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const body = req.body || {};
  const errors = [];
  const sets = [];
  const params = [];

  if (body.academicYear !== undefined) {
    const year = checkAcademicYear(body, 'academicYear', errors, { required: true });
    if (year) { sets.push('academic_year = ?'); params.push(year); }
  }
  if (body.docsComplete !== undefined) {
    const value = checkBoolean(body, 'docsComplete', errors);
    if (value !== null) { sets.push('docs_complete = ?'); params.push(value ? 1 : 0); }
  }
  if (body.remarks !== undefined) {
    const remarks = checkString(body, 'remarks', errors, { max: 5000 });
    sets.push('remarks = ?'); params.push(remarks); // blank clears the remarks
  }

  if (errors.length) return sendValidationError(res, errors);
  if (sets.length === 0) {
    return sendValidationError(res, [{ field: 'body', message: 'Provide at least one field to change.' }]);
  }

  const [rows] = await pool.execute('SELECT id, is_archived FROM applications WHERE id = ?', [id]);
  if (rows.length === 0) return sendError(res, 404, 'Application not found.');
  if (rows[0].is_archived) return sendError(res, 409, 'Archived applications cannot be edited. Restore it first.');

  try {
    await pool.execute(`UPDATE applications SET ${sets.join(', ')} WHERE id = ?`, [...params, id]); // columns are fixed strings above
  } catch (err) {
    if (isDuplicateOf(err, 'uq_application_dup')) return sendError(res, 409, DUPLICATE_MESSAGE);
    throw err;
  }
  return sendSuccess(res, await loadApplication(id), 'Application updated.');
};

// PATCH /api/applications/:id/archive   body: { archived: true | false }
exports.archive = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const archived = req.body && req.body.archived;
  if (typeof archived !== 'boolean') {
    return sendValidationError(res, [{ field: 'archived', message: 'Must be true or false.' }]);
  }

  const [rows] = await pool.execute('SELECT id FROM applications WHERE id = ?', [id]);
  if (rows.length === 0) return sendError(res, 404, 'Application not found.');

  await pool.execute('UPDATE applications SET is_archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
  return sendSuccess(res, await loadApplication(id), archived ? 'Application archived.' : 'Application restored.');
};

// PATCH /api/applications/:id/pin   (re-issue; the old PIN stops working immediately)
exports.reissuePin = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const [rows] = await pool.execute(
    'SELECT id, reference_no, is_archived FROM applications WHERE id = ?', [id]);
  if (rows.length === 0) return sendError(res, 404, 'Application not found.');
  if (rows[0].is_archived) return sendError(res, 409, 'Archived applications cannot be changed. Restore it first.');

  const pin = generatePin();
  await pool.execute('UPDATE applications SET lookup_pin_hash = ? WHERE id = ?', [await hashPin(pin), id]);
  return sendSuccess(res, { id, referenceNo: rows[0].reference_no, lookupPin: pin },
    'New lookup PIN issued. It is shown only once.');
};

// Exported for the workflow controller (next step).
exports.loadApplication = loadApplication;
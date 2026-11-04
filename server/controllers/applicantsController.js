const pool = require('../config/db');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const {
  parseId, parsePagination, checkString, checkNumber, checkEnum, checkDate, checkEmail, checkPhone
} = require('../utils/validators');
const { toApplicant } = require('../utils/mappers');
const { CLOSED_PHASES } = require('../utils/constants');

const SEX = ['male', 'female'];
const DUPLICATE_MESSAGE = 'An applicant with the same name and birth date already exists.';

async function findApplicant(id) {
  const [rows] = await pool.execute('SELECT * FROM applicants WHERE id = ?', [id]);
  return rows.length ? toApplicant(rows[0]) : null;
}

// Reads and validates the body shared by POST and PUT.
function readApplicantBody(body) {
  const errors = [];
  const v = {
    firstName: checkString(body, 'firstName', errors, { required: true, max: 60 }),
    middleName: checkString(body, 'middleName', errors, { max: 60 }),
    lastName: checkString(body, 'lastName', errors, { required: true, max: 60 }),
    birthDate: checkDate(body, 'birthDate', errors, { required: true, notFuture: true }),
    sex: checkEnum(body, 'sex', SEX, errors),
    email: checkEmail(body, 'email', errors),
    contactNumber: checkPhone(body, 'contactNumber', errors),
    address: checkString(body, 'address', errors, { required: true, max: 255 }),
    school: checkString(body, 'school', errors, { max: 120 }),
    courseOrStrand: checkString(body, 'courseOrStrand', errors, { max: 100 }),
    yearLevel: checkString(body, 'yearLevel', errors, { max: 20 }),
    gwa: checkNumber(body, 'gwa', errors, { min: 0, max: 99.99 }),
    householdIncome: checkNumber(body, 'householdIncome', errors, { min: 0, max: 9999999999.99 })
  };
  return { errors, v };
}

const COLUMN_VALUES = (v) => [
  v.firstName, v.middleName, v.lastName, v.birthDate, v.sex, v.email, v.contactNumber,
  v.address, v.school, v.courseOrStrand, v.yearLevel, v.gwa, v.householdIncome
];

// GET /api/applicants?q=&archived=true&page=&limit=
exports.list = async (req, res) => {
  const { q, archived } = req.query;
  if (q !== undefined && typeof q !== 'string') {
    return sendValidationError(res, [{ field: 'q', message: 'Must be text.' }]);
  }

  const where = ['is_archived = ?'];
  const params = [archived === 'true' ? 1 : 0];
  if (q && q.trim() !== '') {
    const like = `%${q.trim()}%`;
    where.push("(first_name LIKE ? OR middle_name LIKE ? OR last_name LIKE ? OR CONCAT(first_name, ' ', last_name) LIKE ?)");
    params.push(like, like, like, like);
  }
  const whereSql = where.join(' AND '); // fixed fragments only; every value is a bound parameter

  const { page, limit, offset } = parsePagination(req.query);
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM applicants WHERE ${whereSql}`, params);
  const [rows] = await pool.execute(
    `SELECT * FROM applicants WHERE ${whereSql} ORDER BY last_name, first_name LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)]);

  return sendSuccess(res, { items: rows.map(toApplicant), pagination: { page, limit, total } }, 'Applicants retrieved.');
};

// GET /api/applicants/:id   (includes a summary of the applicant's applications)
exports.getOne = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid applicant id.');

  const applicant = await findApplicant(id);
  if (!applicant) return sendError(res, 404, 'Applicant not found.');

  const [apps] = await pool.execute(
    `SELECT ap.id, ap.reference_no, p.name AS program_name, ap.academic_year,
            ap.current_phase, ap.eligibility, ap.is_archived
       FROM applications ap
       JOIN scholarship_programs p ON p.id = ap.program_id
      WHERE ap.applicant_id = ?
      ORDER BY ap.created_at DESC, ap.id DESC`, [id]);

  const applications = apps.map((a) => ({
    id: a.id,
    referenceNo: a.reference_no,
    programName: a.program_name,
    academicYear: a.academic_year,
    phase: a.current_phase,
    eligibility: a.eligibility,
    isArchived: Boolean(a.is_archived)
  }));
  return sendSuccess(res, { ...applicant, applications }, 'Applicant retrieved.');
};

// POST /api/applicants
exports.create = async (req, res) => {
  const { errors, v } = readApplicantBody(req.body || {});
  if (errors.length) return sendValidationError(res, errors);

  try {
    const [result] = await pool.execute(
      `INSERT INTO applicants
         (first_name, middle_name, last_name, birth_date, sex, email, contact_number,
          address, school, course_or_strand, year_level, gwa, household_income)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, COLUMN_VALUES(v));
    return sendSuccess(res, await findApplicant(result.insertId), 'Applicant created.', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return sendError(res, 409, DUPLICATE_MESSAGE);
    throw err;
  }
};

// PUT /api/applicants/:id
exports.update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid applicant id.');

  const { errors, v } = readApplicantBody(req.body || {});
  if (errors.length) return sendValidationError(res, errors);
  if (!(await findApplicant(id))) return sendError(res, 404, 'Applicant not found.');

  try {
    await pool.execute(
      `UPDATE applicants
          SET first_name = ?, middle_name = ?, last_name = ?, birth_date = ?, sex = ?, email = ?,
              contact_number = ?, address = ?, school = ?, course_or_strand = ?, year_level = ?,
              gwa = ?, household_income = ?
        WHERE id = ?`, [...COLUMN_VALUES(v), id]);
    return sendSuccess(res, await findApplicant(id), 'Applicant updated.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return sendError(res, 409, DUPLICATE_MESSAGE);
    throw err;
  }
};

// PATCH /api/applicants/:id/archive   body: { archived: true | false }
exports.archive = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid applicant id.');

  const archived = req.body && req.body.archived;
  if (typeof archived !== 'boolean') {
    return sendValidationError(res, [{ field: 'archived', message: 'Must be true or false.' }]);
  }
  if (!(await findApplicant(id))) return sendError(res, 404, 'Applicant not found.');

  if (archived) {
    const [[{ count }]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM applications
        WHERE applicant_id = ? AND is_archived = 0
          AND current_phase NOT IN (${CLOSED_PHASES.map(() => '?').join(', ')})`,
      [id, ...CLOSED_PHASES]);
    if (count > 0) {
      return sendError(res, 409, 'Cannot archive an applicant who still has open applications.');
    }
  }

  await pool.execute('UPDATE applicants SET is_archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
  return sendSuccess(res, await findApplicant(id), archived ? 'Applicant archived.' : 'Applicant restored.');
};
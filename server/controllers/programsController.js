const pool = require('../config/db');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { parseId, parsePagination, checkString, checkNumber, checkEnum } = require('../utils/validators');
const { toProgram, toTier } = require('../utils/mappers');

const TYPES = ['grant', 'non_grant'];
const STATUSES = ['active', 'inactive'];

async function findProgram(id) {
  const [rows] = await pool.execute('SELECT * FROM scholarship_programs WHERE id = ?', [id]);
  return rows.length ? toProgram(rows[0]) : null;
}

// Reads and validates the request body shared by POST and PUT.
function readProgramBody(body) {
  const errors = [];
  const values = {
    name: checkString(body, 'name', errors, { required: true, max: 120 }),
    description: checkString(body, 'description', errors, { max: 5000 }),
    type: checkEnum(body, 'type', TYPES, errors, { required: true }),
    criteria: checkString(body, 'criteria', errors, { max: 5000 }),
    minGwa: checkNumber(body, 'minGwa', errors, { min: 0, max: 99.99 }),
    maxHouseholdIncome: checkNumber(body, 'maxHouseholdIncome', errors, { min: 0, max: 9999999999.99 }),
    status: checkEnum(body, 'status', STATUSES, errors, { defaultValue: 'active' })
  };
  return { errors, values };
}

// GET /api/programs?type=&status=&archived=true&q=&page=&limit=
exports.list = async (req, res) => {
  const { type, status, q, archived } = req.query;
  const errors = [];
  const where = ['is_archived = ?'];
  const params = [archived === 'true' ? 1 : 0];

  if (type !== undefined) {
    if (!TYPES.includes(type)) errors.push({ field: 'type', message: `Must be one of: ${TYPES.join(', ')}.` });
    else { where.push('type = ?'); params.push(type); }
  }
  if (status !== undefined) {
    if (!STATUSES.includes(status)) errors.push({ field: 'status', message: `Must be one of: ${STATUSES.join(', ')}.` });
    else { where.push('status = ?'); params.push(status); }
  }
  if (q !== undefined) {
    if (typeof q !== 'string') errors.push({ field: 'q', message: 'Must be text.' });
    else if (q.trim() !== '') { where.push('name LIKE ?'); params.push(`%${q.trim()}%`); }
  }
  if (errors.length) return sendValidationError(res, errors);

  const { page, limit, offset } = parsePagination(req.query);
  const whereSql = where.join(' AND '); // fixed fragments only; all values are bound as parameters

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM scholarship_programs WHERE ${whereSql}`, params);
  // LIMIT/OFFSET are passed as strings because MySQL 8 prepared statements reject numbers here
  const [rows] = await pool.execute(
    `SELECT * FROM scholarship_programs WHERE ${whereSql} ORDER BY name LIMIT ? OFFSET ?`,
    [...params, String(limit), String(offset)]);

  return sendSuccess(res, { items: rows.map(toProgram), pagination: { page, limit, total } }, 'Programs retrieved.');
};

// GET /api/programs/:id
exports.getOne = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid program id.');

  const program = await findProgram(id);
  if (!program) return sendError(res, 404, 'Program not found.');

  const [tiers] = await pool.execute(
    'SELECT * FROM program_tiers WHERE program_id = ? ORDER BY tier_name', [id]);
  return sendSuccess(res, { ...program, tiers: tiers.map(toTier) }, 'Program retrieved.');
};

// POST /api/programs
exports.create = async (req, res) => {
  const { errors, values: v } = readProgramBody(req.body || {});
  if (errors.length) return sendValidationError(res, errors);

  try {
    const [result] = await pool.execute(
      `INSERT INTO scholarship_programs
         (name, description, type, criteria, min_gwa, max_household_income, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [v.name, v.description, v.type, v.criteria, v.minGwa, v.maxHouseholdIncome, v.status]);
    return sendSuccess(res, await findProgram(result.insertId), 'Program created.', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'A program with that name already exists.');
    throw err;
  }
};

// PUT /api/programs/:id
exports.update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid program id.');

  const { errors, values: v } = readProgramBody(req.body || {});
  if (errors.length) return sendValidationError(res, errors);

  const existing = await findProgram(id);
  if (!existing) return sendError(res, 404, 'Program not found.');

  // Changing grant <-> non_grant after applications exist would break grant schedule rules.
  if (v.type !== existing.type) {
    const [[{ count }]] = await pool.execute(
      'SELECT COUNT(*) AS count FROM applications WHERE program_id = ?', [id]);
    if (count > 0) {
      return sendError(res, 409, 'Cannot change the type of a program that already has applications.');
    }
  }

  try {
    await pool.execute(
      `UPDATE scholarship_programs
          SET name = ?, description = ?, type = ?, criteria = ?,
              min_gwa = ?, max_household_income = ?, status = ?
        WHERE id = ?`,
      [v.name, v.description, v.type, v.criteria, v.minGwa, v.maxHouseholdIncome, v.status, id]);
    return sendSuccess(res, await findProgram(id), 'Program updated.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'A program with that name already exists.');
    throw err;
  }
};

// PATCH /api/programs/:id/archive   body: { archived: true | false }
exports.archive = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid program id.');

  const archived = req.body && req.body.archived;
  if (typeof archived !== 'boolean') {
    return sendValidationError(res, [{ field: 'archived', message: 'Must be true or false.' }]);
  }

  const existing = await findProgram(id);
  if (!existing) return sendError(res, 404, 'Program not found.');

  if (archived) {
    const [[{ count }]] = await pool.execute(
      `SELECT COUNT(*) AS count FROM applications
        WHERE program_id = ? AND is_archived = 0
          AND current_phase NOT IN ('Ineligible', 'Granted')`, [id]);
    if (count > 0) {
      return sendError(res, 409, 'Cannot archive a program that still has open applications.');
    }
  }

  await pool.execute('UPDATE scholarship_programs SET is_archived = ? WHERE id = ?', [archived ? 1 : 0, id]);
  return sendSuccess(res, await findProgram(id), archived ? 'Program archived.' : 'Program restored.');
};
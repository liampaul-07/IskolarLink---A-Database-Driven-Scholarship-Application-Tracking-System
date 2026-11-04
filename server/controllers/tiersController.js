const pool = require('../config/db');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { parseId, checkString, checkNumber } = require('../utils/validators');
const { toTier } = require('../utils/mappers');

function readTierBody(body) {
  const errors = [];
  const values = {
    tierName: checkString(body, 'tierName', errors, { required: true, max: 50 }),
    description: checkString(body, 'description', errors, { max: 255 }),
    defaultAmount: checkNumber(body, 'defaultAmount', errors, { min: 0, max: 99999999.99 })
  };
  return { errors, values };
}

async function programExists(id) {
  const [rows] = await pool.execute('SELECT id FROM scholarship_programs WHERE id = ?', [id]);
  return rows.length > 0;
}

async function findTier(id) {
  const [rows] = await pool.execute('SELECT * FROM program_tiers WHERE id = ?', [id]);
  return rows.length ? toTier(rows[0]) : null;
}

// GET /api/programs/:id/tiers
exports.listForProgram = async (req, res) => {
  const programId = parseId(req.params.id);
  if (!programId) return sendError(res, 400, 'Invalid program id.');
  if (!(await programExists(programId))) return sendError(res, 404, 'Program not found.');

  const [rows] = await pool.execute(
    'SELECT * FROM program_tiers WHERE program_id = ? ORDER BY tier_name', [programId]);
  return sendSuccess(res, rows.map(toTier), 'Tiers retrieved.');
};

// POST /api/programs/:id/tiers
exports.createForProgram = async (req, res) => {
  const programId = parseId(req.params.id);
  if (!programId) return sendError(res, 400, 'Invalid program id.');

  const { errors, values: v } = readTierBody(req.body || {});
  if (errors.length) return sendValidationError(res, errors);
  if (!(await programExists(programId))) return sendError(res, 404, 'Program not found.');

  try {
    const [result] = await pool.execute(
      'INSERT INTO program_tiers (program_id, tier_name, description, default_amount) VALUES (?, ?, ?, ?)',
      [programId, v.tierName, v.description, v.defaultAmount]);
    return sendSuccess(res, await findTier(result.insertId), 'Tier created.', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'That program already has a tier with this name.');
    throw err;
  }
};

// PUT /api/tiers/:id
exports.update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid tier id.');

  const { errors, values: v } = readTierBody(req.body || {});
  if (errors.length) return sendValidationError(res, errors);
  if (!(await findTier(id))) return sendError(res, 404, 'Tier not found.');

  try {
    await pool.execute(
      'UPDATE program_tiers SET tier_name = ?, description = ?, default_amount = ? WHERE id = ?',
      [v.tierName, v.description, v.defaultAmount, id]);
    return sendSuccess(res, await findTier(id), 'Tier updated.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'That program already has a tier with this name.');
    throw err;
  }
};

// DELETE /api/tiers/:id
exports.remove = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid tier id.');
  if (!(await findTier(id))) return sendError(res, 404, 'Tier not found.');

  const [[{ count }]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM applications WHERE tier_id = ?', [id]);
  if (count > 0) return sendError(res, 409, 'Cannot delete a tier that is assigned to applications.');

  await pool.execute('DELETE FROM program_tiers WHERE id = ?', [id]);
  return sendSuccess(res, null, 'Tier deleted.');
};
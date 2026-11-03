const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { parseId, parsePagination, checkString, checkEnum, isBlank } = require('../utils/validators');
const { toUser } = require('../utils/mappers');

const ROLES = ['admin', 'staff'];
const USER_COLUMNS = 'id, username, full_name, role, is_active, created_at'; // never password_hash

async function findUser(id) {
  const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows.length ? toUser(rows[0]) : null;
}

// Returns the password if valid, else pushes an error and returns null.
// Max 72 because bcrypt only uses the first 72 bytes.
function checkPassword(value, errors, field = 'password') {
  if (typeof value !== 'string' || value === '') {
    errors.push({ field, message: 'Required.' });
    return null;
  }
  if (value.length < 8 || value.length > 72) {
    errors.push({ field, message: 'Must be 8 to 72 characters.' });
    return null;
  }
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    errors.push({ field, message: 'Must contain at least one letter and one number.' });
    return null;
  }
  return value;
}

function checkUsername(body, errors) {
  const username = checkString(body, 'username', errors, { required: true, max: 50 });
  if (username && !/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
    errors.push({ field: 'username', message: '3 to 50 characters: letters, numbers, dot, dash, underscore.' });
    return null;
  }
  return username;
}

// GET /api/users
exports.list = async (req, res) => {
  const { page, limit, offset } = parsePagination(req.query);
  const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM users');
  const [rows] = await pool.execute(
    `SELECT ${USER_COLUMNS} FROM users ORDER BY username LIMIT ? OFFSET ?`,
    [String(limit), String(offset)]
  );
  return sendSuccess(res, { items: rows.map(toUser), pagination: { page, limit, total } }, 'Users retrieved.');
};

// POST /api/users   body: { username, password, fullName, role }
exports.create = async (req, res) => {
  const body = req.body || {};
  const errors = [];
  const username = checkUsername(body, errors);
  const password = checkPassword(body.password, errors);
  const fullName = checkString(body, 'fullName', errors, { required: true, max: 100 });
  const role = checkEnum(body, 'role', ROLES, errors, { defaultValue: 'staff' });
  if (errors.length) return sendValidationError(res, errors);

  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [username, hash, fullName, role]
    );
    return sendSuccess(res, await findUser(result.insertId), 'User created.', 201);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'That username is already taken.');
    throw err;
  }
};

// PATCH /api/users/:id   body: any of { fullName, role, isActive, password }
exports.update = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid user id.');

  const body = req.body || {};
  const errors = [];
  const sets = [];
  const params = [];

  if (body.fullName !== undefined) {
    const fullName = checkString(body, 'fullName', errors, { required: true, max: 100 });
    if (fullName) { sets.push('full_name = ?'); params.push(fullName); }
  }
  if (body.role !== undefined) {
    const role = checkEnum(body, 'role', ROLES, errors, { required: true });
    if (role) { sets.push('role = ?'); params.push(role); }
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      errors.push({ field: 'isActive', message: 'Must be true or false.' });
    } else {
      sets.push('is_active = ?'); params.push(body.isActive ? 1 : 0);
    }
  }
  if (body.password !== undefined && !isBlank(body.password)) {
    const password = checkPassword(body.password, errors);
    if (password) { sets.push('password_hash = ?'); params.push(await bcrypt.hash(password, 10)); }
  }

  if (errors.length) return sendValidationError(res, errors);
  if (sets.length === 0) {
    return sendValidationError(res, [{ field: 'body', message: 'Provide at least one field to change.' }]);
  }

  const existing = await findUser(id);
  if (!existing) return sendError(res, 404, 'User not found.');

  // An admin must not lock themselves out (or leave the system with no admin by accident).
  if (id === req.user.id &&
      ((body.role !== undefined && body.role !== 'admin') || body.isActive === false)) {
    return sendError(res, 409, 'You cannot demote or deactivate your own account.');
  }

  await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]); // column names are fixed strings above
  return sendSuccess(res, await findUser(id), 'User updated.');
};
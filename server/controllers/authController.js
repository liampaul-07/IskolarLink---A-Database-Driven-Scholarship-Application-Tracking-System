const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { isBlank } = require('../utils/validators');

// Used when the username does not exist, so a failed login takes about as long as one
// with a real account (otherwise response time reveals which usernames exist).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const INVALID = 'Invalid username or password.';

// POST /api/auth/login   body: { username, password }
exports.login = async (req, res) => {
  const body = req.body || {};
  const errors = [];
  if (isBlank(body.username) || typeof body.username !== 'string') {
    errors.push({ field: 'username', message: 'Required.' });
  }
  if (isBlank(body.password) || typeof body.password !== 'string') {
    errors.push({ field: 'password', message: 'Required.' });
  }
  if (errors.length) return sendValidationError(res, errors);

  const [rows] = await pool.execute(
    'SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = ?',
    [body.username.trim()]
  );
  const user = rows[0];

  const passwordOk = await bcrypt.compare(body.password, user ? user.password_hash : DUMMY_HASH);

  // One generic message for: unknown user, wrong password, and deactivated account.
  if (!user || !passwordOk || !user.is_active) {
    return sendError(res, 401, INVALID);
  }

  const token = jwt.sign({}, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user.id),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  });

  return sendSuccess(res, {
    token,
    user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role }
  }, 'Login successful.');
};

// GET /api/auth/me
exports.me = async (req, res) => sendSuccess(res, req.user, 'Current user retrieved.');
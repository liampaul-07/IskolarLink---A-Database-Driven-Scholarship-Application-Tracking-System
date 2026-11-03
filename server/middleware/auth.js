const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendError } = require('../utils/response');

// Protects a route: requires "Authorization: Bearer <token>".
// The token only identifies the user. The account is re-checked in the database on every
// request, so a deactivated user, or a changed role, takes effect immediately and not
// only when the token expires. On success, req.user = { id, username, fullName, role }.
async function requireAuth(req, res, next) {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return sendError(res, 401, 'Authentication required.');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return sendError(res, 401, 'Invalid or expired token.');
    }

    const [rows] = await pool.execute(
      'SELECT id, username, full_name, role, is_active FROM users WHERE id = ?',
      [payload.sub]
    );
    if (rows.length === 0 || !rows[0].is_active) {
      return sendError(res, 401, 'Invalid or expired token.');
    }

    req.user = {
      id: rows[0].id,
      username: rows[0].username,
      fullName: rows[0].full_name,
      role: rows[0].role
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

// Use after requireAuth: requireRole('admin') or requireRole('admin', 'staff').
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 403, 'You do not have permission to do this.');
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
const express = require('express');
const pool = require('../config/db');
const { sendSuccess, sendError } = require('../utils/response');

const router = express.Router();

// GET /api/health
router.get('/', async (req, res) => {
  try {
    await pool.execute('SELECT 1');
    return sendSuccess(res, { status: 'ok', database: 'connected' }, 'Server is running.');
  } catch (err) {
    console.error('Health check failed:', err.code || err.message); // log server-side only
    return sendError(res, 500, 'Database connection failed.');
  }
});

module.exports = router;
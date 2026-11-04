const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { sendError } = require('../utils/response');
const publicCtrl = require('../controllers/publicController');

const router = express.Router();

// Only failed lookups (404) count; successful ones are skipped.
// Use the same option name (limit or max) that routes/auth.js uses.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => sendError(res, 429, 'Too many attempts. Please try again later.')
});

router.post('/lookup', lookupLimiter, asyncHandler(publicCtrl.lookup));

module.exports = router;
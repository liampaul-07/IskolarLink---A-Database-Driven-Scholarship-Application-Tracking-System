const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { sendError } = require('../utils/response');
const { requireAuth } = require('../middleware/auth');
const auth = require('../controllers/authController');

const router = express.Router();

// Slows down password guessing: 10 failed attempts per 15 minutes per IP.
// Successful logins are not counted. (In memory: resets when the server restarts.)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => sendError(res, 429, 'Too many login attempts. Please try again later.')
});

router.post('/login', loginLimiter, asyncHandler(auth.login));
router.get('/me', requireAuth, asyncHandler(auth.me));

module.exports = router;
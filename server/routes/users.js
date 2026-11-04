const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const users = require('../controllers/usersController');

const router = express.Router();

// Everything here is admin only.
router.use(requireAuth, requireRole('admin'));

router.get('/', asyncHandler(users.list));
router.post('/', asyncHandler(users.create));
router.patch('/:id', asyncHandler(users.update));

module.exports = router;
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const tiers = require('../controllers/tiersController');

const router = express.Router();

// Editing and deleting tiers is admin only (reading tiers goes through /api/programs/:id/tiers).
router.use(requireAuth, requireRole('admin'));

router.put('/:id', asyncHandler(tiers.update));
router.delete('/:id', asyncHandler(tiers.remove));

module.exports = router;
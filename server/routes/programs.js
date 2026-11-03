const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const programs = require('../controllers/programsController');
const tiers = require('../controllers/tiersController');

const router = express.Router();

// Any logged-in user can read; only admins can create, edit, or archive.
router.use(requireAuth);
const adminOnly = requireRole('admin');

router.get('/', asyncHandler(programs.list));
router.post('/', adminOnly, asyncHandler(programs.create));
router.get('/:id', asyncHandler(programs.getOne));
router.put('/:id', adminOnly, asyncHandler(programs.update));
router.patch('/:id/archive', adminOnly, asyncHandler(programs.archive));

router.get('/:id/tiers', asyncHandler(tiers.listForProgram));
router.post('/:id/tiers', adminOnly, asyncHandler(tiers.createForProgram));

module.exports = router;
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const programs = require('../controllers/programsController');
const tiers = require('../controllers/tiersController');

const router = express.Router();

// TODO (auth step): reads -> requireAuth; writes -> requireAuth + requireRole('admin')

router.get('/', asyncHandler(programs.list));
router.post('/', asyncHandler(programs.create));
router.get('/:id', asyncHandler(programs.getOne));
router.put('/:id', asyncHandler(programs.update));
router.patch('/:id/archive', asyncHandler(programs.archive));

router.get('/:id/tiers', asyncHandler(tiers.listForProgram));
router.post('/:id/tiers', asyncHandler(tiers.createForProgram));

module.exports = router;
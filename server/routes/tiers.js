const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const tiers = require('../controllers/tiersController');

const router = express.Router();

// TODO (auth step): requireAuth + requireRole('admin')

router.put('/:id', asyncHandler(tiers.update));
router.delete('/:id', asyncHandler(tiers.remove));

module.exports = router;
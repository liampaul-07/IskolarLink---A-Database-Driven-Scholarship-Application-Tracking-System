const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const applicants = require('../controllers/applicantsController');

const router = express.Router();

// Staff and admin can both manage applicants.
router.use(requireAuth);

router.get('/', asyncHandler(applicants.list));
router.post('/', asyncHandler(applicants.create));
router.get('/:id', asyncHandler(applicants.getOne));
router.put('/:id', asyncHandler(applicants.update));
router.patch('/:id/archive', asyncHandler(applicants.archive));

module.exports = router;
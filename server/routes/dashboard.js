const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const dashboard = require('../controllers/dashboardController');

const router = express.Router();
router.use(requireAuth);
router.get('/', asyncHandler(dashboard.get));

module.exports = router;
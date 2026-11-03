const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const applications = require('../controllers/applicationsController');
const workflow = require('../controllers/workflowController');

const router = express.Router();

// Staff and admin can both manage applications.
router.use(requireAuth);

router.get('/', asyncHandler(applications.list));
router.post('/', asyncHandler(applications.create));
router.get('/:id', asyncHandler(applications.getOne));
router.put('/:id', asyncHandler(applications.update));
router.patch('/:id/archive', asyncHandler(applications.archive));
router.get('/:id/history', asyncHandler(applications.history));

// Workflow routes (phase, eligibility, tier, grant schedule) are added in the next step.
router.patch('/:id/phase', asyncHandler(workflow.changePhase));
router.patch('/:id/eligibility', asyncHandler(workflow.setEligibility));
router.patch('/:id/tier', asyncHandler(workflow.setTier));
router.get('/:id/grant-schedule', asyncHandler(workflow.getGrantSchedule));
router.put('/:id/grant-schedule', asyncHandler(workflow.putGrantSchedule));
router.delete('/:id/grant-schedule', asyncHandler(workflow.deleteGrantSchedule));

module.exports = router;
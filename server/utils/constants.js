// Values shared by several controllers. Must match the ENUMs in database/schema.sql.

const PHASES = ['Submitted', 'Under Review', 'For Evaluation', 'Approved', 'Ineligible', 'Granted'];
const ELIGIBILITY = ['pending', 'eligible', 'ineligible'];

// Phases in which an application is finished (no more work expected).
const CLOSED_PHASES = ['Ineligible', 'Granted'];

// Allowed phase changes. Approved -> For Evaluation is the admin-only reopen.
const TRANSITIONS = {
  'Submitted':      ['Under Review'],
  'Under Review':   ['For Evaluation', 'Ineligible'],
  'For Evaluation': ['Approved', 'Ineligible'],
  'Approved':       ['Granted', 'For Evaluation'],
  'Ineligible':     [],
  'Granted':        []
};

module.exports = { PHASES, ELIGIBILITY, CLOSED_PHASES, TRANSITIONS };
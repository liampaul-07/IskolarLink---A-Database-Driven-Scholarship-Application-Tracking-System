const pool = require('../config/db');
const { sendSuccess, sendError, sendValidationError } = require('../utils/response');
const { parseId, checkString, checkNumber, checkDate, checkEnum } = require('../utils/validators');
const { toGrantSchedule } = require('../utils/mappers');
const { PHASES, TRANSITIONS } = require('../utils/constants');
const { loadApplication } = require('./applicationsController');

// Runs fn(conn, application) inside a transaction with the application row locked.
// fn returns nothing to commit, or { status, message } / { errors } to roll back and fail.
// Returns true when committed; otherwise the error response has already been sent.
async function withLockedApplication(res, id, fn) {
  const conn = await pool.getConnection();
  let failure = null;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM applications WHERE id = ? FOR UPDATE', [id]);
    if (rows.length === 0) {
      failure = { status: 404, message: 'Application not found.' };
    } else if (rows[0].is_archived) {
      failure = { status: 409, message: 'Archived applications cannot be changed. Restore it first.' };
    } else {
      failure = (await fn(conn, rows[0])) || null;
    }

    if (!failure) {
      await conn.commit();
      return true;
    }
    await conn.rollback();
  } catch (err) {
    try { await conn.rollback(); } catch (rollbackError) { /* connection already gone */ }
    throw err;
  } finally {
    conn.release();
  }

  if (failure.errors) sendValidationError(res, failure.errors);
  else sendError(res, failure.status, failure.message);
  return false;
}

// A tier must exist and belong to the application's program.
async function tierBelongsToProgram(conn, tierId, programId) {
  const [rows] = await conn.execute(
    'SELECT id FROM program_tiers WHERE id = ? AND program_id = ?', [tierId, programId]);
  return rows.length > 0;
}

// PATCH /api/applications/:id/phase   body: { newPhase, remarks?, reason? }
exports.changePhase = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const body = req.body || {};
  const errors = [];
  const newPhase = checkEnum(body, 'newPhase', PHASES, errors, { required: true });
  const remarks = checkString(body, 'remarks', errors, { max: 255 });
  const reason = checkString(body, 'reason', errors, { max: 255 });
  if (newPhase === 'Ineligible' && !reason && !errors.some((e) => e.field === 'reason')) {
    errors.push({ field: 'reason', message: 'Required when marking an application Ineligible.' });
  }
  if (errors.length) return sendValidationError(res, errors);

  const ok = await withLockedApplication(res, id, async (conn, app) => {
    const from = app.current_phase;
    const isReopen = from === 'Approved' && newPhase === 'For Evaluation';

    if (isReopen) {
      if (req.user.role !== 'admin') {
        return { status: 403, message: 'Only an administrator can reopen an approved application.' };
      }
      if (!reason) {
        return { errors: [{ field: 'reason', message: 'Required when reopening an application.' }] };
      }
    }

    if (!TRANSITIONS[from].includes(newPhase)) {
      return { status: 409, message: `An application cannot move from ${from} to ${newPhase}.` };
    }

    if (newPhase === 'For Evaluation' && !isReopen && !app.docs_complete) {
      return { status: 409, message: 'Documents must be marked complete before evaluation.' };
    }

    if (newPhase === 'Approved' && (app.eligibility !== 'eligible' || !app.tier_id)) {
      return { status: 409, message: 'An application needs an eligible result and a tier before approval.' };
    }

    if (newPhase === 'Granted') {
      const [[program]] = await conn.execute(
        'SELECT type FROM scholarship_programs WHERE id = ?', [app.program_id]);
      if (program.type === 'grant') {
        const [schedule] = await conn.execute(
          'SELECT id FROM grant_schedules WHERE application_id = ?', [app.id]);
        if (schedule.length === 0) {
          return { status: 409, message: 'A grant schedule is required before marking this application Granted.' };
        }
      }
    }

    // Phase and eligibility stay in sync: Ineligible sets both and clears the tier.
    if (newPhase === 'Ineligible') {
      await conn.execute(
        `UPDATE applications
            SET current_phase = 'Ineligible', eligibility = 'ineligible',
                ineligibility_reason = ?, tier_id = NULL
          WHERE id = ?`, [reason, app.id]);
    } else {
      await conn.execute('UPDATE applications SET current_phase = ? WHERE id = ?', [newPhase, app.id]);
    }

    const historyRemarks = isReopen ? reason : (remarks || reason || null);
    await conn.execute(
      `INSERT INTO status_history (application_id, old_phase, new_phase, changed_by, remarks)
       VALUES (?, ?, ?, ?, ?)`, [app.id, from, newPhase, req.user.id, historyRemarks]);
    return null;
  });
  if (!ok) return;

  return sendSuccess(res, await loadApplication(id), `Application moved to ${newPhase}.`);
};

// PATCH /api/applications/:id/eligibility   body: { eligibility: 'eligible', tierId? }
exports.setEligibility = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const body = req.body || {};
  const errors = [];
  if (body.eligibility !== 'eligible') {
    errors.push({ field: 'eligibility',
      message: "Only 'eligible' can be set here. To mark an application ineligible, change its phase to Ineligible." });
  }
  let tierId = null;
  if (body.tierId !== undefined && body.tierId !== null && body.tierId !== '') {
    tierId = parseId(body.tierId);
    if (!tierId) errors.push({ field: 'tierId', message: 'Must be a positive whole number.' });
  }
  if (errors.length) return sendValidationError(res, errors);

  const ok = await withLockedApplication(res, id, async (conn, app) => {
    if (app.current_phase !== 'For Evaluation') {
      return { status: 409, message: 'Eligibility can only be set while the application is For Evaluation.' };
    }
    if (tierId && !(await tierBelongsToProgram(conn, tierId, app.program_id))) {
      return { status: 409, message: "That tier does not belong to this application's program." };
    }
    if (tierId) {
      await conn.execute(
        "UPDATE applications SET eligibility = 'eligible', tier_id = ? WHERE id = ?", [tierId, app.id]);
    } else {
      await conn.execute("UPDATE applications SET eligibility = 'eligible' WHERE id = ?", [app.id]);
    }
    return null;
  });
  if (!ok) return;

  return sendSuccess(res, await loadApplication(id), 'Eligibility updated.');
};

// PATCH /api/applications/:id/tier   body: { tierId }
exports.setTier = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const tierId = parseId(req.body && req.body.tierId);
  if (!tierId) {
    return sendValidationError(res, [{ field: 'tierId', message: 'Required (a positive whole number).' }]);
  }

  const ok = await withLockedApplication(res, id, async (conn, app) => {
    if (app.eligibility !== 'eligible') {
      return { status: 409, message: 'A tier can only be assigned to an eligible application.' };
    }
    if (app.current_phase !== 'For Evaluation') {
      return { status: 409, message: 'The tier can only be changed while the application is For Evaluation.' };
    }
    if (!(await tierBelongsToProgram(conn, tierId, app.program_id))) {
      return { status: 409, message: "That tier does not belong to this application's program." };
    }
    await conn.execute('UPDATE applications SET tier_id = ? WHERE id = ?', [tierId, app.id]);
    return null;
  });
  if (!ok) return;

  return sendSuccess(res, await loadApplication(id), 'Tier updated.');
};

// GET /api/applications/:id/grant-schedule
exports.getGrantSchedule = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const [apps] = await pool.execute('SELECT id FROM applications WHERE id = ?', [id]);
  if (apps.length === 0) return sendError(res, 404, 'Application not found.');

  const [rows] = await pool.execute('SELECT * FROM grant_schedules WHERE application_id = ?', [id]);
  if (rows.length === 0) return sendError(res, 404, 'This application has no grant schedule.');
  return sendSuccess(res, toGrantSchedule(rows[0]), 'Grant schedule retrieved.');
};

// PUT /api/applications/:id/grant-schedule   body: { releaseDate, venue, amount }
exports.putGrantSchedule = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const body = req.body || {};
  const errors = [];
  const releaseDate = checkDate(body, 'releaseDate', errors, { required: true });
  const venue = checkString(body, 'venue', errors, { required: true, max: 150 });
  const rawAmount = checkNumber(body, 'amount', errors, { required: true, min: 0.01, max: 99999999.99 });
  if (errors.length) return sendValidationError(res, errors);
  const amount = Number(rawAmount.toFixed(2));

  let created = false;
  const ok = await withLockedApplication(res, id, async (conn, app) => {
    const [[program]] = await conn.execute(
      'SELECT type FROM scholarship_programs WHERE id = ?', [app.program_id]);
    if (program.type !== 'grant') {
      return { status: 409, message: 'Grant schedules apply only to grant-type programs.' };
    }
    if (app.current_phase !== 'Approved') {
      return { status: 409, message: 'The application must be Approved before a grant schedule can be set.' };
    }

    const [existing] = await conn.execute(
      'SELECT id FROM grant_schedules WHERE application_id = ?', [app.id]);
    if (existing.length) {
      await conn.execute(
        'UPDATE grant_schedules SET release_date = ?, venue = ?, amount = ? WHERE application_id = ?',
        [releaseDate, venue, amount, app.id]);
    } else {
      await conn.execute(
        'INSERT INTO grant_schedules (application_id, release_date, venue, amount) VALUES (?, ?, ?, ?)',
        [app.id, releaseDate, venue, amount]);
      created = true;
    }
    return null;
  });
  if (!ok) return;

  const [rows] = await pool.execute('SELECT * FROM grant_schedules WHERE application_id = ?', [id]);
  return sendSuccess(res, toGrantSchedule(rows[0]),
    created ? 'Grant schedule created.' : 'Grant schedule updated.', created ? 201 : 200);
};

// DELETE /api/applications/:id/grant-schedule
exports.deleteGrantSchedule = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return sendError(res, 400, 'Invalid application id.');

  const ok = await withLockedApplication(res, id, async (conn, app) => {
    const [existing] = await conn.execute(
      'SELECT id FROM grant_schedules WHERE application_id = ?', [app.id]);
    if (existing.length === 0) return { status: 404, message: 'This application has no grant schedule.' };
    if (app.current_phase === 'Granted') {
      return { status: 409, message: 'The grant schedule cannot be removed after the grant is released.' };
    }
    await conn.execute('DELETE FROM grant_schedules WHERE application_id = ?', [app.id]);
    return null;
  });
  if (!ok) return;

  return sendSuccess(res, null, 'Grant schedule removed.');
};
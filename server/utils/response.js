// Standard response format for every endpoint: { success, message, data }

function sendSuccess(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function sendError(res, status, message, data = null) {
  return res.status(status).json({ success: false, message, data });
}

// Validation failures: sendValidationError(res, [{ field: 'birthDate', message: 'Required.' }])
function sendValidationError(res, errors) {
  return sendError(res, 400, 'Validation failed.', { errors });
}

module.exports = { sendSuccess, sendError, sendValidationError };
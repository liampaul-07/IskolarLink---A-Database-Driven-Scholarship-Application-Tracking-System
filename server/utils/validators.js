// Small reusable validation helpers. Each check* function pushes { field, message }
// onto the `errors` array when the value is invalid and returns the cleaned value
// (or null when the field is empty/invalid).

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

// Parses a route id like "12". Returns a positive integer or null.
function parseId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ?page=1&limit=10 (limit max 100)
function parsePagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);
  if (!(page >= 1)) page = 1;
  if (!(limit >= 1)) limit = 10;
  if (limit > 100) limit = 100;
  return { page, limit, offset: (page - 1) * limit };
}

function checkString(body, field, errors, { required = false, max = 255 } = {}) {
  const v = body[field];
  if (isBlank(v)) {
    if (required) errors.push({ field, message: 'Required.' });
    return null;
  }
  if (typeof v !== 'string') {
    errors.push({ field, message: 'Must be text.' });
    return null;
  }
  const trimmed = v.trim();
  if (trimmed.length > max) {
    errors.push({ field, message: `Must be at most ${max} characters.` });
    return null;
  }
  return trimmed;
}

function checkNumber(body, field, errors, { required = false, min = 0, max = 1e12 } = {}) {
  const v = body[field];
  if (isBlank(v)) {
    if (required) errors.push({ field, message: 'Required.' });
    return null;
  }
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) {
    errors.push({ field, message: 'Must be a number.' });
    return null;
  }
  if (n < min || n > max) {
    errors.push({ field, message: `Must be between ${min} and ${max}.` });
    return null;
  }
  return n;
}

function checkEnum(body, field, allowed, errors, { required = false, defaultValue = null } = {}) {
  const v = body[field];
  if (isBlank(v)) {
    if (required) {
      errors.push({ field, message: 'Required.' });
      return null;
    }
    return defaultValue;
  }
  if (!allowed.includes(v)) {
    errors.push({ field, message: `Must be one of: ${allowed.join(', ')}.` });
    return null;
  }
  return v;
}

module.exports = { isBlank, parseId, parsePagination, checkString, checkNumber, checkEnum };
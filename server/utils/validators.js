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

// ---------- Dates, emails, phones, years, booleans ----------

// True only for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30, 2026-13-01).
function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function checkDate(body, field, errors, { required = false, notFuture = false } = {}) {
  const v = body[field];
  if (isBlank(v)) {
    if (required) errors.push({ field, message: 'Required.' });
    return null;
  }
  const s = typeof v === 'string' ? v.trim() : v;
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    errors.push({ field, message: 'Must be a date in YYYY-MM-DD format.' });
    return null;
  }
  if (!isValidDateString(s)) {
    errors.push({ field, message: 'Not a valid date.' });
    return null;
  }
  if (notFuture && s > new Date().toISOString().slice(0, 10)) {
    errors.push({ field, message: 'Cannot be in the future.' });
    return null;
  }
  return s;
}

function checkEmail(body, field, errors, { required = false } = {}) {
  const v = checkString(body, field, errors, { required, max: 100 });
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    errors.push({ field, message: 'Must be a valid email address.' });
    return null;
  }
  return v;
}

function checkPhone(body, field, errors, { required = false } = {}) {
  const v = checkString(body, field, errors, { required, max: 20 });
  if (v && !/^[0-9+()\-\s]{7,20}$/.test(v)) {
    errors.push({ field, message: 'Use 7 to 20 digits, spaces, + ( ) or -.' });
    return null;
  }
  return v;
}

// Academic year like "2026-2027": two years, the second exactly one more than the first.
function checkAcademicYear(body, field, errors, { required = false } = {}) {
  const v = checkString(body, field, errors, { required, max: 9 });
  if (!v) return null;
  const m = /^(\d{4})-(\d{4})$/.exec(v);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) {
    errors.push({ field, message: 'Must look like 2026-2027 (the second year is the first plus one).' });
    return null;
  }
  return v;
}

function checkBoolean(body, field, errors, { defaultValue = null } = {}) {
  const v = body[field];
  if (v === undefined || v === null) return defaultValue;
  if (typeof v !== 'boolean') {
    errors.push({ field, message: 'Must be true or false.' });
    return null;
  }
  return v;
}

module.exports = {
  isBlank, parseId, parsePagination, checkString, checkNumber, checkEnum,
  isValidDateString, checkDate, checkEmail, checkPhone, checkAcademicYear, checkBoolean
};
// Wraps an async route handler so a thrown error reaches the central error handler in app.js
// (which returns a generic 500). Works on Express 4 and 5.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
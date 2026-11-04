const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { sendError } = require('./utils/response');

const app = express();

// Security headers. upgradeInsecureRequests is off so the app also works over plain
// http://localhost during development.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: { upgradeInsecureRequests: null }
  }
}));

// Only the configured origin may call the API from a browser. With no CORS_ORIGIN set,
// no cross-origin access is allowed (the pages are served from this same server anyway).
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));

app.use(express.json({ limit: '100kb' })); // reject oversized bodies

// Static frontend (staff + lookup pages live in /public at the project root)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// --- API routes ---
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/tiers', require('./routes/tiers'));
app.use('/api/applicants', require('./routes/applicants'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/public', require('./routes/public'));
app.use('/api/dashboard', require('./routes/dashboard'));
// Mount new routers here as they are built.

// Unknown API route -> 404 in the standard format
app.use('/api', (req, res) => sendError(res, 404, 'Route not found.'));

// Malformed JSON and any other error -> generic message, never a stack trace or SQL error
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'Malformed JSON in request body.');
  }
  if (err.type === 'entity.too.large') {
    return sendError(res, 400, 'Request body is too large.');
  }
  console.error(err); // server-side log only
  return sendError(res, 500, 'Something went wrong. Please try again later.');
});

module.exports = app;
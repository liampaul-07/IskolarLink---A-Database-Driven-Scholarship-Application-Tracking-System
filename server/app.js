const path = require('path');
const express = require('express');
const { sendError } = require('./utils/response');

const app = express();

app.use(express.json({ limit: '100kb' })); // reject oversized bodies

// Static frontend (staff + lookup pages live in /public at the project root)
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- API routes ---
app.use('/api/health', require('./routes/health'));
app.use('/api/programs', require('./routes/programs'));
app.use('/api/tiers', require('./routes/tiers'));
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
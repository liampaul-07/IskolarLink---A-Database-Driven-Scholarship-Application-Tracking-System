const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // load .env before anything else

// Refuse to start without a signing secret: tokens signed with "undefined" would be forgeable.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or too short (need at least 32 characters). Check your .env file.');
  process.exit(1);
}

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`IskolarLink running at http://localhost:${PORT}`);
});
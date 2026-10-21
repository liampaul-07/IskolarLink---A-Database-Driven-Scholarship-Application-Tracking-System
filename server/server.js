const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // load .env before anything else

const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`IskolarLink running at http://localhost:${PORT}`);
});
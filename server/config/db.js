const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mysql = require('mysql2/promise');

// Shared connection pool. Always use parameterized queries: pool.execute(sql, [params]).
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'iskolarlink',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true // return DATE columns as 'YYYY-MM-DD' strings, avoiding timezone shifts
});

module.exports = pool;
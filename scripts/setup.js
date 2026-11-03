require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');

async function setup() {
  const database = process.env.DB_NAME || 'pharmacy';
  if (!/^[a-zA-Z0-9_]+$/.test(database)) throw new Error('DB_NAME may contain only letters, numbers, and underscores.');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    const schema = (await fs.readFile(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'))
      .replaceAll('pharmacy', database);
    const statements = schema
      .split(';')
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await connection.query(statement);
    }

    console.log('Database schema is ready.');
  } finally {
    await connection.end();
  }
}

setup().catch((error) => {
  console.error('Database setup failed:', error.message);
  process.exitCode = 1;
});

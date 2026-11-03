require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function createUser() {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10) {
    throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (at least 10 characters) in .env.');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pharmacy'
  });

  try {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await connection.execute(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, ?, 'admin')
       ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'admin', active = TRUE`,
      [ADMIN_NAME, ADMIN_EMAIL.toLowerCase(), passwordHash]
    );
    console.log(`Admin account ready for ${ADMIN_EMAIL.toLowerCase()}.`);
  } finally {
    await connection.end();
  }
}

createUser().catch((error) => {
  console.error('Admin account setup failed:', error.message);
  process.exitCode = 1;
});

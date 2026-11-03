require('dotenv').config();
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const app = express();
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('Set SESSION_SECRET to a random value of at least 32 characters in production.');
}
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pharmacy',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true
});

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'pharmacy.sid',
  secret: process.env.SESSION_SECRET || 'local-development-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));
app.use(express.static(path.join(__dirname, 'public')));

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
};
const text = (value, label, max = 180, required = true) => {
  const result = String(value ?? '').trim();
  if (required && !result) throw new AppError(`${label} is required.`);
  if (result.length > max) throw new AppError(`${label} must be ${max} characters or fewer.`);
  return result || null;
};
const positiveInt = (value, label) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) throw new AppError(`${label} must be a positive whole number.`);
  return result;
};
const nonNegativeNumber = (value, label) => {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new AppError(`${label} must be a valid non-negative amount.`);
  return result;
};
const dateOnly = (value, label) => {
  const result = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new AppError(`${label} must be a valid date.`);
  }
  const parsed = new Date(`${result}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) throw new AppError(`${label} must be a valid date.`);
  return result;
};

app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }), asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const [rows] = await pool.execute(
    'SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND active = TRUE LIMIT 1',
    [email]
  );
  if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  req.session.regenerate((error) => {
    if (error) return res.status(500).json({ error: 'Could not start your session.' });
    req.session.user = { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role };
    return res.json({ user: req.session.user });
  });
}));
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ error: 'Could not end your session.' });
    res.clearCookie('pharmacy.sid');
    return res.json({ ok: true });
  });
});

app.use('/api', requireAuth);

app.get('/api/dashboard', asyncRoute(async (req, res) => {
  const [[summary]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM medicines WHERE active = TRUE) AS medicine_count,
      (SELECT COUNT(*) FROM customers) AS customer_count,
      (SELECT COUNT(*) FROM suppliers) AS supplier_count,
      (SELECT COALESCE(SUM(total), 0) FROM sales WHERE DATE(sold_at) = CURDATE()) AS today_sales,
      (SELECT COUNT(*) FROM (
        SELECT m.id, m.low_stock_threshold, COALESCE(SUM(b.quantity), 0) AS stock
        FROM medicines m LEFT JOIN inventory_batches b ON b.medicine_id = m.id AND b.expiry_date >= CURDATE()
        WHERE m.active = TRUE GROUP BY m.id
      ) stock_rows WHERE stock <= low_stock_threshold) AS low_stock_count,
      (SELECT COUNT(*) FROM inventory_batches WHERE quantity > 0 AND expiry_date < CURDATE()) AS expired_count,
      (SELECT COUNT(*) FROM inventory_batches WHERE quantity > 0 AND expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)) AS expiring_count
  `);
  const [recentSales] = await pool.query(`
    SELECT s.id, s.sold_at, s.total, s.payment_method, COALESCE(c.name, 'Walk-in customer') AS customer_name
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
    ORDER BY s.sold_at DESC LIMIT 6
  `);
  const [alerts] = await pool.query(`
    SELECT m.name AS medicine_name, b.batch_number, b.quantity, b.expiry_date,
      CASE WHEN b.expiry_date < CURDATE() THEN 'Expired' ELSE 'Expiring soon' END AS alert
    FROM inventory_batches b JOIN medicines m ON m.id = b.medicine_id
    WHERE b.quantity > 0 AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    ORDER BY b.expiry_date ASC LIMIT 8
  `);
  res.json({ summary, recentSales, alerts });
}));

app.get('/api/medicines', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT m.*,
      COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN b.quantity ELSE 0 END), 0) AS stock,
      MIN(CASE WHEN b.quantity > 0 AND b.expiry_date >= CURDATE() THEN b.expiry_date END) AS next_expiry
    FROM medicines m LEFT JOIN inventory_batches b ON b.medicine_id = m.id
    WHERE m.active = TRUE
    GROUP BY m.id ORDER BY m.name
  `);
  res.json(rows);
}));
app.post('/api/medicines', asyncRoute(async (req, res) => {
  const body = req.body;
  const values = [
    text(body.sku, 'SKU', 80), text(body.name, 'Medicine name'),
    text(body.generic_name, 'Generic name', 180, false), text(body.category, 'Category', 100, false),
    text(body.manufacturer, 'Manufacturer', 160, false), text(body.unit || 'unit', 'Unit', 40),
    nonNegativeNumber(body.selling_price, 'Selling price'),
    positiveInt(body.low_stock_threshold || 10, 'Low-stock threshold'),
    Boolean(body.prescription_required)
  ];
  const [result] = await pool.execute(
    `INSERT INTO medicines (sku, name, generic_name, category, manufacturer, unit, selling_price, low_stock_threshold, prescription_required)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, values
  );
  res.status(201).json({ id: result.insertId });
}));
app.put('/api/medicines/:id', asyncRoute(async (req, res) => {
  const body = req.body;
  await pool.execute(
    `UPDATE medicines SET sku = ?, name = ?, generic_name = ?, category = ?, manufacturer = ?, unit = ?,
      selling_price = ?, low_stock_threshold = ?, prescription_required = ? WHERE id = ? AND active = TRUE`,
    [
      text(body.sku, 'SKU', 80), text(body.name, 'Medicine name'),
      text(body.generic_name, 'Generic name', 180, false), text(body.category, 'Category', 100, false),
      text(body.manufacturer, 'Manufacturer', 160, false), text(body.unit || 'unit', 'Unit', 40),
      nonNegativeNumber(body.selling_price, 'Selling price'),
      positiveInt(body.low_stock_threshold || 10, 'Low-stock threshold'),
      Boolean(body.prescription_required), positiveInt(req.params.id, 'Medicine ID')
    ]
  );
  res.json({ ok: true });
}));
app.delete('/api/medicines/:id', asyncRoute(async (req, res) => {
  const [result] = await pool.execute('UPDATE medicines SET active = FALSE WHERE id = ?', [positiveInt(req.params.id, 'Medicine ID')]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Medicine not found.' });
  res.json({ ok: true });
}));

app.get('/api/inventory', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT b.id, b.batch_number, b.expiry_date, b.quantity, b.unit_cost, m.id AS medicine_id,
      m.name AS medicine_name, m.sku, s.name AS supplier_name,
      CASE WHEN b.expiry_date < CURDATE() THEN 'expired'
           WHEN b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'expiring' ELSE 'ok' END AS status
    FROM inventory_batches b JOIN medicines m ON m.id = b.medicine_id
    LEFT JOIN suppliers s ON s.id = b.supplier_id
    WHERE m.active = TRUE ORDER BY b.expiry_date, m.name
  `);
  res.json(rows);
}));

app.get('/api/customers', asyncRoute(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM customers ORDER BY name');
  res.json(rows);
}));
app.post('/api/customers', asyncRoute(async (req, res) => {
  const [result] = await pool.execute(
    'INSERT INTO customers (name, phone, email, address) VALUES (?, ?, ?, ?)',
    [text(req.body.name, 'Customer name'), text(req.body.phone, 'Phone', 40, false),
      text(req.body.email, 'Email', 190, false), text(req.body.address, 'Address', 255, false)]
  );
  res.status(201).json({ id: result.insertId });
}));

app.get('/api/suppliers', asyncRoute(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM suppliers ORDER BY name');
  res.json(rows);
}));
app.post('/api/suppliers', asyncRoute(async (req, res) => {
  const [result] = await pool.execute(
    'INSERT INTO suppliers (name, contact_person, phone, email, address) VALUES (?, ?, ?, ?, ?)',
    [text(req.body.name, 'Supplier name'), text(req.body.contact_person, 'Contact person', 120, false),
      text(req.body.phone, 'Phone', 40, false), text(req.body.email, 'Email', 190, false),
      text(req.body.address, 'Address', 255, false)]
  );
  res.status(201).json({ id: result.insertId });
}));

app.get('/api/purchases', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT p.id, p.purchase_date, p.total, s.name AS supplier_name, u.name AS created_by,
      COUNT(pi.id) AS item_count
    FROM purchases p JOIN suppliers s ON s.id = p.supplier_id JOIN users u ON u.id = p.user_id
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    GROUP BY p.id ORDER BY p.purchase_date DESC LIMIT 100
  `);
  res.json(rows);
}));
app.post('/api/purchases', asyncRoute(async (req, res) => {
  const supplierId = positiveInt(req.body.supplier_id, 'Supplier');
  if (!Array.isArray(req.body.items) || req.body.items.length === 0) throw new AppError('Add at least one purchase item.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [supplier] = await connection.execute('SELECT id FROM suppliers WHERE id = ? FOR UPDATE', [supplierId]);
    if (!supplier.length) throw new AppError('Select a valid supplier.');
    const normalized = req.body.items.map((item) => ({
      medicineId: positiveInt(item.medicine_id, 'Medicine'),
      batch: text(item.batch_number, 'Batch number', 100),
      expiry: dateOnly(item.expiry_date, 'Expiry date'),
      quantity: positiveInt(item.quantity, 'Quantity'),
      cost: nonNegativeNumber(item.unit_cost, 'Unit cost'),
      price: nonNegativeNumber(item.selling_price, 'Selling price')
    }));
    if (normalized.some((item) => item.expiry < new Date().toISOString().slice(0, 10))) {
      throw new AppError('Purchase batches must have an expiry date today or later.');
    }
    const total = normalized.reduce((sum, item) => sum + item.quantity * item.cost, 0);
    const [purchase] = await connection.execute(
      'INSERT INTO purchases (supplier_id, user_id, total) VALUES (?, ?, ?)',
      [supplierId, req.session.user.id, total]
    );
    for (const item of normalized) {
      const [medicines] = await connection.execute('SELECT id FROM medicines WHERE id = ? AND active = TRUE', [item.medicineId]);
      if (!medicines.length) throw new AppError('One or more selected medicines are unavailable.');
      await connection.execute(
        'INSERT INTO purchase_items (purchase_id, medicine_id, batch_number, expiry_date, quantity, unit_cost, selling_price) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [purchase.insertId, item.medicineId, item.batch, item.expiry, item.quantity, item.cost, item.price]
      );
      await connection.execute(
        'INSERT INTO inventory_batches (medicine_id, supplier_id, batch_number, expiry_date, quantity, unit_cost) VALUES (?, ?, ?, ?, ?, ?)',
        [item.medicineId, supplierId, item.batch, item.expiry, item.quantity, item.cost]
      );
      await connection.execute('UPDATE medicines SET selling_price = ? WHERE id = ?', [item.price, item.medicineId]);
    }
    await connection.commit();
    res.status(201).json({ id: purchase.insertId, total });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get('/api/prescriptions', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT p.*, c.name AS customer_name,
      GROUP_CONCAT(m.name ORDER BY m.name SEPARATOR ', ') AS medicines
    FROM prescriptions p JOIN customers c ON c.id = p.customer_id
    LEFT JOIN prescription_medicines pm ON pm.prescription_id = p.id
    LEFT JOIN medicines m ON m.id = pm.medicine_id
    GROUP BY p.id ORDER BY p.prescription_date DESC LIMIT 100
  `);
  res.json(rows);
}));
app.post('/api/prescriptions', asyncRoute(async (req, res) => {
  if (!Array.isArray(req.body.medicine_ids) || !req.body.medicine_ids.length) throw new AppError('Select at least one prescribed medicine.');
  const customerId = positiveInt(req.body.customer_id, 'Customer');
  const medicineIds = [...new Set(req.body.medicine_ids.map((id) => positiveInt(id, 'Medicine')))];
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [customers] = await connection.execute('SELECT id FROM customers WHERE id = ?', [customerId]);
    if (!customers.length) throw new AppError('Select a valid customer.');
    const [result] = await connection.execute(
      'INSERT INTO prescriptions (customer_id, prescriber_name, prescription_date, notes) VALUES (?, ?, ?, ?)',
      [customerId, text(req.body.prescriber_name, 'Prescriber name', 160),
        dateOnly(req.body.prescription_date, 'Prescription date'), text(req.body.notes, 'Notes', 1000, false)]
    );
    for (const medicineId of medicineIds) {
      await connection.execute('INSERT INTO prescription_medicines (prescription_id, medicine_id) VALUES (?, ?)', [result.insertId, medicineId]);
    }
    await connection.commit();
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get('/api/sales', asyncRoute(async (req, res) => {
  const [rows] = await pool.query(`
    SELECT s.id, s.sold_at, s.total, s.payment_method, c.name AS customer_name, u.name AS created_by,
      COUNT(si.id) AS item_count
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = s.user_id
    LEFT JOIN sale_items si ON si.sale_id = s.id
    GROUP BY s.id ORDER BY s.sold_at DESC LIMIT 100
  `);
  res.json(rows);
}));
app.get('/api/sales/:id', asyncRoute(async (req, res) => {
  const saleId = positiveInt(req.params.id, 'Sale ID');
  const [[sale]] = await pool.execute(`
    SELECT s.id, s.sold_at, s.total, s.payment_method, c.name AS customer_name, u.name AS created_by
    FROM sales s LEFT JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `, [saleId]);
  if (!sale) return res.status(404).json({ error: 'Sale not found.' });
  const [items] = await pool.execute(`
    SELECT m.name AS medicine_name, si.quantity, si.unit_price, si.quantity * si.unit_price AS line_total
    FROM sale_items si JOIN medicines m ON m.id = si.medicine_id WHERE si.sale_id = ? ORDER BY si.id
  `, [saleId]);
  res.json({ ...sale, items });
}));
app.post('/api/sales', asyncRoute(async (req, res) => {
  if (!Array.isArray(req.body.items) || req.body.items.length === 0) throw new AppError('Add at least one medicine to the sale.');
  const items = req.body.items.map((item) => ({
    medicineId: positiveInt(item.medicine_id, 'Medicine'),
    quantity: positiveInt(item.quantity, 'Quantity')
  }));
  const quantities = new Map();
  for (const item of items) quantities.set(item.medicineId, (quantities.get(item.medicineId) || 0) + item.quantity);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const customerId = req.body.customer_id ? positiveInt(req.body.customer_id, 'Customer') : null;
    const prescriptionId = req.body.prescription_id ? positiveInt(req.body.prescription_id, 'Prescription') : null;
    if (customerId) {
      const [customers] = await connection.execute('SELECT id FROM customers WHERE id = ?', [customerId]);
      if (!customers.length) throw new AppError('Select a valid customer.');
    }
    if (prescriptionId) {
      const [prescriptions] = await connection.execute(
        "SELECT id, customer_id FROM prescriptions WHERE id = ? AND status = 'active' FOR UPDATE", [prescriptionId]
      );
      if (!prescriptions.length) throw new AppError('Select an active prescription.');
      if (!customerId || Number(prescriptions[0].customer_id) !== Number(customerId)) {
        throw new AppError('The prescription must belong to the selected customer.');
      }
    }

    const saleLines = [];
    for (const [medicineId, quantity] of quantities) {
      const [medicineRows] = await connection.execute(
        'SELECT id, name, selling_price, prescription_required FROM medicines WHERE id = ? AND active = TRUE FOR UPDATE',
        [medicineId]
      );
      if (!medicineRows.length) throw new AppError('One or more selected medicines are unavailable.');
      const medicine = medicineRows[0];
      if (medicine.prescription_required) {
        if (!prescriptionId) throw new AppError(`${medicine.name} requires a prescription.`);
        const [rxItems] = await connection.execute(
          'SELECT 1 FROM prescription_medicines WHERE prescription_id = ? AND medicine_id = ?',
          [prescriptionId, medicineId]
        );
        if (!rxItems.length) throw new AppError(`${medicine.name} is not listed on the selected prescription.`);
      }
      const [batches] = await connection.execute(
        `SELECT id, quantity FROM inventory_batches
         WHERE medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
         ORDER BY expiry_date, id FOR UPDATE`,
        [medicineId]
      );
      const available = batches.reduce((sum, batch) => sum + Number(batch.quantity), 0);
      if (available < quantity) throw new AppError(`Not enough unexpired stock for ${medicine.name} (${available} available).`);
      saleLines.push({ medicineId, quantity, price: Number(medicine.selling_price), batches });
    }

    const total = saleLines.reduce((sum, line) => sum + line.quantity * line.price, 0);
    const paymentMethod = ['cash', 'card', 'upi', 'other'].includes(req.body.payment_method) ? req.body.payment_method : 'cash';
    const [sale] = await connection.execute(
      'INSERT INTO sales (customer_id, prescription_id, user_id, total, payment_method) VALUES (?, ?, ?, ?, ?)',
      [customerId, prescriptionId, req.session.user.id, total, paymentMethod]
    );
    for (const line of saleLines) {
      await connection.execute(
        'INSERT INTO sale_items (sale_id, medicine_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
        [sale.insertId, line.medicineId, line.quantity, line.price]
      );
      let remaining = line.quantity;
      for (const batch of line.batches) {
        if (!remaining) break;
        const deducted = Math.min(remaining, Number(batch.quantity));
        await connection.execute('UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?', [deducted, batch.id]);
        remaining -= deducted;
      }
    }
    if (prescriptionId) {
      const [remainingItems] = await connection.execute(
        `SELECT COUNT(*) AS remaining FROM prescription_medicines pm
         WHERE pm.prescription_id = ? AND NOT EXISTS (
           SELECT 1 FROM sale_items si JOIN sales s ON s.id = si.sale_id
           WHERE s.prescription_id = pm.prescription_id AND si.medicine_id = pm.medicine_id
         )`, [prescriptionId]
      );
      if (Number(remainingItems[0].remaining) === 0) {
        await connection.execute("UPDATE prescriptions SET status = 'fulfilled' WHERE id = ?", [prescriptionId]);
      }
    }
    await connection.commit();
    res.status(201).json({ id: sale.insertId, total });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

app.get('/api/reports', asyncRoute(async (req, res) => {
  const from = req.query.from ? dateOnly(req.query.from, 'Start date') : null;
  const to = req.query.to ? dateOnly(req.query.to, 'End date') : null;
  const [sales] = await pool.execute(`
    SELECT DATE(sold_at) AS date, COUNT(*) AS transactions, SUM(total) AS revenue
    FROM sales WHERE (? IS NULL OR DATE(sold_at) >= ?) AND (? IS NULL OR DATE(sold_at) <= ?)
    GROUP BY DATE(sold_at) ORDER BY date DESC LIMIT 90
  `, [from, from, to, to]);
  const [topMedicines] = await pool.execute(`
    SELECT m.name, SUM(si.quantity) AS quantity_sold, SUM(si.quantity * si.unit_price) AS revenue
    FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN medicines m ON m.id = si.medicine_id
    WHERE (? IS NULL OR DATE(s.sold_at) >= ?) AND (? IS NULL OR DATE(s.sold_at) <= ?)
    GROUP BY m.id ORDER BY quantity_sold DESC LIMIT 10
  `, [from, from, to, to]);
  const [stock] = await pool.query(`
    SELECT m.sku, m.name, m.low_stock_threshold,
      COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN b.quantity ELSE 0 END), 0) AS quantity
    FROM medicines m LEFT JOIN inventory_batches b ON b.medicine_id = m.id
    WHERE m.active = TRUE GROUP BY m.id ORDER BY quantity, m.name
  `);
  res.json({ sales, topMedicines, stock });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A record with that SKU or unique value already exists.' });
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ error: 'The selected related record does not exist.' });
  const status = error.status || error.statusCode || 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 400 ? error.message : 'Something went wrong. Please try again.' });
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => console.log(`Pharmacy Management System listening on http://localhost:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await pool.end();
    process.exit(0);
  }));
}

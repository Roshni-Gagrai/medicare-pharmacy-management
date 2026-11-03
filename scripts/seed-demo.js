require('dotenv').config();
const mysql = require('mysql2/promise');

const medicines = [
  { sku: 'DEMO-PAR-500', name: 'Paracetamol 500 mg', generic: 'Paracetamol', category: 'Pain relief', manufacturer: 'MediFlow Demo Labs', unit: 'tablet', price: 4.5, threshold: 20, rx: false },
  { sku: 'DEMO-ORS-01', name: 'ORS Sachet', generic: 'Oral rehydration salts', category: 'Rehydration', manufacturer: 'MediFlow Demo Labs', unit: 'sachet', price: 22, threshold: 15, rx: false },
  { sku: 'DEMO-CET-10', name: 'Cetirizine 10 mg', generic: 'Cetirizine', category: 'Allergy relief', manufacturer: 'MediFlow Demo Labs', unit: 'tablet', price: 3.5, threshold: 10, rx: false },
  { sku: 'DEMO-AMX-500', name: 'Amoxicillin 500 mg', generic: 'Amoxicillin', category: 'Antibiotic', manufacturer: 'MediFlow Demo Labs', unit: 'capsule', price: 8, threshold: 10, rx: true },
  { sku: 'DEMO-OMP-20', name: 'Omeprazole 20 mg', generic: 'Omeprazole', category: 'Gastrointestinal', manufacturer: 'MediFlow Demo Labs', unit: 'capsule', price: 6, threshold: 10, rx: true },
  { sku: 'DEMO-VTC-500', name: 'Vitamin C 500 mg', generic: 'Ascorbic acid', category: 'Vitamins', manufacturer: 'MediFlow Demo Labs', unit: 'tablet', price: 5, threshold: 10, rx: false },
  { sku: 'DEMO-ANT-01', name: 'Antacid Chewable', generic: 'Calcium carbonate', category: 'Gastrointestinal', manufacturer: 'MediFlow Demo Labs', unit: 'tablet', price: 3, threshold: 12, rx: false },
  { sku: 'DEMO-BND-01', name: 'Adhesive Bandage Roll', generic: 'Medical dressing', category: 'First aid', manufacturer: 'MediFlow Demo Labs', unit: 'roll', price: 45, threshold: 8, rx: false },
  { sku: 'DEMO-THM-01', name: 'Digital Thermometer', generic: 'Digital thermometer', category: 'Medical devices', manufacturer: 'MediFlow Demo Labs', unit: 'piece', price: 180, threshold: 5, rx: false },
  { sku: 'DEMO-IBU-200', name: 'Ibuprofen 200 mg', generic: 'Ibuprofen', category: 'Pain relief', manufacturer: 'MediFlow Demo Labs', unit: 'tablet', price: 5, threshold: 10, rx: false }
];

const suppliers = [
  { name: 'Northstar Demo Supplies', email: 'northstar@example.invalid' },
  { name: 'WellSpring Demo Wholesale', email: 'wellspring@example.invalid' },
  { name: 'CityMed Demo Distributors', email: 'citymed@example.invalid' }
];

const customers = [
  'Demo Customer A',
  'Demo Customer B',
  'Demo Customer C',
  'Demo Customer D',
  'Demo Customer E'
];

function dateAfterDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seedDemo() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pharmacy'
  });

  let transactionStarted = false;
  try {
    const [users] = await connection.execute(
      "SELECT id FROM users WHERE role = 'admin' AND active = TRUE ORDER BY id LIMIT 1"
    );
    if (!users.length) {
      throw new Error('Create an active administrator first with npm run db:seed-user.');
    }

    const [[existing]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM medicines) +
        (SELECT COUNT(*) FROM suppliers) +
        (SELECT COUNT(*) FROM customers) +
        (SELECT COUNT(*) FROM inventory_batches) +
        (SELECT COUNT(*) FROM purchases) +
        (SELECT COUNT(*) FROM sales) +
        (SELECT COUNT(*) FROM prescriptions) AS record_count
    `);
    if (Number(existing.record_count) > 0) {
      console.log('Demo data was not added because this database already contains pharmacy records. No existing records were changed.');
      return;
    }

    await connection.beginTransaction();
    transactionStarted = true;
    const supplierIds = [];
    for (const supplier of suppliers) {
      const [result] = await connection.execute(
        'INSERT INTO suppliers (name, email) VALUES (?, ?)',
        [supplier.name, supplier.email]
      );
      supplierIds.push(result.insertId);
    }

    const medicineIds = [];
    for (const medicine of medicines) {
      const [result] = await connection.execute(
        `INSERT INTO medicines
          (sku, name, generic_name, category, manufacturer, unit, selling_price, low_stock_threshold, prescription_required)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [medicine.sku, medicine.name, medicine.generic, medicine.category, medicine.manufacturer,
          medicine.unit, medicine.price, medicine.threshold, medicine.rx]
      );
      medicineIds.push(result.insertId);
    }

    const customerIds = [];
    for (const name of customers) {
      const [result] = await connection.execute('INSERT INTO customers (name) VALUES (?)', [name]);
      customerIds.push(result.insertId);
    }

    const purchaseGroups = [
      {
        supplier: 0,
        items: [
          [0, 'DEMO-PAR-A01', 18, 30, 2.1],
          [0, 'DEMO-PAR-A02', 150, 100, 2.1],
          [1, 'DEMO-ORS-A01', 28, 40, 12],
          [2, 'DEMO-CET-A01', 200, 70, 1.6],
          [3, 'DEMO-AMX-A01', 240, 55, 4]
        ]
      },
      {
        supplier: 1,
        items: [
          [4, 'DEMO-OMP-A01', 12, 24, 3],
          [5, 'DEMO-VTC-A01', 180, 8, 2.5],
          [6, 'DEMO-ANT-A01', 220, 60, 1.4]
        ]
      },
      {
        supplier: 2,
        items: [
          [7, 'DEMO-BND-A01', 260, 3, 25],
          [8, 'DEMO-THM-A01', 300, 18, 110],
          [9, 'DEMO-IBU-A01', 160, 45, 2.5]
        ]
      }
    ];

    for (const group of purchaseGroups) {
      const total = group.items.reduce((sum, item) => sum + item[3] * item[4], 0);
      const [purchase] = await connection.execute(
        'INSERT INTO purchases (supplier_id, user_id, total) VALUES (?, ?, ?)',
        [supplierIds[group.supplier], users[0].id, total]
      );
      for (const [medicineIndex, batchNumber, expiryDays, quantity, unitCost] of group.items) {
        const medicine = medicines[medicineIndex];
        await connection.execute(
          `INSERT INTO purchase_items
            (purchase_id, medicine_id, batch_number, expiry_date, quantity, unit_cost, selling_price)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [purchase.insertId, medicineIds[medicineIndex], batchNumber, dateAfterDays(expiryDays),
            quantity, unitCost, medicine.price]
        );
        await connection.execute(
          `INSERT INTO inventory_batches
            (medicine_id, supplier_id, batch_number, expiry_date, quantity, unit_cost)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [medicineIds[medicineIndex], supplierIds[group.supplier], batchNumber,
            dateAfterDays(expiryDays), quantity, unitCost]
        );
      }
    }

    const prescriptions = [];
    for (const prescription of [
      { customer: 1, medicine: 3, status: 'fulfilled', daysAgo: 2 },
      { customer: 2, medicine: 4, status: 'fulfilled', daysAgo: 5 },
      { customer: 3, medicine: 3, status: 'active', daysAgo: 1 }
    ]) {
      const [result] = await connection.execute(
        `INSERT INTO prescriptions
          (customer_id, prescriber_name, prescription_date, notes, status)
         VALUES (?, 'Demo Prescriber', DATE_SUB(CURDATE(), INTERVAL ? DAY), 'Synthetic sample record for demonstration.', ?)`,
        [customerIds[prescription.customer], prescription.daysAgo, prescription.status]
      );
      await connection.execute(
        'INSERT INTO prescription_medicines (prescription_id, medicine_id) VALUES (?, ?)',
        [result.insertId, medicineIds[prescription.medicine]]
      );
      prescriptions.push(result.insertId);
    }

    const saleGroups = [
      { customer: 0, prescription: null, hoursAgo: 1, payment: 'upi', items: [[0, 2], [1, 1]] },
      { customer: 1, prescription: prescriptions[0], hoursAgo: 3, payment: 'card', items: [[3, 1]] },
      { customer: null, prescription: null, hoursAgo: 26, payment: 'cash', items: [[2, 2], [5, 1]] },
      { customer: 2, prescription: prescriptions[1], hoursAgo: 51, payment: 'upi', items: [[4, 1], [6, 2]] },
      { customer: 3, prescription: null, hoursAgo: 74, payment: 'cash', items: [[7, 1], [8, 1]] },
      { customer: 4, prescription: null, hoursAgo: 170, payment: 'card', items: [[9, 2], [0, 1]] }
    ];

    for (const sale of saleGroups) {
      const total = sale.items.reduce((sum, [medicineIndex, quantity]) =>
        sum + medicines[medicineIndex].price * quantity, 0);
      const [result] = await connection.execute(
        `INSERT INTO sales (customer_id, prescription_id, user_id, sold_at, total, payment_method)
         VALUES (?, ?, ?, DATE_SUB(NOW(), INTERVAL ? HOUR), ?, ?)`,
        [sale.customer === null ? null : customerIds[sale.customer], sale.prescription,
          users[0].id, sale.hoursAgo, total, sale.payment]
      );

      for (const [medicineIndex, quantity] of sale.items) {
        const medicineId = medicineIds[medicineIndex];
        await connection.execute(
          'INSERT INTO sale_items (sale_id, medicine_id, quantity, unit_price) VALUES (?, ?, ?, ?)',
          [result.insertId, medicineId, quantity, medicines[medicineIndex].price]
        );
        const [batches] = await connection.execute(
          `SELECT id, quantity FROM inventory_batches
           WHERE medicine_id = ? AND quantity > 0 AND expiry_date >= CURDATE()
           ORDER BY expiry_date, id FOR UPDATE`,
          [medicineId]
        );
        const available = batches.reduce((sum, batch) => sum + Number(batch.quantity), 0);
        if (available < quantity) {
          throw new Error(`Not enough demo stock for ${medicines[medicineIndex].name} (${available} available, ${quantity} required).`);
        }
        let remaining = quantity;
        for (const batch of batches) {
          if (!remaining) break;
          const deducted = Math.min(remaining, Number(batch.quantity));
          await connection.execute(
            'UPDATE inventory_batches SET quantity = quantity - ? WHERE id = ?',
            [deducted, batch.id]
          );
          remaining -= deducted;
        }
        if (remaining > 0) throw new Error(`Could not allocate demo stock for ${medicines[medicineIndex].name}.`);
      }
    }

    await connection.commit();
    transactionStarted = false;
    console.log('Added demo data: 10 medicines, 3 suppliers, 5 customers, 3 purchases, 3 prescriptions, 6 sales, and inventory batches.');
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

seedDemo().catch((error) => {
  console.error('Demo data setup failed:', error.message);
  process.exitCode = 1;
});

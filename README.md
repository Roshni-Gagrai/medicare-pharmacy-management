# MediFlow Pharmacy Management System

A pharmacy operations app built with HTML, CSS, browser JavaScript, Node.js, Express, and MySQL. It includes sign-in, a dashboard, medicine catalogue, batch-based inventory, suppliers, customers, purchases, prescription records, sales and billing, expiry monitoring, and reports.

## Requirements

- Node.js 18 or newer
- MySQL 8 or compatible server

## Local setup

1. Copy `.env.example` to `.env` and set your MySQL connection details and a long, random `SESSION_SECRET`.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Create the database tables:

   ```sh
   npm run db:setup
   ```

   The configured MySQL account needs permission to create the database and tables.

4. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and a password of at least 10 characters in `.env`, then create the administrator:

   ```sh
   npm run db:seed-user
   ```

5. Add synthetic sample records to an empty pharmacy database:

   ```sh
   npm run db:seed-demo
   ```

   The demo seeder does not change existing pharmacy records. It creates sample medicines, batches, customers, suppliers, purchases, prescriptions, and sales.

6. Start the server and open `http://localhost:3000`:

   ```sh
   npm start
   ```

For development, `npm run dev` restarts the server when files change.

## Notes

- Sales deduct stock from unexpired batches in earliest-expiry-first order. A sale, its line items, stock deductions, and prescription status update are committed together.
- Prescription-required medicines can only be sold when included in an active prescription belonging to the selected customer.
- The default Express in-memory session store is intended for local development. Use a persistent session store and HTTPS when deploying multiple server instances or running in production.
- Do not use the example credentials in a public deployment. Configure a unique administrator password and a random session secret.

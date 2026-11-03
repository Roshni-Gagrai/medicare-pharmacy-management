const app = document.querySelector('#app');
const toastRegion = document.querySelector('#toast-region');

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'medicines', label: 'Medicines', icon: '✚' },
  { id: 'inventory', label: 'Inventory', icon: '▦' },
  { id: 'customers', label: 'Customers', icon: '♙' },
  { id: 'suppliers', label: 'Suppliers', icon: '♧' },
  { id: 'purchases', label: 'Purchases', icon: '↙' },
  { id: 'sales', label: 'Sales & billing', icon: '▤' },
  { id: 'prescriptions', label: 'Prescriptions', icon: '▧' },
  { id: 'reports', label: 'Reports', icon: '▥' }
];
const pageDetails = {
  dashboard: ['Overview', 'Your pharmacy at a glance'],
  medicines: ['Medicine catalogue', 'Manage medicines, pricing and prescription requirements'],
  inventory: ['Inventory', 'Monitor batch quantities and expiry dates'],
  customers: ['Customers', 'Keep customer records organized'],
  suppliers: ['Suppliers', 'Manage supplier contacts'],
  purchases: ['Purchases', 'Record deliveries and add stock by batch'],
  sales: ['Sales & billing', 'Review transactions and create a customer bill'],
  prescriptions: ['Prescriptions', 'Record prescriptions and their medicines'],
  reports: ['Reports', 'Review sales performance and stock levels']
};
const state = { user: null, page: 'dashboard', search: '', medicines: [], customers: [], suppliers: [], prescriptions: [] };
const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const money = (value) => currency.format(Number(value) || 0);
const dateLabel = (value) => value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const dateTimeLabel = (value) => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const field = (label, name, options = {}) => {
  const { type = 'text', value = '', placeholder = '', required = false, min, step, choices, full = false, checked = false } = options;
  const className = full ? 'field full' : 'field';
  if (type === 'select') {
    return `<div class="${className}"><label for="${name}">${escapeHtml(label)}</label><select id="${name}" name="${name}" ${required ? 'required' : ''}>${choices || ''}</select></div>`;
  }
  if (type === 'checkbox') {
    return `<div class="${className}"><label class="check-field"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${escapeHtml(label)}</label></div>`;
  }
  if (type === 'textarea') {
    return `<div class="${className}"><label for="${name}">${escapeHtml(label)}</label><textarea id="${name}" name="${name}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}>${escapeHtml(value)}</textarea></div>`;
  }
  return `<div class="${className}"><label for="${name}">${escapeHtml(label)}</label><input id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''} ${min !== undefined ? `min="${min}"` : ''} ${step !== undefined ? `step="${step}"` : ''}></div>`;
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !url.includes('/auth/login')) {
    state.user = null;
    renderLogin();
    throw new Error('Your session expired. Please sign in again.');
  }
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function showToast(message, isError = false) {
  toastRegion.innerHTML = `<div class="toast${isError ? ' error' : ''}">${escapeHtml(message)}</div>`;
  window.setTimeout(() => { toastRegion.innerHTML = ''; }, 3500);
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-art">
        <div class="art-logo"><span class="brand-mark">+</span> MediFlow</div>
        <div class="art-copy">
          <h1>Better care.<br><span>Better stocked.</span></h1>
          <p>One calm, connected workspace for your pharmacy inventory, customers, prescriptions and sales.</p>
        </div>
        <div class="art-footer">CENTRALIZED · ORGANIZED · RELIABLE</div>
      </section>
      <section class="login-side">
        <form class="login-card" id="login-form">
          <h2>Welcome back</h2>
          <p>Sign in to your pharmacy workspace.</p>
          <div class="form-error" id="login-error"></div>
          ${field('Email address', 'email', { type: 'email', placeholder: 'you@pharmacy.com', required: true })}
          ${field('Password', 'password', { type: 'password', placeholder: 'Enter your password', required: true })}
          <button class="button primary" type="submit">Sign in <span aria-hidden="true">→</span></button>
          <div class="login-note">Administrator accounts are created securely with <code>npm run db:seed-user</code>. See the setup guide for details.</div>
        </form>
      </section>
    </main>`;
  document.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { email: form.get('email'), password: form.get('password') } });
      state.user = user;
      renderShell();
    } catch (error) {
      const errorBox = document.querySelector('#login-error');
      errorBox.textContent = error.message;
      errorBox.classList.add('visible');
    } finally {
      button.disabled = false;
    }
  });
}

function renderShell() {
  const [title] = pageDetails[state.page];
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><div class="brand-mark">+</div><div><div class="brand-name">MediFlow</div><div class="brand-subtitle">Pharmacy workspace</div></div></div>
        <div class="nav-label">Workspace</div>
        <nav class="nav-list" aria-label="Main navigation">
          ${navigation.map((item) => `<button class="nav-item${state.page === item.id ? ' active' : ''}" data-page="${item.id}"><span class="nav-icon">${item.icon}</span>${item.label}</button>`).join('')}
        </nav>
        <div class="sidebar-bottom">
          <div class="user-chip"><div class="avatar">${escapeHtml((state.user?.name || 'U').slice(0, 1).toUpperCase())}</div><div><div class="user-name">${escapeHtml(state.user?.name)}</div><div class="user-role">${escapeHtml(state.user?.role)}</div></div></div>
          <button class="logout" id="logout-button">↪ &nbsp; Sign out</button>
        </div>
      </aside>
      <div class="main-area">
        <header class="topbar">
          <div class="topbar-left"><button class="mobile-menu" id="mobile-menu" aria-label="Toggle navigation">☰</button><div><div class="eyebrow">PHARMACY MANAGEMENT</div><div class="top-title">${escapeHtml(title)}</div></div></div>
          <div class="top-actions"><span class="today-date">${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span><button class="button primary" data-action="new-sale">＋ New sale</button></div>
        </header>
        <main class="content" id="page-content"><div class="skeleton">Loading your workspace…</div></main>
      </div>
    </div>`;
  document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.page)));
  document.querySelector('#mobile-menu').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
  document.querySelector('#logout-button').addEventListener('click', logout);
  document.querySelector('[data-action="new-sale"]').addEventListener('click', () => openSaleModal());
  document.querySelector('#page-content').addEventListener('click', handlePageAction);
  document.querySelector('#page-content').addEventListener('input', (event) => {
    if (event.target.matches('[data-search]')) {
      state.search = event.target.value.toLowerCase();
      const table = document.querySelector('[data-filter-table]');
      if (table) filterTable(table, state.search);
    }
  });
  loadPage();
}

async function navigate(page) {
  if (!pageDetails[page]) return;
  state.page = page;
  state.search = '';
  renderShell();
}

async function loadPage() {
  const container = document.querySelector('#page-content');
  if (!container) return;
  container.innerHTML = '<div class="skeleton">Loading your workspace…</div>';
  try {
    const renderers = {
      dashboard: renderDashboard,
      medicines: renderMedicines,
      inventory: renderInventory,
      customers: renderCustomers,
      suppliers: renderSuppliers,
      purchases: renderPurchases,
      sales: renderSales,
      prescriptions: renderPrescriptions,
      reports: renderReports
    };
    container.innerHTML = await renderers[state.page]();
  } catch (error) {
    container.innerHTML = `<div class="panel panel-body"><strong>Could not load this page.</strong><p>${escapeHtml(error.message)}</p><button class="button secondary" data-action="reload">Try again</button></div>`;
  }
}

function heading(title, description, button = '') {
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${button}</div>`;
}
function statCard(label, value, note, icon) {
  return `<article class="stat-card"><div class="stat-top"><span>${escapeHtml(label)}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${escapeHtml(value)}</div><div class="stat-note">${escapeHtml(note)}</div></article>`;
}
function tableMarkup(headers, rows, emptyMessage = 'No records yet.') {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td class="table-empty" colspan="${headers.length}">${escapeHtml(emptyMessage)}</td></tr>`}</tbody></table></div>`;
}
function badge(value, label = value) {
  const normalized = String(value || '').toLowerCase();
  return `<span class="badge ${escapeHtml(normalized)}">${escapeHtml(label || '—')}</span>`;
}
function searchableTable(headers, rows, emptyMessage) {
  return `<section class="table-panel"><div class="table-tools"><div class="search-box"><span class="search-symbol">⌕</span><input data-search placeholder="Search records…" aria-label="Search records"></div><span class="eyebrow">${rows ? 'LATEST RECORDS' : 'NO RECORDS'}</span></div><div data-filter-table>${tableMarkup(headers, rows, emptyMessage)}</div></section>`;
}
function filterTable(table, query) {
  table.querySelectorAll('tbody tr').forEach((row) => {
    row.hidden = !row.textContent.toLowerCase().includes(query);
  });
}

async function renderDashboard() {
  const data = await api('/api/dashboard');
  const { summary, recentSales, alerts } = data;
  const saleRows = recentSales.map((sale) => `<tr><td><strong>#${sale.id}</strong></td><td>${escapeHtml(sale.customer_name)}</td><td>${dateTimeLabel(sale.sold_at)}</td><td>${money(sale.total)}</td><td>${badge(sale.payment_method)}</td></tr>`).join('');
  const alertRows = alerts.map((alert) => `<div class="alert-row"><span class="alert-dot${alert.alert === 'Expired' ? ' expired' : ''}"></span><div><div class="alert-name">${escapeHtml(alert.medicine_name)}</div><div class="alert-detail">${escapeHtml(alert.alert)} · Batch ${escapeHtml(alert.batch_number)} · ${dateLabel(alert.expiry_date)}</div></div></div>`).join('');
  return `${heading(`Good ${greeting()}, ${state.user.name.split(' ')[0]}`, 'Here is what is happening at your pharmacy today.')}
    <section class="stats-grid">
      ${statCard('Today’s sales', money(summary.today_sales), 'Revenue recorded today', '↗')}
      ${statCard('Active medicines', summary.medicine_count, 'In your medicine catalogue', '✚')}
      ${statCard('Low stock', summary.low_stock_count, 'At or below reorder level', '▦')}
      ${statCard('Expiry alerts', Number(summary.expired_count) + Number(summary.expiring_count), `${summary.expired_count} expired · ${summary.expiring_count} expiring soon`, '◷')}
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Recent sales</div><div class="panel-caption">Latest pharmacy transactions</div></div><button class="button ghost" data-page="sales">View all →</button></div>${tableMarkup(['Bill', 'Customer', 'Date', 'Amount', 'Payment'], saleRows, 'No sales recorded yet.')}</article>
      <div class="panel"><div class="panel-head"><div><div class="panel-title">Expiry watch</div><div class="panel-caption">Batches requiring attention</div></div>${badge(alerts.length ? `${alerts.length} alerts` : 'Clear')}</div><div class="panel-body"><div class="alert-list">${alertRows || '<div class="table-empty">No expiry alerts. Your stock looks good.</div>'}</div></div></div>
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Quick actions</div><div class="panel-caption">Common tasks, one click away</div></div></div><div class="panel-body"><div class="quick-grid">
        ${quickAction('＋', 'New sale', 'Create a bill', 'new-sale')}
        ${quickAction('✚', 'Add medicine', 'Update your catalogue', 'add-medicine')}
        ${quickAction('↙', 'Record purchase', 'Receive new stock', 'add-purchase')}
        ${quickAction('♙', 'Add customer', 'Save customer details', 'add-customer')}
      </div></div></article>
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Your pharmacy</div><div class="panel-caption">Connected operations</div></div></div><div class="panel-body"><div class="quick-grid">
        ${statMini('Customers', summary.customer_count, '♙')}
        ${statMini('Suppliers', summary.supplier_count, '♧')}
      </div><p class="panel-caption" style="line-height:1.6;margin-top:16px">Keep medicines, batches, prescriptions and billing connected in one reliable workspace.</p></div></article>
    </section>`;
}
function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
}
function quickAction(icon, title, description, action) {
  return `<button class="quick-action" data-action="${action}"><span class="quick-icon">${icon}</span><span><span class="quick-title">${title}</span><span class="quick-desc">${description}</span></span></button>`;
}
function statMini(label, value, icon) {
  return `<div class="quick-action" style="cursor:default"><span class="quick-icon">${icon}</span><span><span class="quick-title">${escapeHtml(value)}</span><span class="quick-desc">${label}</span></span></div>`;
}

async function renderMedicines() {
  state.medicines = await api('/api/medicines');
  const rows = state.medicines.map((medicine) => `<tr><td><strong>${escapeHtml(medicine.name)}</strong><div class="panel-caption">${escapeHtml(medicine.generic_name || medicine.sku)}</div></td><td>${escapeHtml(medicine.category || '—')}</td><td>${money(medicine.selling_price)}</td><td>${Number(medicine.stock)}</td><td>${medicine.stock <= medicine.low_stock_threshold ? badge('low', 'Low stock') : badge('ok', 'In stock')}</td><td>${dateLabel(medicine.next_expiry)}</td><td>${medicine.prescription_required ? badge('active', 'Rx required') : '—'}</td><td><div class="row-actions"><button class="row-action" data-edit-medicine="${medicine.id}">Edit</button><button class="row-action delete" data-delete-medicine="${medicine.id}">Archive</button></div></td></tr>`).join('');
  return `${heading('Medicine catalogue', pageDetails.medicines[1], '<button class="button primary" data-action="add-medicine">＋ Add medicine</button>')}
    ${searchableTable(['Medicine', 'Category', 'Price', 'Stock', 'Status', 'Next expiry', 'Prescription', 'Actions'], rows, 'Add a medicine to get started.')}`;
}

async function renderInventory() {
  const inventory = await api('/api/inventory');
  const rows = inventory.map((item) => `<tr><td><strong>${escapeHtml(item.medicine_name)}</strong><div class="panel-caption">${escapeHtml(item.sku)}</div></td><td>${escapeHtml(item.batch_number)}</td><td>${escapeHtml(item.supplier_name || '—')}</td><td>${Number(item.quantity)}</td><td>${dateLabel(item.expiry_date)}</td><td>${badge(item.status, item.status === 'ok' ? 'In date' : item.status)}</td><td>${money(item.unit_cost)}</td></tr>`).join('');
  return `${heading('Inventory', pageDetails.inventory[1], '<button class="button primary" data-action="add-purchase">＋ Receive stock</button>')}
    <section class="stats-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${statCard('Tracked batches', inventory.length, 'Across your medicine catalogue', '▦')}${statCard('Total units', inventory.reduce((sum, item) => sum + Number(item.quantity), 0), 'Including expired stock', '＋')}${statCard('Needs attention', inventory.filter((item) => item.status !== 'ok' && Number(item.quantity) > 0).length, 'Expired or expiring within 30 days', '◷')}</section>
    ${searchableTable(['Medicine', 'Batch', 'Supplier', 'Quantity', 'Expiry date', 'Status', 'Unit cost'], rows, 'No stock batches yet. Record a purchase to receive stock.')}`;
}

async function renderCustomers() {
  state.customers = await api('/api/customers');
  const rows = state.customers.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.phone || '—')}</td><td>${escapeHtml(item.email || '—')}</td><td>${escapeHtml(item.address || '—')}</td><td>${dateLabel(item.created_at)}</td></tr>`).join('');
  return `${heading('Customers', pageDetails.customers[1], '<button class="button primary" data-action="add-customer">＋ Add customer</button>')}
    ${searchableTable(['Name', 'Phone', 'Email', 'Address', 'Added'], rows, 'Add a customer to get started.')}`;
}

async function renderSuppliers() {
  state.suppliers = await api('/api/suppliers');
  const rows = state.suppliers.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.contact_person || '—')}</td><td>${escapeHtml(item.phone || '—')}</td><td>${escapeHtml(item.email || '—')}</td><td>${escapeHtml(item.address || '—')}</td></tr>`).join('');
  return `${heading('Suppliers', pageDetails.suppliers[1], '<button class="button primary" data-action="add-supplier">＋ Add supplier</button>')}
    ${searchableTable(['Supplier', 'Contact person', 'Phone', 'Email', 'Address'], rows, 'Add your first supplier.')}`;
}

async function renderPurchases() {
  const purchases = await api('/api/purchases');
  const rows = purchases.map((item) => `<tr><td><strong>#${item.id}</strong></td><td>${escapeHtml(item.supplier_name)}</td><td>${dateTimeLabel(item.purchase_date)}</td><td>${Number(item.item_count)}</td><td>${money(item.total)}</td><td>${escapeHtml(item.created_by)}</td></tr>`).join('');
  return `${heading('Purchases', pageDetails.purchases[1], '<button class="button primary" data-action="add-purchase">＋ Record purchase</button>')}
    ${searchableTable(['Purchase', 'Supplier', 'Received', 'Items', 'Total cost', 'Recorded by'], rows, 'Record a purchase when stock arrives.')}`;
}

async function renderSales() {
  const sales = await api('/api/sales');
  const rows = sales.map((item) => `<tr><td><strong>#${item.id}</strong></td><td>${escapeHtml(item.customer_name || 'Walk-in customer')}</td><td>${dateTimeLabel(item.sold_at)}</td><td>${Number(item.item_count)}</td><td><strong>${money(item.total)}</strong></td><td>${badge(item.payment_method)}</td><td>${escapeHtml(item.created_by)}</td><td><button class="row-action" data-view-sale="${item.id}">Receipt</button></td></tr>`).join('');
  return `${heading('Sales & billing', pageDetails.sales[1], '<button class="button primary" data-action="new-sale">＋ New sale</button>')}
    ${searchableTable(['Bill', 'Customer', 'Date', 'Items', 'Total', 'Payment', 'Pharmacist', ''], rows, 'Your completed sales will appear here.')}`;
}

async function renderPrescriptions() {
  state.prescriptions = await api('/api/prescriptions');
  const rows = state.prescriptions.map((item) => `<tr><td><strong>#${item.id}</strong></td><td>${escapeHtml(item.customer_name)}</td><td>${escapeHtml(item.prescriber_name)}</td><td>${dateLabel(item.prescription_date)}</td><td>${escapeHtml(item.medicines || '—')}</td><td>${badge(item.status)}</td></tr>`).join('');
  return `${heading('Prescriptions', pageDetails.prescriptions[1], '<button class="button primary" data-action="add-prescription">＋ Add prescription</button>')}
    ${searchableTable(['Prescription', 'Customer', 'Prescriber', 'Date', 'Medicines', 'Status'], rows, 'Add a prescription to get started.')}`;
}

async function renderReports() {
  const reports = await api(`/api/reports?from=${encodeURIComponent(state.reportFrom || '')}&to=${encodeURIComponent(state.reportTo || '')}`);
  const maxRevenue = Math.max(1, ...reports.sales.map((item) => Number(item.revenue)));
  const bars = reports.sales.slice(0, 12).reverse().map((item) => `<div class="bar-item" title="${dateLabel(item.date)} · ${money(item.revenue)}"><span class="bar" style="height:${Math.max(4, Number(item.revenue) / maxRevenue * 140)}px"></span><span class="bar-label">${new Date(`${String(item.date).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>`).join('');
  const topRows = reports.topMedicines.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${Number(item.quantity_sold)}</td><td>${money(item.revenue)}</td></tr>`).join('');
  const stockRows = reports.stock.map((item) => `<tr><td>${escapeHtml(item.sku)}</td><td><strong>${escapeHtml(item.name)}</strong></td><td>${Number(item.quantity)}</td><td>${Number(item.low_stock_threshold)}</td><td>${Number(item.quantity) <= Number(item.low_stock_threshold) ? badge('low', 'Reorder') : badge('ok', 'Healthy')}</td></tr>`).join('');
  return `${heading('Reports', pageDetails.reports[1])}
    <form class="inline-form" id="report-filter">${field('From', 'from', { type: 'date', value: state.reportFrom || '' })}${field('To', 'to', { type: 'date', value: state.reportTo || '' })}<button class="button secondary" type="submit">Apply filters</button><button class="button ghost" type="button" data-action="clear-report">Clear</button></form>
    <section class="report-grid">
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Sales revenue</div><div class="panel-caption">Daily totals, most recent 12 days</div></div></div><div class="panel-body"><div class="bar-chart">${bars || '<div class="table-empty">No sales in this date range.</div>'}</div></div></article>
      <article class="panel"><div class="panel-head"><div><div class="panel-title">Top medicines</div><div class="panel-caption">Ranked by units sold</div></div></div>${tableMarkup(['Medicine', 'Units sold', 'Revenue'], topRows, 'No sales in this date range.')}</article>
    </section>
    <section class="table-panel"><div class="panel-head"><div><div class="panel-title">Stock overview</div><div class="panel-caption">Current unexpired quantity and reorder threshold</div></div></div>${tableMarkup(['SKU', 'Medicine', 'Quantity', 'Reorder level', 'Status'], stockRows, 'No medicine records.')}</section>`;
}

function modal(title, content, options = {}) {
  const { id = 'record-form', submitLabel = 'Save record', onSubmit } = options;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><h2 id="modal-title">${escapeHtml(title)}</h2><button class="modal-close" type="button" aria-label="Close">×</button></header><form id="${id}"><div class="modal-body">${content}<div class="form-error" id="modal-error"></div></div><footer class="modal-actions"><button class="button secondary" type="button" data-close-modal>Cancel</button><button class="button primary" type="submit">${escapeHtml(submitLabel)}</button></footer></form></section>`;
  document.body.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop || event.target.closest('[data-close-modal], .modal-close')) close(); });
  backdrop.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('[type="submit"]');
    const errorBox = backdrop.querySelector('#modal-error');
    submitButton.disabled = true;
    errorBox.classList.remove('visible');
    try {
      await onSubmit(new FormData(event.currentTarget), event.currentTarget);
      close();
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add('visible');
    } finally {
      submitButton.disabled = false;
    }
  });
  backdrop.querySelector('input, select, textarea')?.focus();
  return backdrop;
}

function valuesFrom(formData) {
  return Object.fromEntries(formData.entries());
}

async function openMedicineModal(medicine) {
  const editing = Boolean(medicine);
  const value = (key) => medicine?.[key] ?? '';
  const content = `<div class="form-grid">
    ${field('SKU', 'sku', { value: value('sku'), required: true })}
    ${field('Medicine name', 'name', { value: value('name'), required: true })}
    ${field('Generic name', 'generic_name', { value: value('generic_name') })}
    ${field('Category', 'category', { value: value('category'), placeholder: 'e.g. Antibiotic' })}
    ${field('Manufacturer', 'manufacturer', { value: value('manufacturer') })}
    ${field('Unit', 'unit', { value: value('unit') || 'unit', required: true })}
    ${field('Selling price (₹)', 'selling_price', { type: 'number', min: '0', step: '0.01', value: value('selling_price'), required: true })}
    ${field('Low-stock threshold', 'low_stock_threshold', { type: 'number', min: '1', step: '1', value: value('low_stock_threshold') || 10, required: true })}
    ${field('Prescription required', 'prescription_required', { type: 'checkbox', checked: Boolean(medicine?.prescription_required) })}
  </div>`;
  modal(editing ? 'Edit medicine' : 'Add medicine', content, {
    submitLabel: editing ? 'Save changes' : 'Add medicine',
    onSubmit: async (data) => {
      const body = valuesFrom(data);
      body.prescription_required = data.has('prescription_required');
      await api(editing ? `/api/medicines/${medicine.id}` : '/api/medicines', { method: editing ? 'PUT' : 'POST', body });
      showToast(editing ? 'Medicine updated.' : 'Medicine added.');
      await loadPage();
    }
  });
}

async function openCustomerModal() {
  modal('Add customer', `<div class="form-grid">${field('Customer name', 'name', { required: true })}${field('Phone', 'phone', { type: 'tel' })}${field('Email', 'email', { type: 'email' })}${field('Address', 'address', { full: true })}</div>`, {
    submitLabel: 'Add customer',
    onSubmit: async (data) => { await api('/api/customers', { method: 'POST', body: valuesFrom(data) }); showToast('Customer added.'); await loadPage(); }
  });
}
async function openSupplierModal() {
  modal('Add supplier', `<div class="form-grid">${field('Supplier name', 'name', { required: true })}${field('Contact person', 'contact_person')}${field('Phone', 'phone', { type: 'tel' })}${field('Email', 'email', { type: 'email' })}${field('Address', 'address', { full: true })}</div>`, {
    submitLabel: 'Add supplier',
    onSubmit: async (data) => { await api('/api/suppliers', { method: 'POST', body: valuesFrom(data) }); showToast('Supplier added.'); await loadPage(); }
  });
}

function selectOptions(items, label, value = 'id', name = 'name') {
  const optionLabel = typeof name === 'function' ? name : (item) => item[name];
  return `<option value="">${escapeHtml(label)}</option>${items.map((item) => `<option value="${escapeHtml(item[value])}">${escapeHtml(optionLabel(item))}</option>`).join('')}`;
}
function purchaseItemRow(medicines, index) {
  return `<div class="item-row" data-item-row>
    <div class="field"><label>Medicine</label><select name="medicine_id" required>${selectOptions(medicines, 'Select medicine')}</select></div>
    <div class="field"><label>Batch no.</label><input name="batch_number" required></div>
    <div class="field"><label>Expiry</label><input name="expiry_date" type="date" min="${today()}" required></div>
    <div class="field"><label>Qty</label><input name="quantity" type="number" min="1" step="1" required></div>
    <div class="field"><label>Cost / unit</label><input name="unit_cost" type="number" min="0" step="0.01" required></div>
    <div class="field"><label>Sale price</label><input name="selling_price" type="number" min="0" step="0.01" required></div>
    <button class="remove-item" type="button" data-remove-item aria-label="Remove item">×</button>
  </div>`;
}
async function openPurchaseModal() {
  const [suppliers, medicines] = await Promise.all([api('/api/suppliers'), api('/api/medicines')]);
  if (!suppliers.length || !medicines.length) {
    showToast(!suppliers.length ? 'Add a supplier before recording a purchase.' : 'Add a medicine before recording a purchase.', true);
    if (!suppliers.length) openSupplierModal();
    else openMedicineModal();
    return;
  }
  const content = `<div class="form-grid"><div class="field full"><label for="supplier_id">Supplier</label><select id="supplier_id" name="supplier_id" required>${selectOptions(suppliers, 'Select supplier')}</select></div></div>
    <div style="display:flex;align-items:center;justify-content:space-between"><strong>Purchase items</strong><button class="button ghost" type="button" id="add-purchase-item">＋ Add item</button></div>
    <div id="purchase-items">${purchaseItemRow(medicines, 0)}</div>`;
  const element = modal('Record purchase', content, {
    submitLabel: 'Save purchase',
    onSubmit: async (data, form) => {
      const items = [...form.querySelectorAll('[data-item-row]')].map((row) =>
        Object.fromEntries([...row.querySelectorAll('[name]')].map((input) => [input.name, input.value]))
      );
      await api('/api/purchases', { method: 'POST', body: { supplier_id: data.get('supplier_id'), items } });
      showToast('Purchase recorded and stock updated.');
      await loadPage();
    }
  });
  element.querySelector('#add-purchase-item').addEventListener('click', () => {
    element.querySelector('#purchase-items').insertAdjacentHTML('beforeend', purchaseItemRow(medicines));
  });
  element.querySelector('#purchase-items').addEventListener('click', (event) => {
    if (event.target.matches('[data-remove-item]')) {
      const rows = element.querySelectorAll('[data-item-row]');
      if (rows.length === 1) return;
      event.target.closest('[data-item-row]').remove();
    }
  });
}

async function openPrescriptionModal() {
  const [customers, medicines] = await Promise.all([api('/api/customers'), api('/api/medicines')]);
  if (!customers.length || !medicines.length) {
    showToast(!customers.length ? 'Add a customer before recording a prescription.' : 'Add a medicine before recording a prescription.', true);
    if (!customers.length) openCustomerModal();
    else openMedicineModal();
    return;
  }
  const options = medicines.map((medicine) => `<label class="check-field"><input type="checkbox" name="medicine_ids" value="${medicine.id}"> ${escapeHtml(medicine.name)}${medicine.prescription_required ? ' · Rx' : ''}</label>`).join('');
  modal('Add prescription', `<div class="form-grid">
    ${field('Customer', 'customer_id', { type: 'select', required: true, choices: selectOptions(customers, 'Select customer') })}
    ${field('Prescriber name', 'prescriber_name', { required: true })}
    ${field('Prescription date', 'prescription_date', { type: 'date', value: today(), required: true })}
    ${field('Notes', 'notes', { type: 'textarea', full: true })}
    <div class="field full"><label>Prescribed medicines</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:8px 0">${options}</div></div>
  </div>`, {
    submitLabel: 'Save prescription',
    onSubmit: async (data) => {
      const medicine_ids = data.getAll('medicine_ids');
      if (!medicine_ids.length) throw new Error('Select at least one prescribed medicine.');
      await api('/api/prescriptions', { method: 'POST', body: { ...valuesFrom(data), medicine_ids } });
      showToast('Prescription saved.');
      await loadPage();
    }
  });
}

async function openSaleModal() {
  const [medicines, customers, prescriptions, inventory] = await Promise.all([
    api('/api/medicines'), api('/api/customers'), api('/api/prescriptions'), api('/api/inventory')
  ]);
  if (!medicines.length) {
    showToast('Add a medicine before creating a sale.', true);
    openMedicineModal();
    return;
  }
  const availableByMedicine = new Map();
  inventory.filter((batch) => batch.status !== 'expired').forEach((batch) => {
    availableByMedicine.set(batch.medicine_id, (availableByMedicine.get(batch.medicine_id) || 0) + Number(batch.quantity));
  });
  const saleChoices = medicines.filter((medicine) => (availableByMedicine.get(medicine.id) || 0) > 0);
  if (!saleChoices.length) {
    showToast('There is no unexpired stock available. Record a purchase first.', true);
    openPurchaseModal();
    return;
  }
  const activePrescriptions = prescriptions.filter((prescription) => prescription.status === 'active');
  const items = new Map();
  const content = `<div class="form-grid">
    ${field('Customer (optional)', 'customer_id', { type: 'select', choices: selectOptions(customers, 'Walk-in customer') })}
    ${field('Prescription (if required)', 'prescription_id', { type: 'select', choices: selectOptions(activePrescriptions, 'No prescription', 'id', (item) => `#${item.id} · ${item.customer_name}`) })}
    ${field('Payment method', 'payment_method', { type: 'select', choices: '<option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="other">Other</option>' })}
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between"><strong>Bill items</strong><button class="button ghost" type="button" id="add-sale-item">＋ Add medicine</button></div>
  <div id="sale-items"></div>
  <div id="sale-total" class="receipt-total"><span>Estimated total</span><span>₹0.00</span></div>`;
  const element = modal('Create sale', content, {
    submitLabel: 'Complete sale',
    onSubmit: async (data, form) => {
      const saleItems = [...items.entries()].map(([medicine_id, quantity]) => ({ medicine_id, quantity: Number(quantity) }));
      if (!saleItems.length) throw new Error('Add at least one medicine to the sale.');
      const result = await api('/api/sales', { method: 'POST', body: { ...valuesFrom(data), items: saleItems } });
      showToast(`Sale #${result.id} completed. Stock updated.`);
      await loadPage();
      openReceipt(result.id);
    }
  });
  const addItem = (medicineId = '') => {
    const select = `<select data-sale-medicine><option value="">Select medicine</option>${saleChoices.map((medicine) => `<option value="${medicine.id}" data-price="${medicine.selling_price}">${escapeHtml(medicine.name)} · ${money(medicine.selling_price)} · ${availableByMedicine.get(medicine.id)} available</option>`).join('')}</select>`;
    element.querySelector('#sale-items').insertAdjacentHTML('beforeend', `<div class="item-row" data-sale-row><div class="field" style="grid-column:span 2"><label>Medicine</label>${select}</div><div class="field"><label>Quantity</label><input data-sale-quantity type="number" min="1" step="1" value="1"></div><button class="remove-item" type="button" data-remove-sale aria-label="Remove item">×</button></div>`);
    const row = element.querySelector('#sale-items [data-sale-row]:last-child');
    if (medicineId) row.querySelector('[data-sale-medicine]').value = String(medicineId);
  };
  const updateItems = () => {
    items.clear();
    element.querySelectorAll('[data-sale-row]').forEach((row) => {
      const id = Number(row.querySelector('[data-sale-medicine]').value);
      const quantity = Number(row.querySelector('[data-sale-quantity]').value);
      if (id && quantity > 0) items.set(id, (items.get(id) || 0) + quantity);
    });
    const estimate = [...items.entries()].reduce((total, [id, quantity]) => total + Number(medicines.find((medicine) => Number(medicine.id) === id).selling_price) * quantity, 0);
    element.querySelector('#sale-total span:last-child').textContent = money(estimate);
  };
  element.querySelector('#add-sale-item').addEventListener('click', () => addItem());
  element.querySelector('#sale-items').addEventListener('change', updateItems);
  element.querySelector('#sale-items').addEventListener('input', updateItems);
  element.querySelector('#sale-items').addEventListener('click', (event) => {
    if (event.target.matches('[data-remove-sale]')) {
      event.target.closest('[data-sale-row]').remove();
      updateItems();
    }
  });
  element.querySelector('#customer_id').addEventListener('change', (event) => {
    const customer = event.target.value;
    [...element.querySelector('#prescription_id').options].forEach((option) => {
      if (!option.value) return;
      const prescription = activePrescriptions.find((item) => String(item.id) === option.value);
      option.hidden = Boolean(customer && String(prescription.customer_id) !== customer);
    });
    const selected = element.querySelector('#prescription_id');
    if (selected.selectedOptions[0]?.hidden) selected.value = '';
  });
  addItem();
}

async function openReceipt(id) {
  const sale = await api(`/api/sales/${id}`);
  const receiptBackdrop = document.createElement('div');
  receiptBackdrop.className = 'modal-backdrop';
  const itemRows = sale.items.map((item) => `<tr><td><strong>${escapeHtml(item.medicine_name)}</strong><div class="panel-caption">${item.quantity} × ${money(item.unit_price)}</div></td><td>${money(item.line_total)}</td></tr>`).join('');
  receiptBackdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="receipt-title"><header class="modal-head"><h2 id="receipt-title">Sale receipt</h2><button class="modal-close" aria-label="Close">×</button></header><div class="modal-body"><div class="receipt"><h3 class="receipt-title">MediFlow Pharmacy</h3><div class="receipt-meta">Bill #${sale.id} · ${dateTimeLabel(sale.sold_at)}<br>${escapeHtml(sale.customer_name || 'Walk-in customer')}</div>${tableMarkup(['Medicine', 'Amount'], itemRows, 'No bill items.') }<div class="receipt-total"><span>Total paid · ${escapeHtml(sale.payment_method)}</span><span>${money(sale.total)}</span></div></div></div><footer class="modal-actions"><button class="button secondary" data-close-modal>Close</button><button class="button primary" onclick="window.print()">Print receipt</button></footer></section>`;
  document.body.append(receiptBackdrop);
  receiptBackdrop.addEventListener('click', (event) => {
    if (event.target === receiptBackdrop || event.target.closest('.modal-close, [data-close-modal]')) receiptBackdrop.remove();
  });
}

async function handlePageAction(event) {
  const button = event.target.closest('[data-action], [data-page], [data-edit-medicine], [data-delete-medicine], [data-view-sale]');
  if (!button) return;
  if (button.dataset.page) { navigate(button.dataset.page); return; }
  const action = button.dataset.action;
  if (action === 'new-sale') return openSaleModal();
  if (action === 'add-medicine') return openMedicineModal();
  if (action === 'add-customer') return openCustomerModal();
  if (action === 'add-supplier') return openSupplierModal();
  if (action === 'add-purchase') return openPurchaseModal();
  if (action === 'add-prescription') return openPrescriptionModal();
  if (action === 'reload') return loadPage();
  if (action === 'clear-report') {
    state.reportFrom = '';
    state.reportTo = '';
    return loadPage();
  }
  if (button.dataset.editMedicine) {
    const medicine = state.medicines.find((item) => Number(item.id) === Number(button.dataset.editMedicine));
    if (medicine) openMedicineModal(medicine);
  } else if (button.dataset.deleteMedicine) {
    if (!window.confirm('Archive this medicine? It will no longer be available for new sales.')) return;
    try {
      await api(`/api/medicines/${button.dataset.deleteMedicine}`, { method: 'DELETE' });
      showToast('Medicine archived.');
      await loadPage();
    } catch (error) { showToast(error.message, true); }
  } else if (button.dataset.viewSale) {
    try { await openReceipt(button.dataset.viewSale); } catch (error) { showToast(error.message, true); }
  }
}

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (error) { showToast(error.message, true); }
  state.user = null;
  renderLogin();
}

document.addEventListener('submit', (event) => {
  if (event.target.id !== 'report-filter') return;
  event.preventDefault();
  const values = new FormData(event.target);
  state.reportFrom = values.get('from') || '';
  state.reportTo = values.get('to') || '';
  loadPage();
});

async function initialize() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
    if (user) renderShell();
    else renderLogin();
  } catch (error) {
    renderLogin();
    showToast(error.message, true);
  }
}

initialize();

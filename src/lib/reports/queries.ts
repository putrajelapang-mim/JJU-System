import type { ReportResult } from './types';

function defaultRange(from?: string, to?: string): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  return { from: from ?? '2000-01-01', to: to ?? today };
}

export async function getSalesReport(db: D1Database, companyId: string, from?: string, to?: string): Promise<ReportResult> {
  const range = defaultRange(from, to);
  const { results } = await db
    .prepare(
      `SELECT jobs.id, jobs.created_at, jobs.total, jobs.payment_status, jobs.payment_method,
              customers.name as customer_name, cars.plate_no
       FROM jobs JOIN customers ON customers.id = jobs.customer_id JOIN cars ON cars.id = jobs.car_id
       WHERE jobs.company_id = ? AND date(jobs.created_at) BETWEEN ? AND ?
       ORDER BY jobs.created_at`
    )
    .bind(companyId, range.from, range.to)
    .all<{ id: string; created_at: string; total: number; payment_status: string; payment_method: string | null; customer_name: string; plate_no: string }>();

  const totalSales = results.reduce((sum, r) => sum + r.total, 0);

  return {
    title: 'Laporan Jualan / Sales Report',
    generatedAt: new Date().toISOString(),
    summary: [
      { label: 'Tempoh', value: `${range.from} - ${range.to}` },
      { label: 'Jumlah Transaksi', value: String(results.length) },
      { label: 'Jumlah Jualan', value: `RM ${totalSales.toFixed(2)}` },
    ],
    columns: [
      { key: 'created_at', label: 'Tarikh' },
      { key: 'customer_name', label: 'Pelanggan' },
      { key: 'plate_no', label: 'No. Plat' },
      { key: 'total', label: 'Jumlah (RM)' },
      { key: 'payment_status', label: 'Status Bayaran' },
    ],
    rows: results.map((r) => ({
      created_at: r.created_at,
      customer_name: r.customer_name,
      plate_no: r.plate_no,
      total: r.total.toFixed(2),
      payment_status: r.payment_status,
    })),
  };
}

export async function getInventoryReport(db: D1Database, companyId: string): Promise<ReportResult> {
  const { results } = await db
    .prepare('SELECT name, sku, stock_qty, min_stock, buy_price, sell_price FROM inventory WHERE company_id = ? ORDER BY name')
    .bind(companyId)
    .all<{ name: string; sku: string | null; stock_qty: number; min_stock: number; buy_price: number | null; sell_price: number }>();

  const totalValue = results.reduce((sum, r) => sum + r.stock_qty * (r.buy_price ?? 0), 0);

  return {
    title: 'Laporan Stok / Inventory Report',
    generatedAt: new Date().toISOString(),
    summary: [
      { label: 'Jumlah Item', value: String(results.length) },
      { label: 'Nilai Stok (kos)', value: `RM ${totalValue.toFixed(2)}` },
    ],
    columns: [
      { key: 'name', label: 'Nama' },
      { key: 'sku', label: 'SKU' },
      { key: 'stock_qty', label: 'Stok' },
      { key: 'min_stock', label: 'Stok Min' },
      { key: 'sell_price', label: 'Harga Jual (RM)' },
    ],
    rows: results.map((r) => ({
      name: r.name,
      sku: r.sku ?? '-',
      stock_qty: r.stock_qty,
      min_stock: r.min_stock,
      sell_price: r.sell_price.toFixed(2),
    })),
  };
}

export async function getLowStockReport(db: D1Database, companyId: string): Promise<ReportResult> {
  const { results } = await db
    .prepare(
      'SELECT name, sku, stock_qty, min_stock FROM inventory WHERE company_id = ? AND stock_qty <= min_stock ORDER BY name'
    )
    .bind(companyId)
    .all<{ name: string; sku: string | null; stock_qty: number; min_stock: number }>();

  return {
    title: 'Laporan Stok Rendah / Low Stock Alert',
    generatedAt: new Date().toISOString(),
    summary: [{ label: 'Jumlah Item Stok Rendah', value: String(results.length) }],
    columns: [
      { key: 'name', label: 'Nama' },
      { key: 'sku', label: 'SKU' },
      { key: 'stock_qty', label: 'Stok Semasa' },
      { key: 'min_stock', label: 'Stok Min' },
    ],
    rows: results.map((r) => ({ name: r.name, sku: r.sku ?? '-', stock_qty: r.stock_qty, min_stock: r.min_stock })),
  };
}

export async function getPnlReport(db: D1Database, companyId: string, from?: string, to?: string): Promise<ReportResult> {
  const range = defaultRange(from, to);

  const { results: jobRows } = await db
    .prepare(
      `SELECT jobs.id, jobs.created_at, jobs.subtotal, jobs.discount_amount
       FROM jobs WHERE jobs.company_id = ? AND date(jobs.created_at) BETWEEN ? AND ?`
    )
    .bind(companyId, range.from, range.to)
    .all<{ id: string; created_at: string; subtotal: number; discount_amount: number }>();

  const jobIds = jobRows.map((j) => j.id);
  const cogsByJob = new Map<string, number>();
  if (jobIds.length > 0) {
    const placeholders = jobIds.map(() => '?').join(', ');
    const { results: cogsRows } = await db
      .prepare(
        `SELECT job_parts.job_id, SUM(job_parts.qty * COALESCE(inventory.buy_price, 0)) as cogs
         FROM job_parts LEFT JOIN inventory ON inventory.id = job_parts.inventory_id
         WHERE job_parts.job_id IN (${placeholders})
         GROUP BY job_parts.job_id`
      )
      .bind(...jobIds)
      .all<{ job_id: string; cogs: number }>();
    for (const row of cogsRows) cogsByJob.set(row.job_id, row.cogs);
  }

  let totalRevenue = 0;
  let totalCogs = 0;
  const rows = jobRows.map((j) => {
    const revenue = j.subtotal - j.discount_amount;
    const cogs = cogsByJob.get(j.id) ?? 0;
    totalRevenue += revenue;
    totalCogs += cogs;
    return { created_at: j.created_at, revenue: revenue.toFixed(2), cogs: cogs.toFixed(2), gross_profit: (revenue - cogs).toFixed(2) };
  });

  return {
    title: 'Laporan Untung Rugi (Akruan) / P&L Report (Accrual)',
    generatedAt: new Date().toISOString(),
    summary: [
      { label: 'Tempoh', value: `${range.from} - ${range.to}` },
      { label: 'Hasil (Revenue)', value: `RM ${totalRevenue.toFixed(2)}` },
      { label: 'Kos Barang Dijual (COGS)', value: `RM ${totalCogs.toFixed(2)}` },
      { label: 'Untung Kasar (Gross Profit)', value: `RM ${(totalRevenue - totalCogs).toFixed(2)}` },
      { label: 'Nota', value: 'SST tidak dikira sebagai hasil. Perbelanjaan operasi tidak disertakan.' },
    ],
    columns: [
      { key: 'created_at', label: 'Tarikh' },
      { key: 'revenue', label: 'Hasil (RM)' },
      { key: 'cogs', label: 'COGS (RM)' },
      { key: 'gross_profit', label: 'Untung Kasar (RM)' },
    ],
    rows,
  };
}

export async function getCashflowReport(db: D1Database, companyId: string, from?: string, to?: string): Promise<ReportResult> {
  const range = defaultRange(from, to);

  const { results } = await db
    .prepare(
      `SELECT jobs.id, jobs.completed_at, jobs.total, jobs.payment_method
       FROM jobs
       WHERE jobs.company_id = ? AND jobs.payment_status = 'dah_bayar'
         AND jobs.completed_at IS NOT NULL AND date(jobs.completed_at) BETWEEN ? AND ?
       ORDER BY jobs.completed_at`
    )
    .bind(companyId, range.from, range.to)
    .all<{ id: string; completed_at: string; total: number; payment_method: string | null }>();

  const byMethod = { cash: 0, card: 0, split: 0, unspecified: 0 } as Record<string, number>;
  for (const r of results) byMethod[r.payment_method ?? 'unspecified'] += r.total;
  const grandTotal = results.reduce((sum, r) => sum + r.total, 0);

  return {
    title: 'Laporan Aliran Tunai (Tunai) / Cashflow Report (Cash Basis)',
    generatedAt: new Date().toISOString(),
    summary: [
      { label: 'Tempoh', value: `${range.from} - ${range.to}` },
      { label: 'Tunai (Cash)', value: `RM ${byMethod.cash.toFixed(2)}` },
      { label: 'Kad (Card)', value: `RM ${byMethod.card.toFixed(2)}` },
      { label: 'Split', value: `RM ${byMethod.split.toFixed(2)}` },
      { label: 'Jumlah Diterima', value: `RM ${grandTotal.toFixed(2)}` },
      { label: 'Nota', value: 'Berdasarkan tarikh dikutip (completed_at), bukan tarikh job dibuat.' },
    ],
    columns: [
      { key: 'completed_at', label: 'Tarikh Kutip' },
      { key: 'payment_method', label: 'Kaedah' },
      { key: 'total', label: 'Jumlah (RM)' },
    ],
    rows: results.map((r) => ({ completed_at: r.completed_at, payment_method: r.payment_method ?? '-', total: r.total.toFixed(2) })),
  };
}

export async function getCustomerListReport(db: D1Database, companyId: string): Promise<ReportResult> {
  const { results } = await db
    .prepare(
      `SELECT customers.id, customers.name, customers.phone,
              (SELECT COUNT(*) FROM cars WHERE cars.customer_id = customers.id) as car_count,
              (SELECT MAX(jobs.completed_at) FROM jobs WHERE jobs.customer_id = customers.id) as last_service_date
       FROM customers WHERE customers.company_id = ? ORDER BY customers.name`
    )
    .bind(companyId)
    .all<{ id: string; name: string; phone: string | null; car_count: number; last_service_date: string | null }>();

  return {
    title: 'Senarai Pelanggan / Customer CRM List',
    generatedAt: new Date().toISOString(),
    summary: [{ label: 'Jumlah Pelanggan', value: String(results.length) }],
    columns: [
      { key: 'name', label: 'Nama' },
      { key: 'phone', label: 'Telefon' },
      { key: 'car_count', label: 'Bil. Kereta' },
      { key: 'last_service_date', label: 'Servis Terakhir' },
    ],
    rows: results.map((r) => ({
      name: r.name,
      phone: r.phone ?? '-',
      car_count: r.car_count,
      last_service_date: r.last_service_date ?? '-',
    })),
  };
}

export async function getJobHistoryReport(
  db: D1Database,
  companyId: string,
  from?: string,
  to?: string,
  status?: string
): Promise<ReportResult> {
  const range = defaultRange(from, to);

  let stmt = db.prepare(
    `SELECT jobs.id, jobs.created_at, jobs.status, jobs.total, customers.name as customer_name, cars.plate_no,
            (SELECT GROUP_CONCAT(services.name, ', ') FROM job_services JOIN services ON services.id = job_services.service_id WHERE job_services.job_id = jobs.id) as service_names
     FROM jobs JOIN customers ON customers.id = jobs.customer_id JOIN cars ON cars.id = jobs.car_id
     WHERE jobs.company_id = ? AND date(jobs.created_at) BETWEEN ? AND ?
     ORDER BY jobs.created_at DESC`
  ).bind(companyId, range.from, range.to);

  if (status) {
    stmt = db
      .prepare(
        `SELECT jobs.id, jobs.created_at, jobs.status, jobs.total, customers.name as customer_name, cars.plate_no,
                (SELECT GROUP_CONCAT(services.name, ', ') FROM job_services JOIN services ON services.id = job_services.service_id WHERE job_services.job_id = jobs.id) as service_names
         FROM jobs JOIN customers ON customers.id = jobs.customer_id JOIN cars ON cars.id = jobs.car_id
         WHERE jobs.company_id = ? AND date(jobs.created_at) BETWEEN ? AND ? AND jobs.status = ?
         ORDER BY jobs.created_at DESC`
      )
      .bind(companyId, range.from, range.to, status);
  }

  const { results } = await stmt.all<{
    id: string;
    created_at: string;
    status: string;
    total: number;
    customer_name: string;
    plate_no: string;
    service_names: string | null;
  }>();

  return {
    title: 'Laporan Sejarah Servis / Job Service History',
    generatedAt: new Date().toISOString(),
    summary: [
      { label: 'Tempoh', value: `${range.from} - ${range.to}` },
      { label: 'Jumlah Job', value: String(results.length) },
    ],
    columns: [
      { key: 'created_at', label: 'Tarikh' },
      { key: 'customer_name', label: 'Pelanggan' },
      { key: 'plate_no', label: 'No. Plat' },
      { key: 'service_names', label: 'Servis' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Jumlah (RM)' },
    ],
    rows: results.map((r) => ({
      created_at: r.created_at,
      customer_name: r.customer_name,
      plate_no: r.plate_no,
      service_names: r.service_names ?? '-',
      status: r.status,
      total: r.total.toFixed(2),
    })),
  };
}

export async function getDailyClosingReport(db: D1Database, companyId: string, date?: string): Promise<ReportResult> {
  const day = date ?? new Date().toISOString().slice(0, 10);

  const { results } = await db
    .prepare(
      `SELECT jobs.id, jobs.total, jobs.payment_method, jobs.payment_status
       FROM jobs
       WHERE jobs.company_id = ? AND jobs.status = 'dah_collect' AND date(jobs.completed_at) = ?`
    )
    .bind(companyId, day)
    .all<{ id: string; total: number; payment_method: string | null; payment_status: string }>();

  const byMethod = { cash: 0, card: 0, split: 0, unspecified: 0 } as Record<string, number>;
  let unpaidCount = 0;
  for (const r of results) {
    byMethod[r.payment_method ?? 'unspecified'] += r.total;
    if (r.payment_status !== 'dah_bayar') unpaidCount += 1;
  }
  const grandTotal = results.reduce((sum, r) => sum + r.total, 0);

  return {
    title: 'Penutupan Harian / Daily Closing & Cash Reconciliation',
    generatedAt: new Date().toISOString(),
    summary: [
      { label: 'Tarikh', value: day },
      { label: 'Jumlah Job Dikutip', value: String(results.length) },
      { label: 'Tunai (Cash)', value: `RM ${byMethod.cash.toFixed(2)}` },
      { label: 'Kad (Card)', value: `RM ${byMethod.card.toFixed(2)}` },
      { label: 'Split', value: `RM ${byMethod.split.toFixed(2)}` },
      { label: 'Jumlah Keseluruhan', value: `RM ${grandTotal.toFixed(2)}` },
      { label: 'Job Belum Bayar (perlu semak)', value: String(unpaidCount) },
    ],
    columns: [
      { key: 'id', label: 'Job ID' },
      { key: 'payment_method', label: 'Kaedah' },
      { key: 'payment_status', label: 'Status Bayaran' },
      { key: 'total', label: 'Jumlah (RM)' },
    ],
    rows: results.map((r) => ({
      id: r.id,
      payment_method: r.payment_method ?? '-',
      payment_status: r.payment_status,
      total: r.total.toFixed(2),
    })),
  };
}

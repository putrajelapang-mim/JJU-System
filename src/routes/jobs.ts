import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { newId } from '../utils/id';
import { ok, err } from '../utils/response';

const jobs = new Hono<AppEnv>();

jobs.use('*', requireAuth);

interface ServiceInput {
  service_id: string;
}
interface PartInput {
  inventory_id?: string;
  is_manual_item?: boolean;
  manual_item_name?: string;
  price?: number;
  qty?: number;
}

jobs.post('/', async (c) => {
  const { companyId, staffId } = c.get('auth');
  const body = await c.req.json<{
    customer_id?: string;
    car_id?: string;
    booking_id?: string;
    services?: ServiceInput[];
    parts?: PartInput[];
    payment_method?: 'cash' | 'card' | 'split';
    apply_discount?: boolean;
  }>();

  const { customer_id, car_id } = body;
  if (!customer_id || !car_id) return err(c, 400, 'customer_id and car_id are required');

  const car = await c.env.DB.prepare(
    `SELECT cars.id FROM cars JOIN customers ON customers.id = cars.customer_id
     WHERE cars.id = ? AND cars.customer_id = ? AND customers.company_id = ?`
  )
    .bind(car_id, customer_id, companyId)
    .first();
  if (!car) return err(c, 400, 'car_id does not belong to customer_id for this company');

  const company = await c.env.DB.prepare(
    'SELECT sst_enabled, sst_rate, discount_enabled, discount_type, discount_value FROM companies WHERE id = ?'
  )
    .bind(companyId)
    .first<{
      sst_enabled: number;
      sst_rate: number;
      discount_enabled: number;
      discount_type: 'percentage' | 'fixed' | null;
      discount_value: number | null;
    }>();
  if (!company) return err(c, 404, 'Company not found');

  // Resolve services
  const serviceLines: Array<{ service_id: string; price: number }> = [];
  for (const s of body.services ?? []) {
    if (!s.service_id) return err(c, 400, 'Each service requires service_id');
    const svc = await c.env.DB.prepare('SELECT id, price FROM services WHERE id = ? AND company_id = ?')
      .bind(s.service_id, companyId)
      .first<{ id: string; price: number }>();
    if (!svc) return err(c, 400, `Service ${s.service_id} not found`);
    serviceLines.push({ service_id: svc.id, price: svc.price });
  }

  // Resolve parts (inventory-backed or manual)
  const partLines: Array<{
    inventory_id: string | null;
    qty: number;
    price: number;
    is_manual_item: boolean;
    manual_item_name: string | null;
  }> = [];
  const stockDeductions: Array<{ inventory_id: string; qty: number }> = [];

  for (const p of body.parts ?? []) {
    const qty = p.qty ?? 1;
    if (qty <= 0) return err(c, 400, 'Part qty must be positive');

    if (p.is_manual_item) {
      if (!p.manual_item_name || p.price === undefined) {
        return err(c, 400, 'Manual items require manual_item_name and price');
      }
      partLines.push({
        inventory_id: null,
        qty,
        price: p.price,
        is_manual_item: true,
        manual_item_name: p.manual_item_name,
      });
    } else {
      if (!p.inventory_id) return err(c, 400, 'Each part requires inventory_id or is_manual_item');
      const item = await c.env.DB.prepare(
        'SELECT id, stock_qty, sell_price, name FROM inventory WHERE id = ? AND company_id = ?'
      )
        .bind(p.inventory_id, companyId)
        .first<{ id: string; stock_qty: number; sell_price: number; name: string }>();
      if (!item) return err(c, 400, `Inventory item ${p.inventory_id} not found`);
      if (item.stock_qty < qty) return err(c, 400, `Insufficient stock for ${item.name}`);

      partLines.push({
        inventory_id: item.id,
        qty,
        price: p.price ?? item.sell_price,
        is_manual_item: false,
        manual_item_name: null,
      });
      stockDeductions.push({ inventory_id: item.id, qty });
    }
  }

  const subtotal =
    serviceLines.reduce((sum, s) => sum + s.price, 0) +
    partLines.reduce((sum, p) => sum + p.price * p.qty, 0);

  let discountAmount = 0;
  const applyDiscount = body.apply_discount ?? true;
  if (company.discount_enabled && applyDiscount && company.discount_type && company.discount_value) {
    discountAmount =
      company.discount_type === 'percentage'
        ? subtotal * (company.discount_value / 100)
        : company.discount_value;
    discountAmount = Math.min(discountAmount, subtotal);
  }

  const taxable = subtotal - discountAmount;
  const sstAmount = company.sst_enabled ? taxable * (company.sst_rate / 100) : 0;
  const total = taxable + sstAmount;

  const jobId = newId('job');
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO jobs (id, company_id, customer_id, car_id, staff_id, booking_id, subtotal, discount_amount, sst_amount, total, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      jobId,
      companyId,
      customer_id,
      car_id,
      staffId,
      body.booking_id ?? null,
      subtotal,
      discountAmount,
      sstAmount,
      total,
      body.payment_method ?? null
    ),
  ];

  for (const s of serviceLines) {
    statements.push(
      c.env.DB.prepare('INSERT INTO job_services (id, job_id, service_id, price) VALUES (?, ?, ?, ?)').bind(
        newId('jsvc'),
        jobId,
        s.service_id,
        s.price
      )
    );
  }
  for (const p of partLines) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO job_parts (id, job_id, inventory_id, qty, price, is_manual_item, manual_item_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(newId('jpart'), jobId, p.inventory_id, p.qty, p.price, p.is_manual_item ? 1 : 0, p.manual_item_name)
    );
  }
  for (const d of stockDeductions) {
    statements.push(
      c.env.DB.prepare("UPDATE inventory SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?").bind(
        d.qty,
        d.inventory_id
      )
    );
  }
  if (body.booking_id) {
    statements.push(
      c.env.DB.prepare("UPDATE bookings SET status = 'converted' WHERE id = ? AND company_id = ?").bind(
        body.booking_id,
        companyId
      )
    );
  }

  await c.env.DB.batch(statements);

  return ok(
    c,
    {
      id: jobId,
      status: 'dalam_kerja',
      subtotal,
      discount_amount: discountAmount,
      sst_amount: sstAmount,
      total,
      services: serviceLines,
      parts: partLines,
    },
    201
  );
});

jobs.get('/', async (c) => {
  const { companyId } = c.get('auth');
  const status = c.req.query('status');

  let stmt = c.env.DB.prepare(
    `SELECT jobs.id, jobs.status, jobs.total, jobs.payment_status, jobs.notified_wa, jobs.created_at, jobs.completed_at,
            cars.plate_no, customers.name as customer_name
     FROM jobs
     JOIN cars ON cars.id = jobs.car_id
     JOIN customers ON customers.id = jobs.customer_id
     WHERE jobs.company_id = ?
     ORDER BY jobs.created_at DESC`
  ).bind(companyId);

  if (status) {
    stmt = c.env.DB.prepare(
      `SELECT jobs.id, jobs.status, jobs.total, jobs.payment_status, jobs.notified_wa, jobs.created_at, jobs.completed_at,
              cars.plate_no, customers.name as customer_name
       FROM jobs
       JOIN cars ON cars.id = jobs.car_id
       JOIN customers ON customers.id = jobs.customer_id
       WHERE jobs.company_id = ? AND jobs.status = ?
       ORDER BY jobs.created_at DESC`
    ).bind(companyId, status);
  }

  const { results: jobRows } = await stmt.all<{ id: string }>();
  if (jobRows.length === 0) return ok(c, []);

  const jobIds = jobRows.map((j) => j.id);
  const placeholders = jobIds.map(() => '?').join(', ');
  const { results: serviceNames } = await c.env.DB.prepare(
    `SELECT job_services.job_id, services.name
     FROM job_services JOIN services ON services.id = job_services.service_id
     WHERE job_services.job_id IN (${placeholders})`
  )
    .bind(...jobIds)
    .all<{ job_id: string; name: string }>();

  const namesByJob = new Map<string, string[]>();
  for (const row of serviceNames) {
    const list = namesByJob.get(row.job_id) ?? [];
    list.push(row.name);
    namesByJob.set(row.job_id, list);
  }

  const data = jobRows.map((j) => ({ ...j, services: namesByJob.get(j.id) ?? [] }));
  return ok(c, data);
});

jobs.get('/:id', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');

  const job = await c.env.DB.prepare(
    `SELECT jobs.*, cars.plate_no, cars.model, customers.name as customer_name, customers.phone as customer_phone
     FROM jobs
     JOIN cars ON cars.id = jobs.car_id
     JOIN customers ON customers.id = jobs.customer_id
     WHERE jobs.id = ? AND jobs.company_id = ?`
  )
    .bind(id, companyId)
    .first();
  if (!job) return err(c, 404, 'Job not found');

  const { results: serviceLines } = await c.env.DB.prepare(
    `SELECT job_services.id, job_services.price, services.name
     FROM job_services JOIN services ON services.id = job_services.service_id
     WHERE job_services.job_id = ?`
  )
    .bind(id)
    .all();

  const { results: partLines } = await c.env.DB.prepare(
    `SELECT job_parts.id, job_parts.qty, job_parts.price, job_parts.is_manual_item, job_parts.manual_item_name,
            inventory.name as inventory_name
     FROM job_parts LEFT JOIN inventory ON inventory.id = job_parts.inventory_id
     WHERE job_parts.job_id = ?`
  )
    .bind(id)
    .all();

  return ok(c, { ...job, services: serviceLines, parts: partLines });
});

const VALID_STATUSES = ['dalam_kerja', 'siap', 'dah_collect'];

jobs.patch('/:id/status', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const { status } = await c.req.json<{ status?: string }>();

  if (!status || !VALID_STATUSES.includes(status)) {
    return err(c, 400, `status must be one of ${VALID_STATUSES.join(', ')}`);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM jobs WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!existing) return err(c, 404, 'Job not found');

  if (status === 'dah_collect') {
    await c.env.DB.prepare("UPDATE jobs SET status = ?, completed_at = datetime('now') WHERE id = ?")
      .bind(status, id)
      .run();
  } else {
    await c.env.DB.prepare('UPDATE jobs SET status = ? WHERE id = ?').bind(status, id).run();
  }

  return ok(c, { id, status });
});

jobs.patch('/:id/payment', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const body = await c.req.json<{ payment_method?: 'cash' | 'card' | 'split'; payment_status?: 'belum_bayar' | 'dah_bayar' }>();

  const existing = await c.env.DB.prepare('SELECT id FROM jobs WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!existing) return err(c, 404, 'Job not found');

  const fieldMap: Record<string, unknown> = {
    payment_method: body.payment_method,
    payment_status: body.payment_status,
  };
  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map(([f]) => `${f} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await c.env.DB.prepare(`UPDATE jobs SET ${setClause} WHERE id = ?`)
    .bind(...values, id)
    .run();

  return ok(c, { id, ...Object.fromEntries(updates) });
});

jobs.post('/:id/notify-wa', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');

  const job = await c.env.DB.prepare(
    `SELECT jobs.id, jobs.notified_wa, customers.phone
     FROM jobs JOIN customers ON customers.id = jobs.customer_id
     WHERE jobs.id = ? AND jobs.company_id = ?`
  )
    .bind(id, companyId)
    .first<{ id: string; notified_wa: number; phone: string | null }>();
  if (!job) return err(c, 404, 'Job not found');

  // TODO: wire up actual WhatsApp send (WhatsApp Cloud API / provider) once
  // credentials are available. For now this just records that the shop
  // notified the customer, so the job board can suppress duplicate notifies.
  await c.env.DB.prepare('UPDATE jobs SET notified_wa = 1 WHERE id = ?').bind(id).run();

  return ok(c, { id, notified_wa: true, phone: job.phone });
});

export { jobs };

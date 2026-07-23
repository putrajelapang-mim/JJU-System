import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { createJob, type CreateJobInput } from '../lib/createJob';
import { ok, err } from '../utils/response';

const jobs = new Hono<AppEnv>();

jobs.use('*', requireAuth);

jobs.post('/', async (c) => {
  const { companyId, staffId } = c.get('auth');
  const body = await c.req.json<Partial<CreateJobInput>>();

  if (!body.customer_id || !body.car_id) return err(c, 400, 'customer_id and car_id are required');

  const result = await createJob(c.env.DB, companyId, staffId, body as CreateJobInput);
  if (!result.ok) return err(c, result.status, result.message);

  return ok(c, result.job, 201);
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

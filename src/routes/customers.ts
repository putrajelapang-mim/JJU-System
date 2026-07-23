import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { newId } from '../utils/id';
import { ok, err } from '../utils/response';

const customers = new Hono<AppEnv>();

customers.use('*', requireAuth);

customers.get('/', async (c) => {
  const { companyId } = c.get('auth');
  const search = c.req.query('search');

  let customerRows;
  if (search) {
    const like = `%${search}%`;
    customerRows = await c.env.DB.prepare(
      'SELECT * FROM customers WHERE company_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY name'
    )
      .bind(companyId, like, like)
      .all();
  } else {
    customerRows = await c.env.DB.prepare('SELECT * FROM customers WHERE company_id = ? ORDER BY name')
      .bind(companyId)
      .all();
  }

  const customerList = customerRows.results as Array<{ id: string; name: string; phone: string | null }>;
  if (customerList.length === 0) return ok(c, []);

  const ids = customerList.map((cust) => cust.id);
  const placeholders = ids.map(() => '?').join(', ');

  const { results: carRows } = await c.env.DB.prepare(
    `SELECT id, customer_id, plate_no, model FROM cars WHERE customer_id IN (${placeholders}) ORDER BY created_at`
  )
    .bind(...ids)
    .all();

  const { results: lastServiceRows } = await c.env.DB.prepare(
    `SELECT cars.customer_id as customer_id, MAX(jobs.completed_at) as last_service_date
     FROM jobs JOIN cars ON cars.id = jobs.car_id
     WHERE jobs.company_id = ? AND cars.customer_id IN (${placeholders})
     GROUP BY cars.customer_id`
  )
    .bind(companyId, ...ids)
    .all();

  const carsByCustomer = new Map<string, unknown[]>();
  for (const row of carRows as Array<{ customer_id: string }>) {
    const list = carsByCustomer.get(row.customer_id) ?? [];
    list.push(row);
    carsByCustomer.set(row.customer_id, list);
  }
  const lastServiceByCustomer = new Map<string, string | null>();
  for (const row of lastServiceRows as Array<{ customer_id: string; last_service_date: string | null }>) {
    lastServiceByCustomer.set(row.customer_id, row.last_service_date);
  }

  const data = customerList.map((cust) => ({
    ...cust,
    cars: carsByCustomer.get(cust.id) ?? [],
    last_service_date: lastServiceByCustomer.get(cust.id) ?? null,
  }));

  return ok(c, data);
});

customers.post('/', async (c) => {
  const { companyId } = c.get('auth');
  const body = await c.req.json<{
    name?: string;
    phone?: string;
    car?: { plate_no?: string; model?: string };
  }>();

  if (!body.name) return err(c, 400, 'name is required');

  const customerId = newId('cust');
  await c.env.DB.prepare('INSERT INTO customers (id, company_id, name, phone) VALUES (?, ?, ?, ?)')
    .bind(customerId, companyId, body.name, body.phone ?? null)
    .run();

  let car = null;
  if (body.car?.plate_no) {
    const carId = newId('car');
    await c.env.DB.prepare('INSERT INTO cars (id, customer_id, plate_no, model) VALUES (?, ?, ?, ?)')
      .bind(carId, customerId, body.car.plate_no, body.car.model ?? null)
      .run();
    car = { id: carId, plate_no: body.car.plate_no, model: body.car.model ?? null };
  }

  return ok(c, { id: customerId, name: body.name, phone: body.phone ?? null, car }, 201);
});

customers.get('/:id', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');

  const customer = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!customer) return err(c, 404, 'Customer not found');

  const { results: cars } = await c.env.DB.prepare(
    'SELECT * FROM cars WHERE customer_id = ? ORDER BY created_at'
  )
    .bind(id)
    .all();

  const carIds = (cars as Array<{ id: string }>).map((carRow) => carRow.id);
  let history: unknown[] = [];
  if (carIds.length > 0) {
    const placeholders = carIds.map(() => '?').join(', ');
    const { results } = await c.env.DB.prepare(
      `SELECT j.id, j.car_id, j.status, j.total, j.payment_status, j.created_at, j.completed_at
       FROM jobs j
       WHERE j.company_id = ? AND j.car_id IN (${placeholders})
       ORDER BY j.created_at DESC`
    )
      .bind(companyId, ...carIds)
      .all();
    history = results;
  }

  const historyByCarId = new Map<string, unknown[]>();
  for (const job of history as Array<{ car_id: string }>) {
    const list = historyByCarId.get(job.car_id) ?? [];
    list.push(job);
    historyByCarId.set(job.car_id, list);
  }

  const carsWithHistory = (cars as Array<{ id: string }>).map((carRow) => ({
    ...carRow,
    service_history: historyByCarId.get(carRow.id) ?? [],
  }));

  return ok(c, { ...customer, cars: carsWithHistory });
});

customers.patch('/:id', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; phone?: string }>();

  const existing = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!existing) return err(c, 404, 'Customer not found');

  const fieldMap: Record<string, unknown> = { name: body.name, phone: body.phone };
  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map(([f]) => `${f} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await c.env.DB.prepare(`UPDATE customers SET ${setClause} WHERE id = ?`)
    .bind(...values, id)
    .run();

  return ok(c, { id, ...Object.fromEntries(updates) });
});

customers.post('/:id/cars', async (c) => {
  const { companyId } = c.get('auth');
  const customerId = c.req.param('id');
  const body = await c.req.json<{ plate_no?: string; model?: string }>();

  if (!body.plate_no) return err(c, 400, 'plate_no is required');

  const customer = await c.env.DB.prepare('SELECT id FROM customers WHERE id = ? AND company_id = ?')
    .bind(customerId, companyId)
    .first();
  if (!customer) return err(c, 404, 'Customer not found');

  const carId = newId('car');
  await c.env.DB.prepare('INSERT INTO cars (id, customer_id, plate_no, model) VALUES (?, ?, ?, ?)')
    .bind(carId, customerId, body.plate_no, body.model ?? null)
    .run();

  return ok(c, { id: carId, customer_id: customerId, plate_no: body.plate_no, model: body.model ?? null }, 201);
});

customers.patch('/cars/:carId', async (c) => {
  const { companyId } = c.get('auth');
  const carId = c.req.param('carId');
  const body = await c.req.json<{ plate_no?: string; model?: string }>();

  const car = await c.env.DB.prepare(
    `SELECT cars.id FROM cars JOIN customers ON customers.id = cars.customer_id
     WHERE cars.id = ? AND customers.company_id = ?`
  )
    .bind(carId, companyId)
    .first();
  if (!car) return err(c, 404, 'Car not found');

  const fieldMap: Record<string, unknown> = { plate_no: body.plate_no, model: body.model };
  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map(([f]) => `${f} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await c.env.DB.prepare(`UPDATE cars SET ${setClause} WHERE id = ?`)
    .bind(...values, carId)
    .run();

  return ok(c, { id: carId, ...Object.fromEntries(updates) });
});

export { customers };

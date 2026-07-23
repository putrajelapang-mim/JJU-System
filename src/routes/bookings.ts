import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { newId } from '../utils/id';
import { createJob } from '../lib/createJob';
import { ok, err } from '../utils/response';

const bookings = new Hono<AppEnv>();

bookings.use('*', requireAuth);

bookings.get('/', async (c) => {
  const { companyId } = c.get('auth');
  const status = c.req.query('status');

  let stmt = c.env.DB.prepare(
    `SELECT bookings.*, customers.name as customer_name, cars.plate_no, services.name as service_name
     FROM bookings
     JOIN customers ON customers.id = bookings.customer_id
     JOIN cars ON cars.id = bookings.car_id
     LEFT JOIN services ON services.id = bookings.service_id
     WHERE bookings.company_id = ?
     ORDER BY bookings.booking_date, bookings.booking_time`
  ).bind(companyId);

  if (status) {
    stmt = c.env.DB.prepare(
      `SELECT bookings.*, customers.name as customer_name, cars.plate_no, services.name as service_name
       FROM bookings
       JOIN customers ON customers.id = bookings.customer_id
       JOIN cars ON cars.id = bookings.car_id
       LEFT JOIN services ON services.id = bookings.service_id
       WHERE bookings.company_id = ? AND bookings.status = ?
       ORDER BY bookings.booking_date, bookings.booking_time`
    ).bind(companyId, status);
  }

  const { results } = await stmt.all();
  return ok(c, results);
});

bookings.post('/', async (c) => {
  const { companyId } = c.get('auth');
  const body = await c.req.json<{
    customer_id?: string;
    car_id?: string;
    service_id?: string;
    booking_date?: string;
    booking_time?: string;
    notes?: string;
  }>();

  if (!body.customer_id || !body.car_id || !body.booking_date) {
    return err(c, 400, 'customer_id, car_id and booking_date are required');
  }

  const car = await c.env.DB.prepare(
    `SELECT cars.id FROM cars JOIN customers ON customers.id = cars.customer_id
     WHERE cars.id = ? AND cars.customer_id = ? AND customers.company_id = ?`
  )
    .bind(body.car_id, body.customer_id, companyId)
    .first();
  if (!car) return err(c, 400, 'car_id does not belong to customer_id for this company');

  const id = newId('bkg');
  await c.env.DB.prepare(
    `INSERT INTO bookings (id, company_id, customer_id, car_id, service_id, booking_date, booking_time, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      companyId,
      body.customer_id,
      body.car_id,
      body.service_id ?? null,
      body.booking_date,
      body.booking_time ?? null,
      body.notes ?? null
    )
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  return ok(c, row, 201);
});

bookings.get('/:id', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');

  const row = await c.env.DB.prepare(
    `SELECT bookings.*, customers.name as customer_name, customers.phone as customer_phone,
            cars.plate_no, cars.model, services.name as service_name
     FROM bookings
     JOIN customers ON customers.id = bookings.customer_id
     JOIN cars ON cars.id = bookings.car_id
     LEFT JOIN services ON services.id = bookings.service_id
     WHERE bookings.id = ? AND bookings.company_id = ?`
  )
    .bind(id, companyId)
    .first();
  if (!row) return err(c, 404, 'Booking not found');
  return ok(c, row);
});

const VALID_BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled'];

bookings.patch('/:id', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const body = await c.req.json<{
    booking_date?: string;
    booking_time?: string;
    notes?: string;
    status?: string;
    service_id?: string;
  }>();

  if (body.status && !VALID_BOOKING_STATUSES.includes(body.status)) {
    return err(c, 400, `status must be one of ${VALID_BOOKING_STATUSES.join(', ')}`);
  }

  const existing = await c.env.DB.prepare('SELECT status FROM bookings WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first<{ status: string }>();
  if (!existing) return err(c, 404, 'Booking not found');
  if (existing.status === 'converted') return err(c, 400, 'Booking already converted to a job');

  const fieldMap: Record<string, unknown> = {
    booking_date: body.booking_date,
    booking_time: body.booking_time,
    notes: body.notes,
    status: body.status,
    service_id: body.service_id,
  };
  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map(([f]) => `${f} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await c.env.DB.prepare(`UPDATE bookings SET ${setClause} WHERE id = ?`)
    .bind(...values, id)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  return ok(c, row);
});

bookings.post('/:id/convert-to-job', async (c) => {
  const { companyId, staffId } = c.get('auth');
  const id = c.req.param('id');

  const booking = await c.env.DB.prepare('SELECT * FROM bookings WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first<{
      id: string;
      customer_id: string;
      car_id: string;
      service_id: string | null;
      status: string;
    }>();
  if (!booking) return err(c, 404, 'Booking not found');
  if (booking.status === 'converted') return err(c, 400, 'Booking already converted to a job');
  if (booking.status === 'cancelled') return err(c, 400, 'Cannot convert a cancelled booking');

  const result = await createJob(c.env.DB, companyId, staffId, {
    customer_id: booking.customer_id,
    car_id: booking.car_id,
    booking_id: booking.id,
    services: booking.service_id ? [{ service_id: booking.service_id }] : [],
  });
  if (!result.ok) return err(c, result.status, result.message);

  return ok(c, result.job, 201);
});

export { bookings };

import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth, requireRole } from '../middleware/auth';
import { newId } from '../utils/id';
import { ok, err } from '../utils/response';

const services = new Hono<AppEnv>();

services.use('*', requireAuth);

services.get('/', async (c) => {
  const { companyId } = c.get('auth');
  const includeInactive = c.req.query('all') === 'true';

  const { results } = await (includeInactive
    ? c.env.DB.prepare('SELECT * FROM services WHERE company_id = ? ORDER BY name').bind(companyId)
    : c.env.DB.prepare('SELECT * FROM services WHERE company_id = ? AND active = 1 ORDER BY name').bind(
        companyId
      )
  ).all();

  return ok(c, results);
});

services.post('/', requireRole('Owner', 'Admin'), async (c) => {
  const { companyId } = c.get('auth');
  const body = await c.req.json<{ name?: string; price?: number }>();

  if (!body.name || body.price === undefined) return err(c, 400, 'name and price are required');

  const id = newId('svc');
  await c.env.DB.prepare('INSERT INTO services (id, company_id, name, price) VALUES (?, ?, ?, ?)')
    .bind(id, companyId, body.name, body.price)
    .run();

  return ok(c, { id, name: body.name, price: body.price, active: 1 }, 201);
});

services.patch('/:id', requireRole('Owner', 'Admin'), async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; price?: number; active?: boolean }>();

  const existing = await c.env.DB.prepare('SELECT id FROM services WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!existing) return err(c, 404, 'Service not found');

  const fieldMap: Record<string, unknown> = {
    name: body.name,
    price: body.price,
    active: body.active === undefined ? undefined : body.active ? 1 : 0,
  };
  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map(([f]) => `${f} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await c.env.DB.prepare(`UPDATE services SET ${setClause} WHERE id = ?`)
    .bind(...values, id)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM services WHERE id = ?').bind(id).first();
  return ok(c, row);
});

services.delete('/:id', requireRole('Owner', 'Admin'), async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT id FROM services WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!existing) return err(c, 404, 'Service not found');

  await c.env.DB.prepare('UPDATE services SET active = 0 WHERE id = ?').bind(id).run();
  return ok(c, { id, active: false });
});

export { services };

import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth, requireRole } from '../middleware/auth';
import { newId } from '../utils/id';
import { hashPassword } from '../utils/password';
import { ok, err } from '../utils/response';

const staff = new Hono<AppEnv>();

staff.use('*', requireAuth);

staff.get('/', async (c) => {
  const { companyId } = c.get('auth');
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.email, s.phone, s.active, r.name as role_name
     FROM staff s JOIN roles r ON r.id = s.role_id
     WHERE s.company_id = ? ORDER BY s.created_at`
  )
    .bind(companyId)
    .all();
  return ok(c, results);
});

staff.get('/roles', async (c) => {
  const { companyId } = c.get('auth');
  const { results } = await c.env.DB.prepare('SELECT id, name, is_system FROM roles WHERE company_id = ?')
    .bind(companyId)
    .all();
  return ok(c, results);
});

staff.post('/', requireRole('Owner', 'Admin'), async (c) => {
  const { companyId } = c.get('auth');
  const body = await c.req.json<{ name?: string; email?: string; phone?: string; password?: string; role_id?: string }>();
  const { name, email, password, role_id } = body;

  if (!name || !email || !password || !role_id) {
    return err(c, 400, 'name, email, password and role_id are required');
  }
  if (password.length < 8) return err(c, 400, 'Password must be at least 8 characters');

  const role = await c.env.DB.prepare('SELECT id FROM roles WHERE id = ? AND company_id = ?')
    .bind(role_id, companyId)
    .first();
  if (!role) return err(c, 400, 'Invalid role_id for this company');

  const existing = await c.env.DB.prepare('SELECT id FROM staff WHERE email = ?').bind(email).first();
  if (existing) return err(c, 409, 'Email already in use');

  const staffId = newId('staff');
  const passwordHash = await hashPassword(password);

  await c.env.DB.prepare(
    'INSERT INTO staff (id, company_id, role_id, name, phone, email, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(staffId, companyId, role_id, name, body.phone ?? null, email, passwordHash)
    .run();

  return ok(c, { id: staffId, name, email, role_id }, 201);
});

staff.patch('/:id', requireRole('Owner', 'Admin'), async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const body = await c.req.json<{ name?: string; phone?: string; role_id?: string; active?: boolean }>();

  const existing = await c.env.DB.prepare('SELECT id FROM staff WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!existing) return err(c, 404, 'Staff not found');

  if (body.role_id) {
    const role = await c.env.DB.prepare('SELECT id FROM roles WHERE id = ? AND company_id = ?')
      .bind(body.role_id, companyId)
      .first();
    if (!role) return err(c, 400, 'Invalid role_id for this company');
  }

  const fieldMap: Record<string, unknown> = {
    name: body.name,
    phone: body.phone,
    role_id: body.role_id,
    active: body.active === undefined ? undefined : body.active ? 1 : 0,
  };
  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map(([f]) => `${f} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await c.env.DB.prepare(`UPDATE staff SET ${setClause} WHERE id = ?`)
    .bind(...values, id)
    .run();

  return ok(c, { id, ...Object.fromEntries(updates) });
});

export { staff };

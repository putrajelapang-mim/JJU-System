import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { newId } from '../utils/id';
import { hashPassword, verifyPassword } from '../utils/password';
import { signAuthToken } from '../utils/jwt';
import { ok, err } from '../utils/response';

const auth = new Hono<AppEnv>();

auth.post('/signup', async (c) => {
  const body = await c.req.json<{
    workshop_name?: string;
    phone?: string;
    email?: string;
    password?: string;
    plan?: string;
  }>();

  const { workshop_name, phone, email, password } = body;
  if (!workshop_name || !email || !password) {
    return err(c, 400, 'workshop_name, email and password are required');
  }
  if (password.length < 8) {
    return err(c, 400, 'Password must be at least 8 characters');
  }

  const existing = await c.env.DB.prepare('SELECT id FROM staff WHERE email = ?').bind(email).first();
  if (existing) return err(c, 409, 'Email already in use');

  const companyId = newId('co');
  const ownerRoleId = newId('role');
  const adminRoleId = newId('role');
  const staffId = newId('staff');
  const passwordHash = await hashPassword(password);

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO companies (id, name, phone, plan) VALUES (?, ?, ?, ?)'
    ).bind(companyId, workshop_name, phone ?? null, body.plan ?? 'trial'),
    c.env.DB.prepare('INSERT INTO roles (id, company_id, name, is_system) VALUES (?, ?, ?, 1)').bind(
      ownerRoleId,
      companyId,
      'Owner'
    ),
    c.env.DB.prepare('INSERT INTO roles (id, company_id, name, is_system) VALUES (?, ?, ?, 1)').bind(
      adminRoleId,
      companyId,
      'Admin'
    ),
    c.env.DB.prepare(
      'INSERT INTO staff (id, company_id, role_id, name, phone, email, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(staffId, companyId, ownerRoleId, workshop_name, phone ?? null, email, passwordHash),
  ]);

  const token = await signAuthToken(
    { staffId, companyId, roleId: ownerRoleId, roleName: 'Owner' },
    c.env.JWT_SECRET
  );

  return ok(c, { token, company_id: companyId, staff_id: staffId, role: 'Owner' }, 201);
});

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) return err(c, 400, 'email and password are required');

  const row = await c.env.DB.prepare(
    `SELECT s.id as staff_id, s.company_id, s.password_hash, s.active, r.id as role_id, r.name as role_name
     FROM staff s JOIN roles r ON r.id = s.role_id
     WHERE s.email = ?`
  )
    .bind(email)
    .first<{
      staff_id: string;
      company_id: string;
      password_hash: string;
      active: number;
      role_id: string;
      role_name: string;
    }>();

  if (!row || !row.active) return err(c, 401, 'Invalid email or password');

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return err(c, 401, 'Invalid email or password');

  const token = await signAuthToken(
    { staffId: row.staff_id, companyId: row.company_id, roleId: row.role_id, roleName: row.role_name },
    c.env.JWT_SECRET
  );

  return ok(c, { token, company_id: row.company_id, staff_id: row.staff_id, role: row.role_name });
});

auth.get('/me', requireAuth, async (c) => {
  const authCtx = c.get('auth');
  const row = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.email, s.phone, r.name as role_name, c.name as company_name
     FROM staff s JOIN roles r ON r.id = s.role_id JOIN companies c ON c.id = s.company_id
     WHERE s.id = ?`
  )
    .bind(authCtx.staffId)
    .first();

  if (!row) return err(c, 404, 'Staff not found');
  return ok(c, row);
});

export { auth };

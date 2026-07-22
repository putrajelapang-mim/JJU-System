import { Context } from 'hono';

export function ok(c: Context, data: unknown, status: 200 | 201 = 200) {
  return c.json({ ok: true, data }, status);
}

export function err(c: Context, status: 400 | 401 | 403 | 404 | 409 | 500, message: string) {
  return c.json({ ok: false, error: message }, status);
}

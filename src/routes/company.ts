import { Hono, type Context } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth, requireRole } from '../middleware/auth';
import { isAllowedImageType, arrayBufferToDataUrl, MAX_IMAGE_BYTES } from '../utils/image';
import { ok, err } from '../utils/response';

const company = new Hono<AppEnv>();

company.use('*', requireAuth);

company.get('/', async (c) => {
  const { companyId } = c.get('auth');
  const row = await c.env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId).first();
  if (!row) return err(c, 404, 'Company not found');
  return ok(c, row);
});

company.patch('/', requireRole('Owner', 'Admin'), async (c) => {
  const { companyId } = c.get('auth');
  const body = await c.req.json<{ name?: string; phone?: string; address?: string }>();

  const fields = ['name', 'phone', 'address'] as const;
  const updates = fields.filter((f) => body[f] !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map((f) => `${f} = ?`).join(', ');
  const values = updates.map((f) => body[f]);

  await c.env.DB.prepare(`UPDATE companies SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, companyId)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId).first();
  return ok(c, row);
});

async function uploadBrandingImage(c: Context<AppEnv>, column: 'logo_url' | 'letterhead_url') {
  const { companyId } = c.get('auth');
  const contentType = c.req.header('Content-Type') ?? '';
  if (!isAllowedImageType(contentType)) return err(c, 400, 'Content-Type must be image/png, image/jpeg or image/webp');

  const body = await c.req.arrayBuffer();
  if (body.byteLength > MAX_IMAGE_BYTES) return err(c, 400, 'Image too large (max 1.5MB)');

  const dataUrl = arrayBufferToDataUrl(body, contentType);
  await c.env.DB.prepare(`UPDATE companies SET ${column} = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(dataUrl, companyId)
    .run();

  return ok(c, { [column]: dataUrl });
}

company.put('/logo', requireRole('Owner', 'Admin'), (c) => uploadBrandingImage(c, 'logo_url'));
company.put('/letterhead', requireRole('Owner', 'Admin'), (c) => uploadBrandingImage(c, 'letterhead_url'));

company.patch('/settings', requireRole('Owner', 'Admin'), async (c) => {
  const { companyId } = c.get('auth');
  const body = await c.req.json<{
    sst_enabled?: boolean;
    sst_rate?: number;
    discount_enabled?: boolean;
    discount_type?: 'percentage' | 'fixed';
    discount_value?: number;
    default_min_stock?: number;
  }>();

  if (body.discount_type && !['percentage', 'fixed'].includes(body.discount_type)) {
    return err(c, 400, 'discount_type must be percentage or fixed');
  }

  const fieldMap: Record<string, unknown> = {
    sst_enabled: body.sst_enabled === undefined ? undefined : body.sst_enabled ? 1 : 0,
    sst_rate: body.sst_rate,
    discount_enabled: body.discount_enabled === undefined ? undefined : body.discount_enabled ? 1 : 0,
    discount_type: body.discount_type,
    discount_value: body.discount_value,
    default_min_stock: body.default_min_stock,
  };
  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map(([f]) => `${f} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await c.env.DB.prepare(`UPDATE companies SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, companyId)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId).first();
  return ok(c, row);
});

export { company };

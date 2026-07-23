import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { newId } from '../utils/id';
import { ok, err } from '../utils/response';

const inventory = new Hono<AppEnv>();

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

inventory.get('/', requireAuth, async (c) => {
  const { companyId } = c.get('auth');
  const search = c.req.query('search');

  let query = c.env.DB.prepare(
    'SELECT id, name, sku, stock_qty, min_stock, sell_price FROM inventory WHERE company_id = ? ORDER BY name'
  ).bind(companyId);

  if (search) {
    const like = `%${search}%`;
    query = c.env.DB.prepare(
      'SELECT id, name, sku, stock_qty, min_stock, sell_price FROM inventory WHERE company_id = ? AND (name LIKE ? OR sku LIKE ?) ORDER BY name'
    ).bind(companyId, like, like);
  }

  const { results } = await query.all<{ stock_qty: number; min_stock: number }>();
  const data = results.map((item) => ({ ...item, low_stock: item.stock_qty <= item.min_stock }));
  return ok(c, data);
});

inventory.post('/', requireAuth, async (c) => {
  const { companyId } = c.get('auth');
  const body = await c.req.json<{
    name?: string;
    sku?: string;
    stock_qty?: number;
    min_stock?: number;
    buy_price?: number;
    sell_price?: number;
  }>();

  if (!body.name || body.sell_price === undefined) {
    return err(c, 400, 'name and sell_price are required');
  }

  const id = newId('inv');
  await c.env.DB.prepare(
    `INSERT INTO inventory (id, company_id, name, sku, stock_qty, min_stock, buy_price, sell_price)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      companyId,
      body.name,
      body.sku ?? null,
      body.stock_qty ?? 0,
      body.min_stock ?? 0,
      body.buy_price ?? null,
      body.sell_price
    )
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM inventory WHERE id = ?').bind(id).first();
  return ok(c, row, 201);
});

inventory.get('/:id', requireAuth, async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM inventory WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first<{ stock_qty: number; min_stock: number; image_url: string | null }>();
  if (!row) return err(c, 404, 'Item not found');
  return ok(c, {
    ...row,
    low_stock: row.stock_qty <= row.min_stock,
    image_url: row.image_url ? `/api/inventory/${id}/image` : null,
  });
});

inventory.patch('/:id', requireAuth, async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    sku?: string;
    min_stock?: number;
    buy_price?: number;
    sell_price?: number;
  }>();

  const existing = await c.env.DB.prepare('SELECT id FROM inventory WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!existing) return err(c, 404, 'Item not found');

  const fieldMap: Record<string, unknown> = {
    name: body.name,
    sku: body.sku,
    min_stock: body.min_stock,
    buy_price: body.buy_price,
    sell_price: body.sell_price,
  };
  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined);
  if (updates.length === 0) return err(c, 400, 'No fields to update');

  const setClause = updates.map(([f]) => `${f} = ?`).join(', ');
  const values = updates.map(([, v]) => v);

  await c.env.DB.prepare(`UPDATE inventory SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, id)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM inventory WHERE id = ?').bind(id).first();
  return ok(c, row);
});

inventory.post('/:id/adjust-stock', requireAuth, async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const { delta } = await c.req.json<{ delta?: number }>();

  if (delta === undefined || !Number.isInteger(delta)) return err(c, 400, 'delta (integer) is required');

  const row = await c.env.DB.prepare('SELECT stock_qty FROM inventory WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first<{ stock_qty: number }>();
  if (!row) return err(c, 404, 'Item not found');

  const newQty = row.stock_qty + delta;
  if (newQty < 0) return err(c, 400, 'Adjustment would result in negative stock');

  await c.env.DB.prepare("UPDATE inventory SET stock_qty = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(newQty, id)
    .run();

  return ok(c, { id, stock_qty: newQty });
});

inventory.put('/:id/image', requireAuth, async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare('SELECT id FROM inventory WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!existing) return err(c, 404, 'Item not found');

  const contentType = c.req.header('Content-Type') ?? '';
  const ext = ALLOWED_IMAGE_TYPES[contentType];
  if (!ext) return err(c, 400, 'Content-Type must be image/png, image/jpeg or image/webp');

  const body = await c.req.arrayBuffer();
  const key = `inventory/${id}/${Date.now()}.${ext}`;
  await c.env.IMAGES.put(key, body, { httpMetadata: { contentType } });

  const imageUrl = `/api/inventory/${id}/image`;
  await c.env.DB.prepare("UPDATE inventory SET image_url = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(key, id)
    .run();

  return ok(c, { id, image_url: imageUrl });
});

inventory.get('/:id/image', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT image_url FROM inventory WHERE id = ?')
    .bind(id)
    .first<{ image_url: string | null }>();
  if (!row?.image_url) return err(c, 404, 'No image');

  const object = await c.env.IMAGES.get(row.image_url);
  if (!object) return err(c, 404, 'No image');

  return new Response(object.body, {
    headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
  });
});

export { inventory };

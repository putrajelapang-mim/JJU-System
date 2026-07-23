import { newId } from '../utils/id';

export interface ServiceInput {
  service_id: string;
}
export interface PartInput {
  inventory_id?: string;
  is_manual_item?: boolean;
  manual_item_name?: string;
  price?: number;
  qty?: number;
}
export interface CreateJobInput {
  customer_id: string;
  car_id: string;
  booking_id?: string | null;
  services?: ServiceInput[];
  parts?: PartInput[];
  payment_method?: 'cash' | 'card' | 'split' | null;
  apply_discount?: boolean;
}

export type CreateJobResult =
  | { ok: true; job: Record<string, unknown> }
  | { ok: false; status: 400 | 404; message: string };

export async function createJob(
  db: D1Database,
  companyId: string,
  staffId: string,
  input: CreateJobInput
): Promise<CreateJobResult> {
  const { customer_id, car_id } = input;

  const car = await db
    .prepare(
      `SELECT cars.id FROM cars JOIN customers ON customers.id = cars.customer_id
       WHERE cars.id = ? AND cars.customer_id = ? AND customers.company_id = ?`
    )
    .bind(car_id, customer_id, companyId)
    .first();
  if (!car) return { ok: false, status: 400, message: 'car_id does not belong to customer_id for this company' };

  const company = await db
    .prepare(
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
  if (!company) return { ok: false, status: 404, message: 'Company not found' };

  const serviceLines: Array<{ service_id: string; price: number }> = [];
  for (const s of input.services ?? []) {
    if (!s.service_id) return { ok: false, status: 400, message: 'Each service requires service_id' };
    const svc = await db
      .prepare('SELECT id, price FROM services WHERE id = ? AND company_id = ?')
      .bind(s.service_id, companyId)
      .first<{ id: string; price: number }>();
    if (!svc) return { ok: false, status: 400, message: `Service ${s.service_id} not found` };
    serviceLines.push({ service_id: svc.id, price: svc.price });
  }

  const partLines: Array<{
    inventory_id: string | null;
    qty: number;
    price: number;
    is_manual_item: boolean;
    manual_item_name: string | null;
  }> = [];
  const stockDeductions: Array<{ inventory_id: string; qty: number }> = [];

  for (const p of input.parts ?? []) {
    const qty = p.qty ?? 1;
    if (qty <= 0) return { ok: false, status: 400, message: 'Part qty must be positive' };

    if (p.is_manual_item) {
      if (!p.manual_item_name || p.price === undefined) {
        return { ok: false, status: 400, message: 'Manual items require manual_item_name and price' };
      }
      partLines.push({
        inventory_id: null,
        qty,
        price: p.price,
        is_manual_item: true,
        manual_item_name: p.manual_item_name,
      });
    } else {
      if (!p.inventory_id) return { ok: false, status: 400, message: 'Each part requires inventory_id or is_manual_item' };
      const item = await db
        .prepare('SELECT id, stock_qty, sell_price, name FROM inventory WHERE id = ? AND company_id = ?')
        .bind(p.inventory_id, companyId)
        .first<{ id: string; stock_qty: number; sell_price: number; name: string }>();
      if (!item) return { ok: false, status: 400, message: `Inventory item ${p.inventory_id} not found` };
      if (item.stock_qty < qty) return { ok: false, status: 400, message: `Insufficient stock for ${item.name}` };

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
    serviceLines.reduce((sum, s) => sum + s.price, 0) + partLines.reduce((sum, p) => sum + p.price * p.qty, 0);

  let discountAmount = 0;
  const applyDiscount = input.apply_discount ?? true;
  if (company.discount_enabled && applyDiscount && company.discount_type && company.discount_value) {
    discountAmount =
      company.discount_type === 'percentage' ? subtotal * (company.discount_value / 100) : company.discount_value;
    discountAmount = Math.min(discountAmount, subtotal);
  }

  const taxable = subtotal - discountAmount;
  const sstAmount = company.sst_enabled ? taxable * (company.sst_rate / 100) : 0;
  const total = taxable + sstAmount;

  const jobId = newId('job');
  const statements = [
    db
      .prepare(
        `INSERT INTO jobs (id, company_id, customer_id, car_id, staff_id, booking_id, subtotal, discount_amount, sst_amount, total, payment_method)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        jobId,
        companyId,
        customer_id,
        car_id,
        staffId,
        input.booking_id ?? null,
        subtotal,
        discountAmount,
        sstAmount,
        total,
        input.payment_method ?? null
      ),
  ];

  for (const s of serviceLines) {
    statements.push(
      db
        .prepare('INSERT INTO job_services (id, job_id, service_id, price) VALUES (?, ?, ?, ?)')
        .bind(newId('jsvc'), jobId, s.service_id, s.price)
    );
  }
  for (const p of partLines) {
    statements.push(
      db
        .prepare(
          `INSERT INTO job_parts (id, job_id, inventory_id, qty, price, is_manual_item, manual_item_name)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(newId('jpart'), jobId, p.inventory_id, p.qty, p.price, p.is_manual_item ? 1 : 0, p.manual_item_name)
    );
  }
  for (const d of stockDeductions) {
    statements.push(
      db
        .prepare("UPDATE inventory SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?")
        .bind(d.qty, d.inventory_id)
    );
  }
  if (input.booking_id) {
    statements.push(
      db
        .prepare("UPDATE bookings SET status = 'converted' WHERE id = ? AND company_id = ?")
        .bind(input.booking_id, companyId)
    );
  }

  await db.batch(statements);

  return {
    ok: true,
    job: {
      id: jobId,
      status: 'dalam_kerja',
      subtotal,
      discount_amount: discountAmount,
      sst_amount: sstAmount,
      total,
      services: serviceLines,
      parts: partLines,
    },
  };
}

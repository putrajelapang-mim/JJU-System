import { generateDocumentPdf, type DocLineItem } from './generateDocumentPdf';

export type BuildResult = { ok: true; bytes: Uint8Array } | { ok: false; status: 404; message: string };

export async function buildJobDocumentPdf(
  db: D1Database,
  companyId: string,
  jobId: string,
  docType: 'quotation' | 'invoice' | 'resit',
  docNumber: string,
  validUntil: string | null
): Promise<BuildResult> {
  const job = await db
    .prepare(
      `SELECT jobs.*, cars.plate_no, cars.model, customers.name as customer_name, customers.phone as customer_phone
       FROM jobs
       JOIN cars ON cars.id = jobs.car_id
       JOIN customers ON customers.id = jobs.customer_id
       WHERE jobs.id = ? AND jobs.company_id = ?`
    )
    .bind(jobId, companyId)
    .first<{
      subtotal: number;
      discount_amount: number;
      sst_amount: number;
      total: number;
      payment_method: string | null;
      payment_status: string | null;
      created_at: string;
      plate_no: string;
      model: string | null;
      customer_name: string;
      customer_phone: string | null;
    }>();
  if (!job) return { ok: false, status: 404, message: 'Job not found' };

  const company = await db
    .prepare('SELECT name, address, phone, logo_url, sst_enabled, sst_rate FROM companies WHERE id = ?')
    .bind(companyId)
    .first<{
      name: string;
      address: string | null;
      phone: string | null;
      logo_url: string | null;
      sst_enabled: number;
      sst_rate: number;
    }>();
  if (!company) return { ok: false, status: 404, message: 'Company not found' };

  const { results: serviceLines } = await db
    .prepare(
      `SELECT services.name, job_services.price
       FROM job_services JOIN services ON services.id = job_services.service_id
       WHERE job_services.job_id = ?`
    )
    .bind(jobId)
    .all<{ name: string; price: number }>();

  const { results: partLines } = await db
    .prepare(
      `SELECT job_parts.qty, job_parts.price, job_parts.manual_item_name, inventory.name as inventory_name
       FROM job_parts LEFT JOIN inventory ON inventory.id = job_parts.inventory_id
       WHERE job_parts.job_id = ?`
    )
    .bind(jobId)
    .all<{ qty: number; price: number; manual_item_name: string | null; inventory_name: string | null }>();

  const items: DocLineItem[] = [
    ...serviceLines.map((s) => ({ name: s.name, qty: 1, price: s.price })),
    ...partLines.map((p) => ({ name: p.manual_item_name ?? p.inventory_name ?? 'Item', qty: p.qty, price: p.price })),
  ];

  const bytes = await generateDocumentPdf({
    docType,
    docNumber,
    company: { name: company.name, address: company.address, phone: company.phone, logoDataUrl: company.logo_url },
    customer: { name: job.customer_name, phone: job.customer_phone },
    car: { plate_no: job.plate_no, model: job.model },
    items,
    subtotal: job.subtotal,
    discountAmount: job.discount_amount,
    sstEnabled: !!company.sst_enabled,
    sstRate: company.sst_rate,
    sstAmount: job.sst_amount,
    total: job.total,
    paymentMethod: job.payment_method,
    paymentStatus: job.payment_status,
    createdAt: job.created_at,
    validUntil: validUntil ?? undefined,
  });

  return { ok: true, bytes };
}

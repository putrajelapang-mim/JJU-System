import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { newId } from '../utils/id';
import { nextDocNumber } from '../lib/docNumber';
import { generateDocumentPdf, type DocLineItem } from '../lib/pdf/generateDocumentPdf';
import { ok, err } from '../utils/response';

const documents = new Hono<AppEnv>();

documents.use('*', requireAuth);

const VALID_DOC_TYPES = ['quotation', 'invoice', 'resit'];

documents.post('/', async (c) => {
  const { companyId } = c.get('auth');
  const body = await c.req.json<{ job_id?: string; doc_type?: string; valid_until?: string }>();

  if (!body.job_id || !body.doc_type || !VALID_DOC_TYPES.includes(body.doc_type)) {
    return err(c, 400, `job_id and doc_type (one of ${VALID_DOC_TYPES.join(', ')}) are required`);
  }
  const docType = body.doc_type as 'quotation' | 'invoice' | 'resit';

  const job = await c.env.DB.prepare(
    `SELECT jobs.*, cars.plate_no, cars.model, customers.name as customer_name, customers.phone as customer_phone
     FROM jobs
     JOIN cars ON cars.id = jobs.car_id
     JOIN customers ON customers.id = jobs.customer_id
     WHERE jobs.id = ? AND jobs.company_id = ?`
  )
    .bind(body.job_id, companyId)
    .first<{
      id: string;
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
  if (!job) return err(c, 404, 'Job not found');

  const company = await c.env.DB.prepare(
    'SELECT name, address, phone, logo_url, sst_enabled, sst_rate FROM companies WHERE id = ?'
  )
    .bind(companyId)
    .first<{
      name: string;
      address: string | null;
      phone: string | null;
      logo_url: string | null;
      sst_enabled: number;
      sst_rate: number;
    }>();
  if (!company) return err(c, 404, 'Company not found');

  const { results: serviceLines } = await c.env.DB.prepare(
    `SELECT services.name, job_services.price
     FROM job_services JOIN services ON services.id = job_services.service_id
     WHERE job_services.job_id = ?`
  )
    .bind(body.job_id)
    .all<{ name: string; price: number }>();

  const { results: partLines } = await c.env.DB.prepare(
    `SELECT job_parts.qty, job_parts.price, job_parts.manual_item_name, inventory.name as inventory_name
     FROM job_parts LEFT JOIN inventory ON inventory.id = job_parts.inventory_id
     WHERE job_parts.job_id = ?`
  )
    .bind(body.job_id)
    .all<{ qty: number; price: number; manual_item_name: string | null; inventory_name: string | null }>();

  const items: DocLineItem[] = [
    ...serviceLines.map((s) => ({ name: s.name, qty: 1, price: s.price })),
    ...partLines.map((p) => ({ name: p.manual_item_name ?? p.inventory_name ?? 'Item', qty: p.qty, price: p.price })),
  ];

  const docNumber = await nextDocNumber(c.env.DB, companyId, docType);

  const pdfBytes = await generateDocumentPdf(c.env, {
    docType,
    docNumber,
    company: { name: company.name, address: company.address, phone: company.phone, logoKey: company.logo_url },
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
    validUntil: body.valid_until,
  });

  const docId = newId('doc');
  const r2Key = `documents/${companyId}/${docId}.pdf`;
  await c.env.DOCS.put(r2Key, pdfBytes, { httpMetadata: { contentType: 'application/pdf' } });

  await c.env.DB.prepare(
    'INSERT INTO documents (id, company_id, job_id, doc_type, doc_number, pdf_url) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(docId, companyId, body.job_id, docType, docNumber, r2Key)
    .run();

  return ok(c, { id: docId, doc_type: docType, doc_number: docNumber, pdf_url: `/api/documents/${docId}/pdf` }, 201);
});

documents.get('/', async (c) => {
  const { companyId } = c.get('auth');
  const docType = c.req.query('doc_type');
  const jobId = c.req.query('job_id');

  const conditions = ['company_id = ?'];
  const params: unknown[] = [companyId];
  if (docType) {
    conditions.push('doc_type = ?');
    params.push(docType);
  }
  if (jobId) {
    conditions.push('job_id = ?');
    params.push(jobId);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT id, job_id, doc_type, doc_number, created_at FROM documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`
  )
    .bind(...params)
    .all();

  return ok(
    c,
    (results as Array<{ id: string }>).map((d) => ({ ...d, pdf_url: `/api/documents/${d.id}/pdf` }))
  );
});

documents.get('/:id', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first();
  if (!row) return err(c, 404, 'Document not found');
  return ok(c, { ...row, pdf_url: `/api/documents/${id}/pdf` });
});

documents.get('/:id/pdf', async (c) => {
  const { companyId } = c.get('auth');
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT pdf_url, doc_number FROM documents WHERE id = ? AND company_id = ?')
    .bind(id, companyId)
    .first<{ pdf_url: string; doc_number: string }>();
  if (!row) return err(c, 404, 'Document not found');

  const object = await c.env.DOCS.get(row.pdf_url);
  if (!object) return err(c, 404, 'PDF not found in storage');

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${row.doc_number}.pdf"`,
    },
  });
});

export { documents };

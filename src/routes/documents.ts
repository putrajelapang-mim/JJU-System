import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { newId } from '../utils/id';
import { nextDocNumber } from '../lib/docNumber';
import { buildJobDocumentPdf } from '../lib/pdf/buildJobDocumentPdf';
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

  const job = await c.env.DB.prepare('SELECT id FROM jobs WHERE id = ? AND company_id = ?')
    .bind(body.job_id, companyId)
    .first();
  if (!job) return err(c, 404, 'Job not found');

  const docNumber = await nextDocNumber(c.env.DB, companyId, docType);
  const docId = newId('doc');

  await c.env.DB.prepare(
    'INSERT INTO documents (id, company_id, job_id, doc_type, doc_number, valid_until) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(docId, companyId, body.job_id, docType, docNumber, body.valid_until ?? null)
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
  const row = await c.env.DB.prepare(
    'SELECT job_id, doc_type, doc_number, valid_until FROM documents WHERE id = ? AND company_id = ?'
  )
    .bind(id, companyId)
    .first<{ job_id: string; doc_type: 'quotation' | 'invoice' | 'resit'; doc_number: string; valid_until: string | null }>();
  if (!row) return err(c, 404, 'Document not found');

  const result = await buildJobDocumentPdf(c.env.DB, companyId, row.job_id, row.doc_type, row.doc_number, row.valid_until);
  if (!result.ok) return err(c, result.status, result.message);

  return new Response(result.bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${row.doc_number}.pdf"`,
    },
  });
});

export { documents };

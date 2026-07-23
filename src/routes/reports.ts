import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  getSalesReport,
  getInventoryReport,
  getLowStockReport,
  getPnlReport,
  getCashflowReport,
  getCustomerListReport,
  getJobHistoryReport,
  getDailyClosingReport,
} from '../lib/reports/queries';
import type { ReportResult } from '../lib/reports/types';
import { generateReportPdf } from '../lib/pdf/generateReportPdf';
import { toCsv } from '../lib/reports/csv';
import { ok, err } from '../utils/response';

const reports = new Hono<AppEnv>();

reports.use('*', requireAuth, requireRole('Owner', 'Admin'));

const REPORT_TYPES = ['sales', 'inventory', 'low-stock', 'pnl', 'cashflow', 'customers', 'jobs', 'daily-closing'];

async function buildReport(
  db: D1Database,
  companyId: string,
  type: string,
  query: URLSearchParams
): Promise<ReportResult | null> {
  const from = query.get('from') ?? undefined;
  const to = query.get('to') ?? undefined;

  switch (type) {
    case 'sales':
      return getSalesReport(db, companyId, from, to);
    case 'inventory':
      return getInventoryReport(db, companyId);
    case 'low-stock':
      return getLowStockReport(db, companyId);
    case 'pnl':
      return getPnlReport(db, companyId, from, to);
    case 'cashflow':
      return getCashflowReport(db, companyId, from, to);
    case 'customers':
      return getCustomerListReport(db, companyId);
    case 'jobs':
      return getJobHistoryReport(db, companyId, from, to, query.get('status') ?? undefined);
    case 'daily-closing':
      return getDailyClosingReport(db, companyId, query.get('date') ?? undefined);
    default:
      return null;
  }
}

reports.get('/:type', async (c) => {
  const { companyId } = c.get('auth');
  const type = c.req.param('type');
  if (!REPORT_TYPES.includes(type)) return err(c, 400, `Unknown report type. Valid: ${REPORT_TYPES.join(', ')}`);

  const url = new URL(c.req.url);
  const report = await buildReport(c.env.DB, companyId, type, url.searchParams);
  return ok(c, report);
});

reports.get('/:type/pdf', async (c) => {
  const { companyId } = c.get('auth');
  const type = c.req.param('type');
  if (!REPORT_TYPES.includes(type)) return err(c, 400, `Unknown report type. Valid: ${REPORT_TYPES.join(', ')}`);

  const url = new URL(c.req.url);
  const report = await buildReport(c.env.DB, companyId, type, url.searchParams);
  if (!report) return err(c, 400, 'Unable to build report');

  const pdfBytes = await generateReportPdf(report);
  return new Response(pdfBytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${type}-report.pdf"`,
    },
  });
});

reports.get('/:type/csv', async (c) => {
  const { companyId } = c.get('auth');
  const type = c.req.param('type');
  if (!REPORT_TYPES.includes(type)) return err(c, 400, `Unknown report type. Valid: ${REPORT_TYPES.join(', ')}`);

  const url = new URL(c.req.url);
  const report = await buildReport(c.env.DB, companyId, type, url.searchParams);
  if (!report) return err(c, 400, 'Unable to build report');

  const csv = toCsv(report);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}-report.csv"`,
    },
  });
});

reports.post('/:type/whatsapp', async (c) => {
  const type = c.req.param('type');
  if (!REPORT_TYPES.includes(type)) return err(c, 400, `Unknown report type. Valid: ${REPORT_TYPES.join(', ')}`);

  const { phone } = await c.req.json<{ phone?: string }>().catch(() => ({ phone: undefined }));
  if (!phone) return err(c, 400, 'phone is required');

  // TODO: wire up actual WhatsApp send (WhatsApp Cloud API / provider) once
  // credentials are available — generate the PDF via generateReportPdf and
  // send it as a document attachment to `phone`.
  return ok(c, { queued: true, phone });
});

export { reports };

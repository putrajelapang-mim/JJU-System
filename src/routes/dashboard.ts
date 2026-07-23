import { Hono } from 'hono';
import type { AppEnv } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { ok } from '../utils/response';

const dashboard = new Hono<AppEnv>();

dashboard.use('*', requireAuth);

dashboard.get('/', async (c) => {
  const { companyId } = c.get('auth');
  const db = c.env.DB;

  const [salesToday, jobsInProgress, jobsReady, lowStockCount, lowStockItems, jobsReadyNotNotified, company, serviceCount, staffCount, inventoryCount] =
    await Promise.all([
      db
        .prepare("SELECT COALESCE(SUM(total), 0) as total FROM jobs WHERE company_id = ? AND date(created_at) = date('now')")
        .bind(companyId)
        .first<{ total: number }>(),
      db.prepare("SELECT COUNT(*) as count FROM jobs WHERE company_id = ? AND status = 'dalam_kerja'").bind(companyId).first<{ count: number }>(),
      db.prepare("SELECT COUNT(*) as count FROM jobs WHERE company_id = ? AND status = 'siap'").bind(companyId).first<{ count: number }>(),
      db.prepare('SELECT COUNT(*) as count FROM inventory WHERE company_id = ? AND stock_qty <= min_stock').bind(companyId).first<{ count: number }>(),
      db
        .prepare('SELECT id, name, stock_qty, min_stock FROM inventory WHERE company_id = ? AND stock_qty <= min_stock ORDER BY stock_qty LIMIT 10')
        .bind(companyId)
        .all(),
      db
        .prepare(
          `SELECT jobs.id, cars.plate_no, customers.name as customer_name
           FROM jobs JOIN cars ON cars.id = jobs.car_id JOIN customers ON customers.id = jobs.customer_id
           WHERE jobs.company_id = ? AND jobs.status = 'siap' AND jobs.notified_wa = 0
           ORDER BY jobs.created_at LIMIT 10`
        )
        .bind(companyId)
        .all(),
      db.prepare('SELECT logo_url FROM companies WHERE id = ?').bind(companyId).first<{ logo_url: string | null }>(),
      db.prepare('SELECT COUNT(*) as count FROM services WHERE company_id = ?').bind(companyId).first<{ count: number }>(),
      db.prepare('SELECT COUNT(*) as count FROM staff WHERE company_id = ?').bind(companyId).first<{ count: number }>(),
      db.prepare('SELECT COUNT(*) as count FROM inventory WHERE company_id = ?').bind(companyId).first<{ count: number }>(),
    ]);

  return ok(c, {
    sales_today: salesToday?.total ?? 0,
    jobs_in_progress: jobsInProgress?.count ?? 0,
    jobs_ready: jobsReady?.count ?? 0,
    low_stock_count: lowStockCount?.count ?? 0,
    notifications: {
      low_stock_items: lowStockItems.results,
      jobs_ready_not_notified: jobsReadyNotNotified.results,
    },
    setup_checklist: {
      logo: !!company?.logo_url,
      service_menu: (serviceCount?.count ?? 0) > 0,
      staff: (staffCount?.count ?? 0) > 1,
      inventory: (inventoryCount?.count ?? 0) > 0,
    },
  });
});

export { dashboard };

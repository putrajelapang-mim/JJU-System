import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './middleware/auth';
import { auth } from './routes/auth';
import { company } from './routes/company';
import { staff } from './routes/staff';
import { customers } from './routes/customers';
import { inventory } from './routes/inventory';
import { services } from './routes/services';
import { jobs } from './routes/jobs';
import { bookings } from './routes/bookings';
import { documents } from './routes/documents';
import { reports } from './routes/reports';

const app = new Hono<AppEnv>();

app.use('*', cors());

app.get('/api/health', (c) => c.json({ ok: true, service: 'jju-workshop-system' }));

app.route('/api/auth', auth);
app.route('/api/company', company);
app.route('/api/staff', staff);
app.route('/api/customers', customers);
app.route('/api/inventory', inventory);
app.route('/api/services', services);
app.route('/api/jobs', jobs);
app.route('/api/bookings', bookings);
app.route('/api/documents', documents);
app.route('/api/reports', reports);

app.notFound((c) => c.json({ ok: false, error: 'Not found' }, 404));

export default app;

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './middleware/auth';
import { auth } from './routes/auth';
import { company } from './routes/company';
import { staff } from './routes/staff';

const app = new Hono<AppEnv>();

app.use('*', cors());

app.get('/api/health', (c) => c.json({ ok: true, service: 'jju-workshop-system' }));

app.route('/api/auth', auth);
app.route('/api/company', company);
app.route('/api/staff', staff);

app.notFound((c) => c.json({ ok: false, error: 'Not found' }, 404));

export default app;

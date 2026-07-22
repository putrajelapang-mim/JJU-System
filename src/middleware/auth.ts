import { MiddlewareHandler } from 'hono';
import type { AuthContext, Env } from '../types';
import { verifyAuthToken } from '../utils/jwt';
import { err } from '../utils/response';

export type AppEnv = { Bindings: Env; Variables: { auth: AuthContext } };

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return err(c, 401, 'Missing bearer token');

  try {
    const auth = await verifyAuthToken(token, c.env.JWT_SECRET);
    c.set('auth', auth);
  } catch {
    return err(c, 401, 'Invalid or expired token');
  }

  await next();
};

export function requireRole(...allowedRoles: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth');
    if (!allowedRoles.includes(auth.roleName)) {
      return err(c, 403, 'Insufficient permissions');
    }
    await next();
  };
}

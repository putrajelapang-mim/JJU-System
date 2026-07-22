import { sign, verify } from 'hono/jwt';
import type { AuthContext, JwtPayload } from '../types';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const JWT_ALG = 'HS256';

export async function signAuthToken(ctx: AuthContext, secret: string): Promise<string> {
  const payload: JwtPayload & Record<string, unknown> = {
    staff_id: ctx.staffId,
    company_id: ctx.companyId,
    role_id: ctx.roleId,
    role_name: ctx.roleName,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  return sign(payload, secret, JWT_ALG);
}

export async function verifyAuthToken(token: string, secret: string): Promise<AuthContext> {
  const payload = (await verify(token, secret, JWT_ALG)) as unknown as JwtPayload;
  return {
    staffId: payload.staff_id,
    companyId: payload.company_id,
    roleId: payload.role_id,
    roleName: payload.role_name,
  };
}

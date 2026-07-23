export interface Env {
  DB: D1Database;
  IMAGES: R2Bucket;
  DOCS: R2Bucket;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

export interface JwtPayload {
  staff_id: string;
  company_id: string;
  role_id: string;
  role_name: string;
  exp: number;
}

export interface AuthContext {
  staffId: string;
  companyId: string;
  roleId: string;
  roleName: string;
}

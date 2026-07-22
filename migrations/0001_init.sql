-- JJU Workshop System — initial schema (Cloudflare D1 / SQLite)
--
-- Follows the schema in the project spec. A few pragmatic additions were
-- needed to make auth/signup actually work and are called out inline:
--   * staff.email — signup collects an email/password for the owner login;
--     the spec's staff table had no login identifier besides phone.
--   * updated_at columns added alongside spec'd created_at where a record
--     is expected to be edited after creation (companies, inventory, jobs).

CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  logo_url TEXT,
  letterhead_url TEXT,
  sst_enabled INTEGER NOT NULL DEFAULT 0,
  sst_rate REAL NOT NULL DEFAULT 6.0,
  discount_enabled INTEGER NOT NULL DEFAULT 0,
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value REAL,
  plan TEXT NOT NULL DEFAULT 'trial',
  plan_renewal_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, name)
);
CREATE INDEX idx_roles_company ON roles(company_id);

CREATE TABLE staff (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_staff_company ON staff(company_id);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_company_phone ON customers(company_id, phone);

CREATE TABLE cars (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  plate_no TEXT NOT NULL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cars_customer ON cars(customer_id);
CREATE INDEX idx_cars_plate ON cars(plate_no);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  price REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_services_company ON services(company_id);

CREATE TABLE inventory (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  sku TEXT,
  image_url TEXT,
  stock_qty INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 0,
  buy_price REAL,
  sell_price REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_inventory_company_stock ON inventory(company_id, stock_qty);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  car_id TEXT NOT NULL REFERENCES cars(id),
  service_id TEXT REFERENCES services(id),
  booking_date TEXT NOT NULL,
  booking_time TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'converted', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_bookings_company ON bookings(company_id, booking_date);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  car_id TEXT NOT NULL REFERENCES cars(id),
  staff_id TEXT REFERENCES staff(id),
  booking_id TEXT REFERENCES bookings(id),
  status TEXT NOT NULL DEFAULT 'dalam_kerja' CHECK (status IN ('dalam_kerja', 'siap', 'dah_collect')),
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  sst_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'split')),
  payment_status TEXT NOT NULL DEFAULT 'belum_bayar' CHECK (payment_status IN ('belum_bayar', 'dah_bayar')),
  notified_wa INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX idx_jobs_company_status ON jobs(company_id, status);

CREATE TABLE job_services (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  service_id TEXT REFERENCES services(id),
  price REAL NOT NULL
);
CREATE INDEX idx_job_services_job ON job_services(job_id);

CREATE TABLE job_parts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  inventory_id TEXT REFERENCES inventory(id),
  qty INTEGER NOT NULL DEFAULT 1,
  price REAL NOT NULL,
  is_manual_item INTEGER NOT NULL DEFAULT 0,
  manual_item_name TEXT
);
CREATE INDEX idx_job_parts_job ON job_parts(job_id);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  job_id TEXT REFERENCES jobs(id),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('quotation', 'invoice', 'resit')),
  doc_number TEXT NOT NULL UNIQUE,
  pdf_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_company_type ON documents(company_id, doc_type);

CREATE TABLE doc_sequences (
  company_id TEXT NOT NULL REFERENCES companies(id),
  doc_type TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, doc_type)
);

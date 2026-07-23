-- documents.doc_number was globally UNIQUE, but doc numbering is scoped
-- per-company (doc_sequences is keyed by company_id + doc_type). Two
-- different companies each generating their first invoice would both get
-- "INV-0001" and collide on the global UNIQUE constraint. Fix: scope
-- uniqueness to (company_id, doc_number) instead.

CREATE TABLE documents_new (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  job_id TEXT REFERENCES jobs(id),
  doc_type TEXT NOT NULL CHECK (doc_type IN ('quotation', 'invoice', 'resit')),
  doc_number TEXT NOT NULL,
  pdf_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, doc_number)
);

INSERT INTO documents_new SELECT id, company_id, job_id, doc_type, doc_number, pdf_url, created_at FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX idx_documents_company_type ON documents(company_id, doc_type);

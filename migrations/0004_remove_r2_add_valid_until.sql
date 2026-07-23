-- Documents no longer cache rendered PDF bytes in R2 (removed to avoid
-- requiring an R2 subscription) — PDFs are regenerated on each download
-- from the job's stored data instead. valid_until is needed at
-- regeneration time for quotations, so it must be persisted rather than
-- passed transiently at creation.
ALTER TABLE documents ADD COLUMN valid_until TEXT;

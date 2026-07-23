-- Adds company-level default min-stock threshold (Settings > Inventory Config).
ALTER TABLE companies ADD COLUMN default_min_stock INTEGER NOT NULL DEFAULT 5;

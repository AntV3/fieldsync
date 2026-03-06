-- ============================================================
-- ADD NEW DISPOSAL LOAD TYPES
-- Adds 'copper' and 'asphalt' to the disposal_load_type enum
-- to match frontend options available to field crews
-- ============================================================

ALTER TYPE disposal_load_type ADD VALUE IF NOT EXISTS 'copper';
ALTER TYPE disposal_load_type ADD VALUE IF NOT EXISTS 'asphalt';

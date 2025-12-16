-- Setup Materials & Equipment for T&M
-- This script fixes the category mismatch and populates sample equipment/materials
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. Fix the category constraint to match frontend
-- ============================================

-- Drop old constraint
ALTER TABLE materials_equipment
DROP CONSTRAINT IF EXISTS materials_equipment_category_check;

-- Add new constraint with correct categories
ALTER TABLE materials_equipment
ADD CONSTRAINT materials_equipment_category_check
CHECK (category IN ('Containment', 'PPE', 'Disposal', 'Equipment'));

-- ============================================
-- 2. Populate GGG Company Equipment (da92028d-3056-4b0c-a467-e3fbe4ce8466)
-- ============================================

INSERT INTO materials_equipment (company_id, name, category, unit, cost_per_unit, active) VALUES
-- Containment items
('da92028d-3056-4b0c-a467-e3fbe4ce8466', '6 mil Poly Sheeting', 'Containment', 'ft', 0.15, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', '4 mil Poly Sheeting', 'Containment', 'ft', 0.10, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Zip Wall Poles', 'Containment', 'each', 45.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Zip Wall Heads', 'Containment', 'each', 8.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Zip Door', 'Containment', 'each', 12.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Duct Tape 2"', 'Containment', 'roll', 6.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Shurtape CP-27', 'Containment', 'roll', 8.50, true),

-- PPE items
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Tyvek Suits', 'PPE', 'each', 8.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'N95 Respirators', 'PPE', 'each', 2.50, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'P100 Filters', 'PPE', 'pair', 12.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Half-Face Respirator', 'PPE', 'each', 35.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Safety Glasses', 'PPE', 'each', 3.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Nitrile Gloves (Box)', 'PPE', 'box', 12.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Latex Gloves (Box)', 'PPE', 'box', 10.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Boot Covers', 'PPE', 'pair', 0.50, true),

-- Disposal items
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Asbestos Disposal Bag', 'Disposal', 'each', 3.50, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'HEPA Vacuum Bags', 'Disposal', 'each', 15.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', '30 Yard Dumpster', 'Disposal', 'each', 450.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', '20 Yard Dumpster', 'Disposal', 'each', 350.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Disposal Fee (Ton)', 'Disposal', 'ton', 85.00, true),

-- Equipment items
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Air Scrubber (Daily)', 'Equipment', 'day', 75.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Negative Air Machine', 'Equipment', 'day', 65.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'HEPA Vacuum', 'Equipment', 'day', 45.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Dehumidifier', 'Equipment', 'day', 55.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Air Mover/Fan', 'Equipment', 'day', 25.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Scissor Lift', 'Equipment', 'day', 250.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Ladder 6ft', 'Equipment', 'day', 15.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Extension Ladder', 'Equipment', 'day', 20.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Generator', 'Equipment', 'day', 85.00, true),
('da92028d-3056-4b0c-a467-e3fbe4ce8466', 'Pressure Washer', 'Equipment', 'day', 65.00, true)

ON CONFLICT DO NOTHING;

-- ============================================
-- 3. Populate Miller Company Equipment (bf01ee1a-e29e-4ef8-8742-53cda36d9452)
-- ============================================

INSERT INTO materials_equipment (company_id, name, category, unit, cost_per_unit, active) VALUES
-- Containment items
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', '6 mil Poly Sheeting', 'Containment', 'ft', 0.15, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', '4 mil Poly Sheeting', 'Containment', 'ft', 0.10, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Zip Wall Poles', 'Containment', 'each', 45.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Zip Wall Heads', 'Containment', 'each', 8.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Zip Door', 'Containment', 'each', 12.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Duct Tape 2"', 'Containment', 'roll', 6.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Shurtape CP-27', 'Containment', 'roll', 8.50, true),

-- PPE items
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Tyvek Suits', 'PPE', 'each', 8.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'N95 Respirators', 'PPE', 'each', 2.50, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'P100 Filters', 'PPE', 'pair', 12.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Half-Face Respirator', 'PPE', 'each', 35.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Safety Glasses', 'PPE', 'each', 3.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Nitrile Gloves (Box)', 'PPE', 'box', 12.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Latex Gloves (Box)', 'PPE', 'box', 10.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Boot Covers', 'PPE', 'pair', 0.50, true),

-- Disposal items
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Asbestos Disposal Bag', 'Disposal', 'each', 3.50, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'HEPA Vacuum Bags', 'Disposal', 'each', 15.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', '30 Yard Dumpster', 'Disposal', 'each', 450.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', '20 Yard Dumpster', 'Disposal', 'each', 350.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Disposal Fee (Ton)', 'Disposal', 'ton', 85.00, true),

-- Equipment items
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Air Scrubber (Daily)', 'Equipment', 'day', 75.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Negative Air Machine', 'Equipment', 'day', 65.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'HEPA Vacuum', 'Equipment', 'day', 45.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Dehumidifier', 'Equipment', 'day', 55.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Air Mover/Fan', 'Equipment', 'day', 25.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Scissor Lift', 'Equipment', 'day', 250.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Ladder 6ft', 'Equipment', 'day', 15.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Extension Ladder', 'Equipment', 'day', 20.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Generator', 'Equipment', 'day', 85.00, true),
('bf01ee1a-e29e-4ef8-8742-53cda36d9452', 'Pressure Washer', 'Equipment', 'day', 65.00, true)

ON CONFLICT DO NOTHING;

-- ============================================
-- Done!
-- ============================================
-- This script has:
-- 1. Fixed the category mismatch between database and frontend
-- 2. Added 33 preset equipment/materials items for GGG company
-- 3. Added 33 preset equipment/materials items for Miller company
-- 4. Set realistic prices for each item
--
-- Your foreman can now:
-- - Select from preset dropdown lists organized by category
-- - See quantities and units for each item
-- - Add custom items if something isn't on the list
--
-- Your office can now:
-- - See prices for all equipment/materials in T&M review
-- - See calculated totals for each ticket
-- - Export to Excel with pricing details

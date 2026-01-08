-- =====================================================
-- Migration: Labor Categories and Classes - Cleanup
-- Date: 2026-01-08
-- Purpose: Clean up soft-deleted records, transition to hard deletes
-- =====================================================

-- Clean up soft-deleted labor classes (CASCADE will remove rates)
DELETE FROM labor_classes WHERE active = false;

-- Clean up soft-deleted labor categories
DELETE FROM labor_categories WHERE active = false;

-- =====================================================
-- VERIFICATION - Check results
-- =====================================================

-- Should return 0 rows if cleanup was successful
SELECT 'Remaining soft-deleted categories:' as check_type, COUNT(*) as count
FROM labor_categories WHERE active = false
UNION ALL
SELECT 'Remaining soft-deleted classes:' as check_type, COUNT(*) as count
FROM labor_classes WHERE active = false;

-- Check for any duplicate names (should return 0 rows)
SELECT 'Duplicate category names:' as check_type, COUNT(*) as count
FROM (
  SELECT company_id, name, COUNT(*) as cnt
  FROM labor_categories
  GROUP BY company_id, name
  HAVING COUNT(*) > 1
) duplicates
UNION ALL
SELECT 'Duplicate class names:' as check_type, COUNT(*) as count
FROM (
  SELECT company_id, name, COUNT(*) as cnt
  FROM labor_classes
  GROUP BY company_id, name
  HAVING COUNT(*) > 1
) duplicates;

-- Migration: Labor Categories and Classes - Cleanup and Hard Delete
-- Date: 2026-01-08
-- Purpose: Clean up soft-deleted records and transition to hard deletes

-- =====================================================
-- CONTEXT
-- =====================================================
-- Previous implementation used soft deletes (active=false)
-- This prevented reusing category/class names after deletion
-- Changed to hard deletes to allow name reuse
-- Database schema already has CASCADE DELETE configured

-- =====================================================
-- 1. Clean up existing soft-deleted records
-- =====================================================

-- Delete soft-deleted labor class rates (via cascade from classes)
-- These will be removed automatically when we delete the classes

-- Delete soft-deleted labor classes
DELETE FROM labor_classes WHERE active = false;

-- Delete soft-deleted labor categories
DELETE FROM labor_categories WHERE active = false;

-- =====================================================
-- 2. Remove active column (no longer needed)
-- =====================================================
-- Note: We're keeping the active column for now for backward compatibility
-- and in case filtering is needed in the future
-- Just documenting that it's no longer used for soft deletes

-- =====================================================
-- 3. Verify CASCADE DELETE is configured correctly
-- =====================================================

-- labor_categories has ON DELETE CASCADE from companies (already configured)
-- labor_classes has ON DELETE SET NULL from labor_categories (allows orphaned classes)
-- labor_classes has ON DELETE CASCADE from companies (already configured)
-- labor_class_rates has ON DELETE CASCADE from labor_classes (already configured)
-- t_and_m_workers.labor_class_id has ON DELETE SET NULL (preserves historical data)

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check for any remaining soft-deleted records
-- SELECT company_id, name, active FROM labor_categories WHERE active = false;
-- SELECT company_id, name, active FROM labor_classes WHERE active = false;

-- Verify unique constraints still work
-- SELECT company_id, name, COUNT(*) FROM labor_categories GROUP BY company_id, name HAVING COUNT(*) > 1;
-- SELECT company_id, name, COUNT(*) FROM labor_classes GROUP BY company_id, name HAVING COUNT(*) > 1;

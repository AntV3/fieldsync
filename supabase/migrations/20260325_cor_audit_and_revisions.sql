-- ============================================
-- COR Audit Trail & Revision Tracking Migration
-- ============================================
-- This migration adds:
-- 1. cor_status_history table for full audit trail of every status change
-- 2. submitted_by and revision_number columns to change_orders
-- 3. Auto-increment revision on resubmission after rejection
--
-- Run this in your Supabase SQL Editor.
-- ============================================

-- ============================================
-- 1. STATUS HISTORY / AUDIT TRAIL TABLE
-- ============================================
-- Every status transition is recorded permanently for dispute resolution,
-- compliance, and professional accountability.
CREATE TABLE IF NOT EXISTS cor_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cor_status_history_cor ON cor_status_history(change_order_id);
CREATE INDEX IF NOT EXISTS idx_cor_status_history_date ON cor_status_history(changed_at);

-- Enable RLS
ALTER TABLE cor_status_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view status history for their company's CORs
DROP POLICY IF EXISTS "Users can view their company COR status history" ON cor_status_history;
CREATE POLICY "Users can view their company COR status history"
ON cor_status_history FOR SELECT
TO authenticated
USING (
  change_order_id IN (
    SELECT id FROM change_orders
    WHERE company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid()
    )
  )
);

-- Authenticated users can insert status history for their company's CORs
DROP POLICY IF EXISTS "Users can log status changes for their company CORs" ON cor_status_history;
CREATE POLICY "Users can log status changes for their company CORs"
ON cor_status_history FOR INSERT
TO authenticated
WITH CHECK (
  change_order_id IN (
    SELECT id FROM change_orders
    WHERE company_id IN (
      SELECT company_id FROM user_companies
      WHERE user_id = auth.uid()
    )
  )
);

-- Field users (anon/PIN-authenticated) can insert status history entries
-- (for ticket assignment status logging from field)
DROP POLICY IF EXISTS "Field users can log COR status changes" ON cor_status_history;
CREATE POLICY "Field users can log COR status changes"
ON cor_status_history FOR INSERT
TO anon
WITH CHECK (true);

-- ============================================
-- 2. ADD SUBMITTED_BY AND REVISION TRACKING
-- ============================================
-- submitted_by tracks who submitted for approval (for separation of duties checks)
-- revision_number tracks how many times a COR has been reworked after rejection
ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE change_orders
ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;

-- ============================================
-- 3. AUTO-INCREMENT REVISION ON RESUBMISSION
-- ============================================
-- When a COR transitions from 'rejected' to 'pending_approval',
-- automatically increment the revision number.
CREATE OR REPLACE FUNCTION trigger_increment_cor_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'rejected' AND NEW.status = 'pending_approval' THEN
    NEW.revision_number := COALESCE(OLD.revision_number, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_cor_revision ON change_orders;
CREATE TRIGGER trg_increment_cor_revision
BEFORE UPDATE ON change_orders
FOR EACH ROW EXECUTE FUNCTION trigger_increment_cor_revision();

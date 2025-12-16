-- Fix RLS policy for company_branding to allow INSERT operations
-- Run this in your Supabase SQL Editor
-- Safe to run multiple times

-- Drop all existing policies for company_branding (except SELECT policies)
DROP POLICY IF EXISTS "Company admins can update branding" ON company_branding;
DROP POLICY IF EXISTS "Company admins can insert branding" ON company_branding;
DROP POLICY IF EXISTS "Company admins can delete branding" ON company_branding;

-- Create new policies with proper INSERT support

-- Policy for INSERT: Company admins can create branding for their company
CREATE POLICY "Company admins can insert branding" ON company_branding
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  );

-- Policy for UPDATE: Company admins can update their company's branding
CREATE POLICY "Company admins can update branding" ON company_branding
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  );

-- Policy for DELETE: Company admins can delete their company's branding
CREATE POLICY "Company admins can delete branding" ON company_branding
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.company_id = company_branding.company_id
      AND users.id = auth.uid()
      AND users.role IN ('admin', 'office')
    )
  );

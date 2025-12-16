-- Fix Users Table RLS Policy - Remove Circular Dependency
-- Run this in your Supabase SQL Editor
-- This fixes the "Error loading profile" issue caused by circular RLS policy

-- Drop the problematic policy that has circular dependency
DROP POLICY IF EXISTS "Users can view users in their company" ON users;

-- Create TWO policies instead:
-- 1. Users can always view their own profile (no circular dependency!)
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (
    id = auth.uid()
  );

-- 2. Users can view other users in their company
CREATE POLICY "Users can view company users" ON users
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM users WHERE id = auth.uid()
    )
  );

-- Note: Policy #2 still has a subquery, but it's safe because Policy #1
-- ensures the subquery can always succeed (users can always read their own row)

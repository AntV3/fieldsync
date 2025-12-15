-- Fix for Foreman Login: Allow public read access to companies table
-- This allows unauthenticated users to verify company codes during login

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Users can view their company" ON companies;

-- Create a public read policy for company code verification
CREATE POLICY "Public can read companies for login" ON companies
  FOR SELECT USING (true);

-- Note: This is safe because company codes are meant to be shared
-- for login purposes. Sensitive company data should be in other tables
-- with proper RLS policies.

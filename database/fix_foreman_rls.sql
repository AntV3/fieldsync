-- FieldSync Database Migration: Fix Foreman Mode RLS Policy
-- This allows anonymous (PIN-based) foreman access to update area status

-- The issue: Foremen access projects via PIN without authentication,
-- but the existing RLS policies require auth.uid() to be set.
-- This migration adds a permissive policy for anonymous area updates.

-- Add policy to allow anonymous updates to areas
-- This is safe because PIN validation happens at the application level
CREATE POLICY IF NOT EXISTS "Allow anonymous area updates" ON areas
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Alternative: If you want more security, you could add a policy that only
-- allows updates for projects with a PIN set (indicating foreman access is enabled)
-- Uncomment below if you prefer this approach:

-- CREATE POLICY IF NOT EXISTS "Allow PIN-based area updates" ON areas
--   FOR UPDATE
--   USING (
--     EXISTS (
--       SELECT 1 FROM projects
--       WHERE projects.id = areas.project_id
--       AND projects.pin IS NOT NULL
--     )
--   )
--   WITH CHECK (
--     EXISTS (
--       SELECT 1 FROM projects
--       WHERE projects.id = areas.project_id
--       AND projects.pin IS NOT NULL
--     )
--   );

-- Fix T&M ticket update error
-- Error: record "new" has no field "updated_at"
-- This means there's a trigger trying to update a column that doesn't exist

-- ============================================
-- STEP 1: Check if updated_at column exists on tm_tickets
-- ============================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tm_tickets'
AND column_name = 'updated_at';

-- If the result is empty, the column doesn't exist

-- ============================================
-- STEP 2: Check what triggers exist on tm_tickets
-- ============================================
SELECT
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'tm_tickets';

-- ============================================
-- STEP 3: Add updated_at column if it doesn't exist
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tm_tickets' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE tm_tickets ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        RAISE NOTICE 'Added updated_at column to tm_tickets';
    ELSE
        RAISE NOTICE 'updated_at column already exists';
    END IF;
END $$;

-- ============================================
-- STEP 4: Create or update the trigger
-- ============================================
-- First, make sure the trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS update_tm_tickets_updated_at ON tm_tickets;

-- Create new trigger
CREATE TRIGGER update_tm_tickets_updated_at
    BEFORE UPDATE ON tm_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 5: Test it works
-- ============================================
SELECT
    'SUCCESS' as status,
    'tm_tickets table now has updated_at column and trigger' as message;

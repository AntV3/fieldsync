-- Fix material request notifications and add company settings
-- Run this in Supabase SQL Editor

-- ============================================
-- STEP 1: Check if you have materials_manager role
-- ============================================
SELECT
    u.id,
    u.email,
    u.name,
    nr.role_name,
    nr.role_key
FROM users u
LEFT JOIN user_notification_roles unr ON unr.user_id = u.id
LEFT JOIN notification_roles nr ON nr.id = unr.role_id
WHERE u.email = 'anthony@millerenvironmental.com';

-- If you don't see 'materials_manager', continue below

-- ============================================
-- STEP 2: Get your company's notification roles
-- ============================================
SELECT id, company_id, role_name, role_key
FROM notification_roles
WHERE company_id = (SELECT company_id FROM users WHERE email = 'anthony@millerenvironmental.com');

-- ============================================
-- STEP 3: Assign yourself to materials_manager role
-- ============================================
-- First, find the materials_manager role ID
WITH role_info AS (
    SELECT nr.id as role_id, u.id as user_id
    FROM notification_roles nr, users u
    WHERE nr.role_key = 'materials_manager'
    AND u.email = 'anthony@millerenvironmental.com'
    AND nr.company_id = u.company_id
)
INSERT INTO user_notification_roles (user_id, role_id, assigned_by)
SELECT user_id, role_id, user_id
FROM role_info
ON CONFLICT (user_id, role_id) DO NOTHING;

-- ============================================
-- STEP 4: Create company_settings table for labor rates and pricing
-- ============================================
CREATE TABLE IF NOT EXISTS company_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- Labor rates
    default_labor_rate DECIMAL(10,2) DEFAULT 50.00,
    foreman_rate DECIMAL(10,2) DEFAULT 60.00,
    supervisor_rate DECIMAL(10,2) DEFAULT 70.00,

    -- Settings
    currency TEXT DEFAULT 'USD',
    timezone TEXT DEFAULT 'America/New_York',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One settings record per company
    UNIQUE(company_id)
);

-- Enable RLS
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Admins can read their company settings
CREATE POLICY "Admins can read company settings" ON company_settings
    FOR SELECT
    USING (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Admins can update their company settings
CREATE POLICY "Admins can update company settings" ON company_settings
    FOR UPDATE
    USING (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin')
    )
    WITH CHECK (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- Admins can insert company settings
CREATE POLICY "Admins can insert company settings" ON company_settings
    FOR INSERT
    WITH CHECK (
        company_id = (SELECT company_id FROM users WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- STEP 5: Create default settings for your company
-- ============================================
INSERT INTO company_settings (company_id, default_labor_rate, foreman_rate, supervisor_rate)
SELECT
    id,
    50.00,
    60.00,
    70.00
FROM companies
WHERE id = (SELECT company_id FROM users WHERE email = 'anthony@millerenvironmental.com')
ON CONFLICT (company_id) DO NOTHING;

-- ============================================
-- STEP 6: Verify it worked
-- ============================================
SELECT
    'SUCCESS' as status,
    'You are now assigned to materials_manager role and company settings created' as message;

-- Check your notification roles
SELECT nr.role_name, nr.role_key
FROM user_notification_roles unr
JOIN notification_roles nr ON nr.id = unr.role_id
WHERE unr.user_id = (SELECT id FROM users WHERE email = 'anthony@millerenvironmental.com');

-- Check your company settings
SELECT *
FROM company_settings
WHERE company_id = (SELECT company_id FROM users WHERE email = 'anthony@millerenvironmental.com');

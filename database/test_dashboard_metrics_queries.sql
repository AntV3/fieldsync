-- Test queries for new dashboard metrics
-- Run these in Supabase SQL Editor to verify data exists
-- Replace YOUR_COMPANY_ID with your actual company_id

-- ============================================
-- STEP 1: Get your company_id
-- ============================================
SELECT id, name FROM companies WHERE name LIKE '%Miller%' OR name LIKE '%GGG%';
-- Copy the id from above and use it in queries below

-- ============================================
-- STEP 2: Test T&M Approved Tickets (by project)
-- ============================================
SELECT
    p.id as project_id,
    p.name as project_name,
    COUNT(t.id) as ticket_count,
    COALESCE(SUM(
        (SELECT COALESCE(SUM(hours * 50), 0) FROM t_and_m_workers WHERE ticket_id = t.id) +
        (SELECT COALESCE(SUM(quantity * cost_per_unit), 0)
         FROM t_and_m_items ti
         LEFT JOIN materials_equipment me ON ti.material_equipment_id = me.id
         WHERE ti.ticket_id = t.id)
    ), 0) as total_value
FROM projects p
LEFT JOIN t_and_m_tickets t ON t.project_id = p.id AND t.status = 'approved'
WHERE p.company_id = 'YOUR_COMPANY_ID'  -- Replace with actual company_id
GROUP BY p.id, p.name
HAVING COUNT(t.id) > 0
ORDER BY total_value DESC;

-- ============================================
-- STEP 3: Test T&M Billed Tickets (by project)
-- ============================================
SELECT
    p.id as project_id,
    p.name as project_name,
    COUNT(t.id) as ticket_count,
    COALESCE(SUM(
        (SELECT COALESCE(SUM(hours * 50), 0) FROM t_and_m_workers WHERE ticket_id = t.id) +
        (SELECT COALESCE(SUM(quantity * cost_per_unit), 0)
         FROM t_and_m_items ti
         LEFT JOIN materials_equipment me ON ti.material_equipment_id = me.id
         WHERE ti.ticket_id = t.id)
    ), 0) as total_value
FROM projects p
LEFT JOIN t_and_m_tickets t ON t.project_id = p.id AND t.status = 'billed'
WHERE p.company_id = 'YOUR_COMPANY_ID'  -- Replace with actual company_id
GROUP BY p.id, p.name
HAVING COUNT(t.id) > 0
ORDER BY total_value DESC;

-- ============================================
-- STEP 4: Test Total Contract Value (by project)
-- ============================================
SELECT
    id as project_id,
    name as project_name,
    COALESCE(contract_value, 0) as contract_value
FROM projects
WHERE company_id = 'YOUR_COMPANY_ID'  -- Replace with actual company_id
ORDER BY contract_value DESC;

-- ============================================
-- STEP 5: Test Revenue at Risk (low progress projects)
-- ============================================
WITH project_progress AS (
    SELECT
        p.id,
        p.name,
        p.contract_value,
        COALESCE(
            CASE
                WHEN SUM(a.weight) > 0
                THEN ROUND((SUM(CASE WHEN a.status = 'done' THEN a.weight ELSE 0 END) / SUM(a.weight)) * 100)
                ELSE 0
            END,
            0
        ) as progress
    FROM projects p
    LEFT JOIN areas a ON a.project_id = p.id
    WHERE p.company_id = 'YOUR_COMPANY_ID'  -- Replace with actual company_id
    GROUP BY p.id, p.name, p.contract_value
)
SELECT
    id as project_id,
    name as project_name,
    contract_value,
    progress,
    ROUND(contract_value * (1 - (progress / 100.0))) as at_risk_amount
FROM project_progress
WHERE progress < 50  -- Projects less than 50% complete are at risk
AND contract_value > 0
ORDER BY at_risk_amount DESC;

-- ============================================
-- STEP 6: Test Active Projects Count
-- ============================================
SELECT COUNT(*) as active_projects
FROM projects
WHERE company_id = 'YOUR_COMPANY_ID'  -- Replace with actual company_id
AND status = 'active';

-- ============================================
-- STEP 7: Test Material Requests Pending (by project)
-- ============================================
-- This will only work if material_requests table exists
-- If it errors, that's OK - we'll skip this metric for now
SELECT
    p.id as project_id,
    p.name as project_name,
    COUNT(mr.id) as pending_count
FROM projects p
LEFT JOIN material_requests mr ON mr.project_id = p.id AND mr.status = 'pending'
WHERE p.company_id = 'YOUR_COMPANY_ID'  -- Replace with actual company_id
GROUP BY p.id, p.name
HAVING COUNT(mr.id) > 0
ORDER BY pending_count DESC;

-- ============================================
-- RESULTS INTERPRETATION
-- ============================================
-- After running these queries:
-- 1. If you see data, the metrics will work!
-- 2. If you see empty results, that's OK - means no data yet
-- 3. If you get errors about missing tables, we'll handle that
--
-- Next step: I'll create the getDashboardMetricsWithBreakdown function
-- using these exact queries

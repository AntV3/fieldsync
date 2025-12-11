-- Performance Indexes for FieldSync
-- This migration adds indexes to improve query performance

-- Areas table indexes
CREATE INDEX IF NOT EXISTS idx_areas_project_id ON areas(project_id);
CREATE INDEX IF NOT EXISTS idx_areas_status ON areas(status);
CREATE INDEX IF NOT EXISTS idx_areas_project_status ON areas(project_id, status);

-- T&M Tickets indexes
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_id ON t_and_m_tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_status ON t_and_m_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_work_date ON t_and_m_tickets(work_date);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_status ON t_and_m_tickets(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tm_tickets_project_date ON t_and_m_tickets(project_id, work_date);

-- T&M Workers indexes
CREATE INDEX IF NOT EXISTS idx_tm_workers_ticket_id ON t_and_m_workers(ticket_id);

-- T&M Items indexes
CREATE INDEX IF NOT EXISTS idx_tm_items_ticket_id ON t_and_m_items(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tm_items_material_id ON t_and_m_items(material_equipment_id);

-- Crew Check-ins indexes
CREATE INDEX IF NOT EXISTS idx_crew_checkins_project_id ON crew_checkins(project_id);
CREATE INDEX IF NOT EXISTS idx_crew_checkins_date ON crew_checkins(check_in_date);
CREATE INDEX IF NOT EXISTS idx_crew_checkins_project_date ON crew_checkins(project_id, check_in_date);

-- Daily Reports indexes
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_id ON daily_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);
CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON daily_reports(status);
CREATE INDEX IF NOT EXISTS idx_daily_reports_project_date ON daily_reports(project_id, report_date);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_project_id ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_type ON messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_project_read ON messages(project_id, is_read);

-- Material Requests indexes
CREATE INDEX IF NOT EXISTS idx_material_requests_project_id ON material_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_status ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_material_requests_project_status ON material_requests(project_id, status);

-- Project Assignments indexes
CREATE INDEX IF NOT EXISTS idx_project_assignments_user_id ON project_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON project_assignments(project_id);

-- Materials Equipment indexes
CREATE INDEX IF NOT EXISTS idx_materials_equipment_company_id ON materials_equipment(company_id);
CREATE INDEX IF NOT EXISTS idx_materials_equipment_category ON materials_equipment(category);
CREATE INDEX IF NOT EXISTS idx_materials_equipment_company_category ON materials_equipment(company_id, category);
CREATE INDEX IF NOT EXISTS idx_materials_equipment_active ON materials_equipment(active);

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_pin ON projects(pin);
CREATE INDEX IF NOT EXISTS idx_projects_company_status ON projects(company_id, status);

-- Activity Log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_project_id ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);

-- Add contact detail fields for client and contractor on projects
-- Client already has: client_contact (name), client_phone
-- Adding: client_position, client_email
-- Contractor already has: general_contractor (company name)
-- Adding: contractor_contact, contractor_position, contractor_phone, contractor_email

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_position TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_contact TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_position TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_phone TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_email TEXT;

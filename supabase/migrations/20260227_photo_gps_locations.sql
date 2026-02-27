-- Add photo_locations JSONB column to t_and_m_tickets
-- Stores GPS coordinates for each photo: { "storage/path.jpg": { "lat": 34.05, "lng": -118.24, "accuracy": 10 } }
ALTER TABLE t_and_m_tickets
  ADD COLUMN IF NOT EXISTS photo_locations JSONB DEFAULT '{}'::jsonb;

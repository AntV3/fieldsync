-- Migration: Add "observations" to default_field_actions on existing trade templates.
-- The Field Observations action was introduced after 20260315_trade_profiles.sql seeded
-- the starter templates, and INSERT ... ON CONFLICT DO NOTHING leaves deployed rows
-- untouched. This patch appends "observations" where it is missing so foremen can log
-- photos and notes without each company manually reconfiguring field_actions.

UPDATE trade_templates
SET default_field_actions =
  default_field_actions || '["observations"]'::jsonb
WHERE NOT (default_field_actions @> '["observations"]'::jsonb);

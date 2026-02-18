-- Fix draw_requests.created_by FK: add ON DELETE SET NULL so deleting a user
-- does not leave a dangling foreign key reference.
ALTER TABLE draw_requests
  DROP CONSTRAINT IF EXISTS draw_requests_created_by_fkey;

ALTER TABLE draw_requests
  ADD CONSTRAINT draw_requests_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

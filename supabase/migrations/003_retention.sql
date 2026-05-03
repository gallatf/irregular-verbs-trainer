-- Migration: 003_retention
-- Deletes user_progress rows (and the linked auth user) inactive for 2+ years.
-- Apply manually in the Supabase dashboard SQL editor.
--
-- STEP 1: Enable the pg_cron extension (if not already enabled)
--   Supabase dashboard → Database → Extensions → search "pg_cron" → Enable
--
-- STEP 2: Run this entire script in the SQL editor.

-- Function called by the cron job
create or replace function delete_inactive_users()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- Delete progress rows inactive for 2+ years.
  -- The ON DELETE CASCADE on auth.users → user_progress means deleting
  -- the auth user also removes the progress row; here we go the other
  -- direction so we can log what was cleaned up if needed.
  delete from user_progress
  where updated_at < now() - interval '2 years';

  -- Delete auth users that have no progress row and haven't signed in
  -- for 2+ years (catches accounts that never synced any progress).
  delete from auth.users
  where id not in (select user_id from user_progress)
    and last_sign_in_at < now() - interval '2 years';
end;
$$;

-- Schedule: run on the 1st of every month at 03:00 UTC
-- Requires pg_cron to be enabled (see STEP 1 above).
select cron.schedule(
  'delete-inactive-users',
  '0 3 1 * *',
  'select delete_inactive_users()'
);

-- Migration: 002_delete_account
-- Allows a user to delete their own auth account from the client.
-- Apply manually in the Supabase dashboard SQL editor.

create or replace function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

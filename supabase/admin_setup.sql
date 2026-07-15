-- Run this AFTER schema.sql. It replaces the old client-side admin passcode
-- (and the build.js env-var approach) with real server-side enforcement:
-- the passcode is checked inside the database, never shipped in any file.

create table admin_settings (
  id int primary key default 1,
  passcode text not null,
  constraint single_row check (id = 1)
);

alter table admin_settings enable row level security;
-- Deliberately no policies granted here — nobody (anon or authenticated)
-- can read or write this table directly. Only the functions below can,
-- via `security definer`.

create or replace function approve_vendor(target_id uuid, given_passcode text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  correct_passcode text;
begin
  select passcode into correct_passcode from admin_settings where id = 1;
  if correct_passcode is null or given_passcode <> correct_passcode then
    return false;
  end if;
  update vendors set verification_status = 'verified' where id = target_id;
  return true;
end;
$$;

create or replace function revoke_vendor(target_id uuid, given_passcode text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  correct_passcode text;
begin
  select passcode into correct_passcode from admin_settings where id = 1;
  if correct_passcode is null or given_passcode <> correct_passcode then
    return false;
  end if;
  update vendors set verification_status = 'pending' where id = target_id;
  return true;
end;
$$;

grant execute on function approve_vendor(uuid, text) to anon, authenticated;
grant execute on function revoke_vendor(uuid, text) to anon, authenticated;

-- Set your real admin passcode here — replace the placeholder before running.
-- Only you will ever see this value; it's never written to any file Claude generates.
insert into admin_settings (id, passcode) values (1, 'REPLACE_WITH_YOUR_REAL_PASSCODE');

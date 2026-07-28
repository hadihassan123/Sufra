-- Migration: capture latitude/longitude at vendor signup
-- Context: vendor-signup.html now sends latitude/longitude in the auth
-- metadata (set via the new signup map + reverse geocoding). Without this
-- change, handle_new_vendor() silently drops them and the vendors row
-- ends up with address filled but latitude/longitude still null.

create or replace function handle_new_vendor()
returns trigger as $$
begin
  insert into public.vendors (id, business_name, category, area, address, latitude, longitude)
  values (
    new.id,
    new.raw_user_meta_data->>'business_name',
    new.raw_user_meta_data->>'category',
    new.raw_user_meta_data->>'area',
    new.raw_user_meta_data->>'address',
    (new.raw_user_meta_data->>'latitude')::double precision,
    (new.raw_user_meta_data->>'longitude')::double precision
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Trigger itself (on_auth_user_created) already points at this function
-- and doesn't need to be recreated — CREATE OR REPLACE FUNCTION is enough.
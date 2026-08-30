-- nearby_listings_v2 was a plain SQL function (runs with the caller's
-- own privileges), but its WHERE clause reads vendors.location_geog,
-- which anon/authenticated were never granted SELECT on (deliberately
-- - it's meant to be internal-only). Result: EVERY call to this
-- function from a real logged-out or logged-in visitor threw
-- "permission denied for table vendors" - the entire public "Tonight's
-- surplus" homepage grid has been broken for every real visitor, not
-- just during testing. Reproduced directly against the live database
-- via `set role anon; select ... from nearby_listings_v2(...)` before
-- writing this fix, and confirmed fixed the same way afterward.
--
-- Fix: match the pattern already used by every other function in this
-- schema that needs broader internal access (get_my_vendor_profile,
-- create_reservation_safe, admin_list_vendors, is_admin, etc.) -
-- security definer with an explicit search_path. Still returns exactly
-- the same curated public columns it always did; no grant widening,
-- location_geog stays ungranted to anon/authenticated as intended.
--
-- Applied directly to the live project via Supabase's migration tool
-- on 2026-08-30 (name: fix_nearby_listings_v2_security_definer,
-- version 20260830131227) given severity - this was breaking the
-- customer-facing product for every real visitor, not a test-only
-- issue that could wait for a normal branch/review/deploy cycle. This
-- file makes that already-live change visible in git, matching it
-- exactly, rather than letting it become more schema/repo drift.

create or replace function nearby_listings_v2(
  user_lat double precision, user_lng double precision, radius_meters double precision default 500000
)
returns table(
  id uuid, vendor_id uuid, item_name text, description text, category text,
  original_price numeric, discounted_price numeric, quantity_total integer, quantity_left integer,
  pickup_start timestamptz, pickup_end timestamptz, status text, created_at timestamptz, image_url text,
  vendor_name text, vendor_address text, vendor_lat double precision, vendor_lng double precision,
  vendor_logo_url text, distance_meters double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id, l.vendor_id, l.item_name, l.description, l.category,
    l.original_price, l.discounted_price, l.quantity_total, l.quantity_left,
    l.pickup_start, l.pickup_end, l.status, l.created_at, l.image_url,
    v.business_name as vendor_name, v.address as vendor_address,
    v.latitude as vendor_lat, v.longitude as vendor_lng, v.logo_url as vendor_logo_url,
    ST_Distance(
      v.location_geog,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) as distance_meters
  from listings l
  join vendors v on v.id = l.vendor_id
  where l.status <> 'removed'
    and v.verification_status = 'verified'
    and v.location_geog is not null
    and ST_DWithin(
      v.location_geog,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
      radius_meters
    )
  order by distance_meters asc;
$$;

grant execute on function nearby_listings_v2(double precision, double precision, double precision) to anon, authenticated;

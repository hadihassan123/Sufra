-- Sufra database schema — TRUE BASELINE
-- Generated 2026-08-26 by direct introspection of the live Supabase
-- project (yplswfpbcssfmgeejcpy) via pg_catalog/information_schema —
-- not hand-maintained, not aspirational. This replaces the previous
-- supabase/schema.sql, which predated 22 migrations applied directly
-- through the SQL Editor (outside git, outside `supabase db push`) and
-- described tables/policies/functions that no longer exist live
-- (admin_settings, verify_admin_passcode, a permissive `using (true)`
-- SELECT policy on reservations) alongside functions that DID exist
-- live but were undocumented here (get_my_vendor_profile, is_admin,
-- create_reservation_safe, and 5 others — see js/store.js callers).
--
-- supabase/admin_setup.sql is now fully obsolete and superseded by the
-- admin_authz section below — it describes the passcode-based
-- admin_settings table that has been deleted. Safe to delete once this
-- file is confirmed as the source of truth.
--
-- Going forward: every schema change should be `supabase db push`'d as
-- a migration (see supabase/migrations/), not pasted into the SQL
-- Editor ad hoc — that's precisely how this file went stale the first
-- time. Live migration history as of this baseline (from
-- `supabase migration list` / list_migrations), none of which exist
-- as files in this repo yet:
--   20260804091141  widen_public_listings_select_policy
--   20260804091205  add_nearby_listings_v2_geo_search
--   20260804123312  drop_unused_security_definer_view
--   20260805074148  add_missing_foreign_key_indexes
--   20260805074159  optimize_rls_auth_uid_calls
--   20260805074231  consolidate_listings_policies
--   20260805074634  revoke_trigger_only_function_execute
--   20260805074647  fix_search_path_and_drop_dead_rpc
--   20260805074707  add_admin_passcode_lockout
--   20260805074804  actually_revoke_public_execute
--   20260805170528  restrict_is_admin_to_authenticated_only
--   20260806071213  fix_touch_updated_at_search_path
--   20260807083522  fix_create_reservation_safe
--   20260807203616  move_reputation_tier_to_postgres
--   20260808113859  add_vendor_ownership_checks
--   20260808114537  add_qatar_phone_normalization
--   20260808114616  wire_phone_normalization_into_reservations
--   20260808121458  lock_down_reservations_select_and_scope_phone_lookup
--   20260808174404  add_customer_history_and_fix_phone_lookup_client
--   20260808180536  restore_pickup_code_for_qr_feature
--   20260808180954  rollback_pickup_code_exposure
--   20260808182503  add_verified_at_and_vendor_activity_feed
-- (some names imply passcode-era work later superseded by the Aug 11
-- admin_authz migration in this repo — history is a bit tangled
-- because of the mixed CLI/SQL-Editor workflow; this file describes
-- only the end state, not the path there.)
--
-- One live migration DOES have a matching file now:
-- 20260830131227_fix_nearby_listings_v2_security_definer.sql — applied
-- 2026-08-30 after nearby_listings_v2 was found to be missing
-- `security definer`, which made the entire public listings grid throw
-- "permission denied for table vendors" for every real visitor. The
-- function body below already reflects that fix.
--
-- KNOWN LIVE ISSUE NOT YET FIXED (found while pulling this baseline):
-- `reservations` currently has TWO SELECT policies with the identical
-- predicate `auth.uid() = vendor_id` — "vendors can read their own
-- reservations" (from the Aug 8 migration above) and "vendors can view
-- reservations on their own listings" (added today, before this pull
-- surfaced the first one). Harmless — RLS ORs permissive policies — but
-- redundant. Left both in place below rather than silently dropping one
-- live; drop whichever name you don't want to keep in a follow-up
-- migration.
--
-- ALSO FLAGGED (Supabase advisor, live): public.spatial_ref_sys (a
-- PostGIS reference table, not app data) has RLS disabled. Low risk —
-- it's public coordinate-system metadata, not sensitive — but the
-- advisor flags it as critical, so noting it here rather than silently
-- enabling RLS (which would need explicit policies added at the same
-- time or every read breaks).

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists pg_cron;
-- pg_stat_statements, supabase_vault: Supabase-managed, not app-specific.

-- ============================================================
-- VENDORS
-- Login/password is handled by Supabase Auth (auth.users), not stored
-- here. This table holds the business profile only.
-- ============================================================
create table vendors (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text not null,
  category text not null,
  area text not null,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified')),
  created_at timestamptz not null default now(),
  cr_document_path text,
  moph_document_path text,
  municipality_document_path text,
  documents_submitted_at timestamptz,
  logo_url text,
  role text default 'vendor',
  latitude double precision,
  longitude double precision,
  address text,
  location_geog geography
);

create trigger trg_update_vendor_location
  before insert or update on vendors
  for each row execute function update_vendor_location_geog();

create index idx_vendors_location_geog on vendors using gist (location_geog);

alter table vendors enable row level security;

create policy "vendors are publicly readable"
  on vendors for select
  using (true);
  -- Row-level policy is permissive by design; the actual public surface
  -- is narrowed by COLUMN GRANTS below (anon/authenticated can only
  -- SELECT id, business_name, category, area, verification_status,
  -- logo_url, latitude, longitude, address, created_at — NOT the
  -- document paths or role). `select *` from the client correctly 403s;
  -- clients must name columns or go through get_my_vendor_profile().

create policy "vendors can insert their own profile"
  on vendors for insert
  with check ((select auth.uid()) = id);

create policy "vendors can update their own profile"
  on vendors for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- LISTINGS
-- ============================================================
create table listings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  item_name text not null,
  description text,
  category text not null,
  original_price numeric not null,
  discounted_price numeric not null,
  quantity_total integer not null,
  quantity_left integer not null,
  pickup_start timestamptz not null,
  pickup_end timestamptz not null,
  payment_method text not null default 'cash',
  status text not null default 'active' check (status in ('active','sold_out','expired','removed')),
  created_at timestamptz not null default now(),
  image_url text,
  surplus_window text check (surplus_window in ('breakfast','lunch','dinner','late_night')),
  pickup_date date default current_date
);

create index idx_listings_vendor_id on listings (vendor_id);

alter table listings enable row level security;

create policy "listings are visible to public (verified, non-removed) or their"
  on listings for select
  using (
    (status <> 'removed' and exists (
      select 1 from vendors
      where vendors.id = listings.vendor_id
        and vendors.verification_status = 'verified'
    ))
    or (select auth.uid()) = vendor_id
  );

create policy "vendors can insert their own listings"
  on listings for insert
  with check ((select auth.uid()) = vendor_id);

create policy "vendors can update their own listings"
  on listings for update
  using ((select auth.uid()) = vendor_id)
  with check ((select auth.uid()) = vendor_id);

create policy "vendors can delete their own listings"
  on listings for delete
  using ((select auth.uid()) = vendor_id);

-- ============================================================
-- RESERVATIONS
-- No direct client INSERT/SELECT-all — all writes go through
-- create_reservation_safe(); phone lookups go through
-- get_reservations_by_phone(); vendor-side detail lookups go through
-- get_reservation_with_flag(). See "KNOWN LIVE ISSUE" note above re:
-- the duplicate SELECT policy.
-- ============================================================
create table reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id),
  vendor_id uuid not null references vendors(id),
  vendor_name text not null,
  item_name text not null,
  price numeric not null,
  customer_name text not null,
  customer_phone text not null,
  pickup_code text not null,
  pickup_start timestamptz,
  pickup_end timestamptz,
  status text not null default 'reserved' check (status in ('reserved','collected','cancelled','no_show')),
  created_at timestamptz not null default now(),
  quantity integer not null default 1,
  verified_at timestamptz
);

create index idx_reservations_listing_id on reservations (listing_id);
create index idx_reservations_vendor_id on reservations (vendor_id);

create trigger on_reservation_created
  before insert on reservations
  for each row execute function decrement_listing_stock();

alter table reservations enable row level security;

create policy "vendors can read their own reservations"
  on reservations for select
  using ((select auth.uid()) = vendor_id);

create policy "vendors can view reservations on their own listings"
  on reservations for select
  using (auth.uid() = vendor_id);
  -- Duplicate of the policy above — see "KNOWN LIVE ISSUE" note at top.

create policy "vendors can update reservations on their own listings"
  on reservations for update
  using ((select auth.uid()) = vendor_id);

-- ============================================================
-- ADMINS
-- Admin identity is decoupled from vendors — a row here, keyed to
-- auth.users, is what is_admin() checks. No passcode anywhere.
-- ============================================================
create table admins (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;
-- Deliberately no client-facing policies — admins table is only ever
-- read via is_admin()/admin_list_vendors(), both SECURITY DEFINER.

-- ============================================================
-- CUSTOMER_FLAGS
-- No-show tracking → escalating reservation restrictions. Keyed by
-- normalized phone number (see normalize_qatar_phone below).
-- ============================================================
create table customer_flags (
  phone_number text primary key,
  no_show_count integer not null default 0,
  last_no_show_at timestamptz,
  reservation_restricted_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  successful_pickups integer not null default 0
);

create trigger trg_customer_flags_updated
  before update on customer_flags
  for each row execute function touch_updated_at();

alter table customer_flags enable row level security;

create policy "customer_flags_admin_select" on customer_flags for select
  using (exists (select 1 from admins where admins.id = auth.uid()));
create policy "customer_flags_admin_insert" on customer_flags for insert
  with check (exists (select 1 from admins where admins.id = auth.uid()));
create policy "customer_flags_admin_update" on customer_flags for update
  using (exists (select 1 from admins where admins.id = auth.uid()))
  with check (exists (select 1 from admins where admins.id = auth.uid()));
create policy "customer_flags_admin_delete" on customer_flags for delete
  using (exists (select 1 from admins where admins.id = auth.uid()));
-- Note: mark_collected()/mark_no_show() write here via SECURITY DEFINER,
-- bypassing these policies entirely — these policies only gate direct
-- client access, which is admin-only (e.g. a future moderation view).

-- ============================================================
-- ADMIN_AUDIT_LOG
-- Added alongside the admin_authz fix — every approve/revoke now
-- writes who did it and when. Addresses the review's "no attribution"
-- finding (C1).
-- ============================================================
create table admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('approve_vendor','revoke_vendor')),
  target_vendor_id uuid,
  at timestamptz not null default now()
);

create index admin_audit_log_at_idx on admin_audit_log (at desc);

alter table admin_audit_log enable row level security;
-- No client-facing policies — written only by approve_vendor()/
-- revoke_vendor() via SECURITY DEFINER. Add an admin-select policy here
-- if/when an audit-log view gets built.

-- ============================================================
-- FUNCTIONS
-- ============================================================

create or replace function normalize_qatar_phone(p_input text)
returns text
language plpgsql
immutable
as $$
declare
    v_digits text;
begin
    if p_input is null then
        raise exception 'Phone number is required';
    end if;

    v_digits := regexp_replace(p_input, '[^0-9]', '', 'g');

    if v_digits like '00974%' then
        v_digits := substr(v_digits, 6);
    elsif v_digits like '974%' and length(v_digits) = 11 then
        v_digits := substr(v_digits, 4);
    elsif v_digits like '0%' and length(v_digits) = 9 then
        v_digits := substr(v_digits, 2);
    end if;

    if length(v_digits) <> 8 or v_digits !~ '^[3567][0-9]{7}$' then
        raise exception 'Please enter a valid Qatar mobile number (8 digits, starting with 3, 5, 6, or 7).';
    end if;

    return '+974' || v_digits;
end;
$$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    NEW.updated_at = now();
    return NEW;
end;
$$;

create or replace function update_vendor_location_geog()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if NEW.latitude is not null and NEW.longitude is not null then
    NEW.location_geog := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  end if;
  return NEW;
end;
$$;

create or replace function is_admin(check_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists(select 1 from admins where id = check_id);
end;
$$;
revoke all on function is_admin(uuid) from public, anon;
grant execute on function is_admin(uuid) to authenticated;

create or replace function handle_new_vendor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only create a vendor row when signup metadata is present (i.e. the
  -- signup came through vendor-signup.html). Admin-only accounts created
  -- directly in the dashboard correctly get no vendor row at all.
  if new.raw_user_meta_data->>'business_name' is not null then
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
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_vendor();

create or replace function decrement_listing_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update listings
  set quantity_left = quantity_left - new.quantity
  where id = new.listing_id and quantity_left >= new.quantity;

  if not found then
    raise exception 'Not enough stock available.';
  end if;

  return new;
end;
$$;

create or replace function create_reservation_safe(
  p_listing_id uuid, p_customer_name text, p_customer_phone text, p_quantity integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_listing public.listings;
    v_vendor_name text;
    v_flag public.customer_flags;
    v_code text;
    v_reservation public.reservations;
    v_phone text;
begin
    v_phone := normalize_qatar_phone(p_customer_phone);

    select * into v_flag
    from public.customer_flags
    where phone_number = v_phone;

    if v_flag.reservation_restricted_until is not null
       and v_flag.reservation_restricted_until > now() then
        return json_build_object(
            'success', false,
            'reason', 'restricted',
            'restricted_until', v_flag.reservation_restricted_until
        );
    end if;

    if p_quantity is null or p_quantity < 1 then
        raise exception 'Invalid quantity';
    end if;

    select * into v_listing
    from public.listings
    where id = p_listing_id
    for update;

    if not found then
        raise exception 'Listing not found';
    end if;

    if v_listing.quantity_left < p_quantity then
        raise exception 'Not enough quantity available';
    end if;

    select business_name into v_vendor_name
    from public.vendors where id = v_listing.vendor_id;

    select string_agg(substr(chars, (random() * length(chars))::int + 1, 1), '')
    into v_code
    from (select 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' as chars) c,
         generate_series(1, 6);

    insert into public.reservations(
        listing_id, vendor_id, vendor_name, item_name, price, quantity,
        customer_name, customer_phone, pickup_code, pickup_start, pickup_end, status
    )
    values(
        v_listing.id, v_listing.vendor_id, coalesce(v_vendor_name, ''), v_listing.item_name,
        v_listing.discounted_price * p_quantity, p_quantity,
        p_customer_name, v_phone, v_code,
        v_listing.pickup_start, v_listing.pickup_end, 'reserved'
    )
    returning * into v_reservation;

    return json_build_object('success', true, 'reservation', row_to_json(v_reservation));
end;
$$;
grant execute on function create_reservation_safe(uuid, text, text, integer) to anon, authenticated;

create or replace function mark_collected(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_phone text;
begin
    select customer_phone
    into v_phone
    from public.reservations
    where id = p_reservation_id
      and status = 'reserved'
      and vendor_id = (select auth.uid())
    for update;

    if not found then
        raise exception 'Reservation not found or already processed.';
    end if;

    update public.reservations
    set status = 'collected', verified_at = now()
    where id = p_reservation_id;

    insert into public.customer_flags (phone_number, successful_pickups)
    values (v_phone, 1)
    on conflict (phone_number)
    do update
    set successful_pickups = customer_flags.successful_pickups + 1,
        updated_at = now();
end;
$$;
grant execute on function mark_collected(uuid) to authenticated;

create or replace function mark_no_show(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_phone text;
    v_count integer;
begin
    select customer_phone
    into v_phone
    from public.reservations
    where id = p_reservation_id
      and status = 'reserved'
      and vendor_id = (select auth.uid())
    for update;

    if not found then
        raise exception 'Reservation not found or already processed.';
    end if;

    update public.reservations
    set status = 'no_show', verified_at = now()
    where id = p_reservation_id;

    insert into public.customer_flags (phone_number, no_show_count, last_no_show_at)
    values (v_phone, 1, now())
    on conflict (phone_number)
    do update
    set no_show_count = customer_flags.no_show_count + 1,
        last_no_show_at = now(),
        updated_at = now();

    select no_show_count
    into v_count
    from public.customer_flags
    where phone_number = v_phone;

    if v_count = 3 then
        update public.customer_flags set reservation_restricted_until = now() + interval '1 day' where phone_number = v_phone;
    elsif v_count = 4 then
        update public.customer_flags set reservation_restricted_until = now() + interval '3 days' where phone_number = v_phone;
    elsif v_count >= 5 then
        update public.customer_flags set reservation_restricted_until = now() + interval '7 days' where phone_number = v_phone;
    end if;
end;
$$;
grant execute on function mark_no_show(uuid) to authenticated;

create or replace function get_my_vendor_profile()
returns setof vendors
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query select * from vendors where id = auth.uid();
end;
$$;
grant execute on function get_my_vendor_profile() to authenticated;

create or replace function get_reservations_by_phone(p_phone text)
returns table(
  id uuid, item_name text, vendor_name text, quantity integer, pickup_code text,
  pickup_start timestamptz, pickup_end timestamptz, status text, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized text;
begin
  normalized := normalize_qatar_phone(p_phone);
  if normalized is null then
    return;
  end if;

  return query
    select r.id, r.item_name, r.vendor_name, r.quantity, r.pickup_code,
           r.pickup_start, r.pickup_end, r.status, r.created_at
    from reservations r
    where r.customer_phone = normalized
    order by r.created_at desc
    limit 50;
end;
$$;
grant execute on function get_reservations_by_phone(text) to anon, authenticated;

create or replace function get_reservation_with_flag(p_pickup_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    r record;
    f record;
    v_pickups int;
    v_no_shows int;
    v_score int;
    v_tier text;
    v_history jsonb;
begin
    select *
    into r
    from public.reservations
    where upper(pickup_code) = upper(p_pickup_code);

    if not found then
        return null;
    end if;

    if (select auth.uid()) is null or (select auth.uid()) <> r.vendor_id then
        return null;
    end if;

    select *
    into f
    from public.customer_flags
    where phone_number = r.customer_phone;

    v_pickups := coalesce(f.successful_pickups, 0);
    v_no_shows := coalesce(f.no_show_count, 0);
    v_score := v_pickups - (v_no_shows * 2);

    v_tier := case
        when v_pickups = 0 and v_no_shows = 0 then 'new'
        when v_no_shows = 0 then 'trusted'
        when v_score >= 2 then 'trusted'
        when v_score >= 0 then 'warning'
        else 'danger'
    end;

    select jsonb_agg(
        jsonb_build_object(
            'item_name', h.item_name,
            'quantity', h.quantity,
            'status', h.status,
            'created_at', h.created_at
        )
        order by h.created_at desc
    )
    into v_history
    from (
        select item_name, quantity, status, created_at
        from public.reservations
        where customer_phone = r.customer_phone
          and vendor_id = r.vendor_id
          and id <> r.id
        order by created_at desc
        limit 5
    ) h;

    return jsonb_build_object(
        'id', r.id,
        'listing_id', r.listing_id,
        'vendor_id', r.vendor_id,
        'vendor_name', r.vendor_name,
        'item_name', r.item_name,
        'price', r.price,
        'customer_name', r.customer_name,
        'customer_phone', r.customer_phone,
        'pickup_code', r.pickup_code,
        'pickup_start', r.pickup_start,
        'pickup_end', r.pickup_end,
        'status', r.status,
        'created_at', r.created_at,
        'quantity', r.quantity,
        'customer_flag',
        jsonb_build_object(
            'no_show_count', v_no_shows,
            'successful_pickups', v_pickups,
            'reservation_restricted_until', f.reservation_restricted_until,
            'score', v_score,
            'tier', v_tier,
            'is_currently_restricted', (f.reservation_restricted_until is not null and f.reservation_restricted_until > now())
        ),
        'history_with_you', coalesce(v_history, '[]'::jsonb)
    );
end;
$$;
grant execute on function get_reservation_with_flag(text) to authenticated;

create or replace function get_recent_vendor_activity(p_limit integer default 8)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    if (select auth.uid()) is null then
        return '[]'::jsonb;
    end if;

    return coalesce(
        (
            select jsonb_agg(
                jsonb_build_object(
                    'customer_name', a.customer_name,
                    'item_name', a.item_name,
                    'quantity', a.quantity,
                    'status', a.status,
                    'verified_at', a.verified_at
                )
                order by a.verified_at desc
            )
            from (
                select customer_name, item_name, quantity, status, verified_at
                from public.reservations
                where vendor_id = (select auth.uid())
                  and status in ('collected', 'no_show')
                  and verified_at is not null
                order by verified_at desc
                limit p_limit
            ) a
        ),
        '[]'::jsonb
    );
end;
$$;
grant execute on function get_recent_vendor_activity(integer) to authenticated;

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
-- nearby_listings (v1) has been dropped live — it filtered status='active'
-- in SQL and silently dropped sold-out/expired rows. v2 replaces it
-- entirely; js/store.js's getActiveListings() (the v1 caller) was
-- removed from the client on 2026-08-26 for the same reason.

-- ============================================================
-- ADMIN AUTHORIZATION
-- No passcode anywhere. approve_vendor/revoke_vendor check is_admin()
-- against the caller's own session and are granted to `authenticated`
-- only — never anon, never PUBLIC. Every call is written to
-- admin_audit_log.
-- ============================================================

create or replace function admin_list_vendors()
returns setof vendors
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query select * from vendors order by created_at desc;
end;
$$;
revoke all on function admin_list_vendors() from public, anon;
grant execute on function admin_list_vendors() to authenticated;

create or replace function approve_vendor(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update vendors set verification_status = 'verified' where id = target_id;
  if not found then
    raise exception 'no such vendor';
  end if;

  insert into admin_audit_log (actor_id, action, target_vendor_id)
  values (auth.uid(), 'approve_vendor', target_id);

  return true;
end;
$$;
revoke all on function approve_vendor(uuid) from public, anon;
grant execute on function approve_vendor(uuid) to authenticated;

create or replace function revoke_vendor(target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not is_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update vendors set verification_status = 'pending' where id = target_id;
  if not found then
    raise exception 'no such vendor';
  end if;

  insert into admin_audit_log (actor_id, action, target_vendor_id)
  values (auth.uid(), 'revoke_vendor', target_id);

  return true;
end;
$$;
revoke all on function revoke_vendor(uuid) from public, anon;
grant execute on function revoke_vendor(uuid) to authenticated;

-- ============================================================
-- PROJECT-LEVEL SAFETY NET
-- Event trigger: any future `create table` in `public` automatically
-- gets RLS turned on, so a forgotten `alter table ... enable row level
-- security` can't ship a wide-open table by accident. (Note this is WHY
-- spatial_ref_sys is the one exception — it predates this trigger, via
-- the postgis extension's own table creation, which this trigger
-- doesn't intercept.)
-- ============================================================
create or replace function rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;
-- create event trigger rls_auto_enable_trg on ddl_command_end
--   when tag in ('CREATE TABLE') execute function rls_auto_enable();
-- ^ Event trigger attachment not confirmed live as part of this pull —
-- the function exists but verify the event trigger itself is actually
-- attached (`select * from pg_event_trigger`) before assuming new
-- tables get this automatically.

-- ============================================================
-- SCHEDULED JOBS
-- Added 2026-09-06, live before it was ever written down here - see
-- supabase/migrations/20260906_document_expire_stale_reservations_cron.sql
-- for the full review notes (two known non-blocking gaps: duplicated
-- escalation logic vs mark_no_show(), and no per-row exception
-- handling in the loop).
-- ============================================================
create or replace function expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count integer;
  v_done integer := 0;
begin
  for r in
    select id, customer_phone
    from public.reservations
    where status = 'reserved'
      and pickup_end is not null
      and now() > (pickup_end + interval '30 minutes')
    for update skip locked
  loop
    update public.reservations
    set status = 'no_show', verified_at = now()
    where id = r.id;

    insert into public.customer_flags (phone_number, no_show_count, last_no_show_at)
    values (r.customer_phone, 1, now())
    on conflict (phone_number)
    do update
    set no_show_count = customer_flags.no_show_count + 1,
        last_no_show_at = now(),
        updated_at = now();

    select no_show_count into v_count
    from public.customer_flags
    where phone_number = r.customer_phone;

    if v_count = 3 then
      update public.customer_flags
      set reservation_restricted_until = now() + interval '1 day'
      where phone_number = r.customer_phone;
    elsif v_count = 4 then
      update public.customer_flags
      set reservation_restricted_until = now() + interval '3 days'
      where phone_number = r.customer_phone;
    elsif v_count >= 5 then
      update public.customer_flags
      set reservation_restricted_until = now() + interval '7 days'
      where phone_number = r.customer_phone;
    end if;

    v_done := v_done + 1;
  end loop;

  return v_done;
end;
$$;
-- execute intentionally NOT granted to anon/authenticated - cron-only,
-- confirmed live (only `postgres` has execute).

select cron.schedule(
  'expire-stale-reservations',
  '*/15 * * * *',
  $$select public.expire_stale_reservations()$$
);

-- ============================================================
-- COLUMN-LEVEL GRANTS
-- RLS controls which ROWS are visible; these control which COLUMNS.
-- This is what makes `select *` fail (correctly) while named-column
-- selects succeed. Confirmed live via information_schema.role_column_grants.
-- ============================================================
grant select (id, business_name, category, area, verification_status, logo_url, latitude, longitude, address, created_at)
  on vendors to anon, authenticated;
grant insert (id, business_name, category, area, verification_status, cr_document_path, moph_document_path, municipality_document_path, documents_submitted_at, logo_url, role, latitude, longitude, location_geog)
  on vendors to authenticated;
grant update (address, area, business_name, category, cr_document_path, documents_submitted_at, latitude, logo_url, longitude, moph_document_path, municipality_document_path)
  on vendors to authenticated;
-- Note: NOT granted to anon/authenticated at all: role, location_geog
-- (select), documents_submitted_at (select). cr_document_path etc. are
-- write-only from the client (insert/update) and never selectable —
-- correct, since these are signed-URL-only via storage, not meant to be
-- read back as raw paths by the browser.

grant select, insert, update on listings to authenticated;
grant select (category, created_at, description, discounted_price, id, image_url, item_name, original_price, payment_method, pickup_date, pickup_end, pickup_start, quantity_left, quantity_total, status, surplus_window, vendor_id)
  on listings to anon;

grant select, update on reservations to authenticated;
-- reservations has no direct client INSERT grant — creation only via
-- create_reservation_safe(). anon has column-level SELECT/REFERENCES
-- grants here but zero visible rows without a matching RLS policy, so
-- this is inert until/unless a policy is added — worth confirming
-- that's intentional rather than leftover from an earlier, wider policy.

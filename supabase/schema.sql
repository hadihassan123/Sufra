-- Sufra database schema
-- Reconstructed from the live Supabase project (yplswfpbcssfmgeejcpy) on 2026-07-28
-- to replace the stale supabase/schema.sql previously in the repo.
-- Run this once in Supabase's SQL Editor on a FRESH project (SQL Editor → New query → paste → Run).
-- On the existing project, do not re-run this file — it's already applied piece by piece.
-- Track future changes as migrations (see note at bottom) instead of editing this by hand.

-- ============================================================
-- VENDORS
-- Login/password is handled by Supabase Auth (auth.users), not
-- stored here. This table holds the business profile only.
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
  address text
);

alter table vendors enable row level security;

-- Anyone can read basic vendor info (needed to show vendor name on listings)
create policy "vendors are publicly readable"
  on vendors for select
  using (true);

-- A vendor can only insert/update their own row
-- NOTE: in practice this insert path is rarely hit directly — see
-- handle_new_vendor() below, which auto-creates the row via a trigger
-- on auth.users. This policy still guards any client-side insert/update.
create policy "vendors can insert their own profile"
  on vendors for insert
  with check (auth.uid() = id);

create policy "vendors can update their own profile"
  on vendors for update
  using (auth.uid() = id);


-- ============================================================
-- LISTINGS
-- ============================================================
create table listings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  item_name text not null,
  description text,
  category text not null,
  original_price numeric(10,2) not null,
  discounted_price numeric(10,2) not null,
  quantity_total int not null,
  quantity_left int not null,
  pickup_start timestamptz not null,
  pickup_end timestamptz not null,
  payment_method text not null default 'cash',
  status text not null default 'active' check (status in ('active','sold_out','expired','removed')),
  created_at timestamptz not null default now(),
  image_url text,
  surplus_window text check (surplus_window in ('breakfast','lunch','dinner','late_night')),
  pickup_date date default current_date
);

alter table listings enable row level security;

-- Public can only see active listings from verified vendors
create policy "public can read active listings from verified vendors"
  on listings for select
  using (
    status = 'active'
    and exists (
      select 1 from vendors
      where vendors.id = listings.vendor_id
      and vendors.verification_status = 'verified'
    )
  );

-- A vendor can see, insert, update, and delete only their own listings
-- (covers the vendor dashboard, including viewing pending/unapproved listings)
create policy "vendors manage their own listings"
  on listings for all
  using (auth.uid() = vendor_id)
  with check (auth.uid() = vendor_id);


-- ============================================================
-- RESERVATIONS
-- ============================================================
create table reservations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  vendor_name text not null,
  item_name text not null,
  price numeric(10,2) not null,
  customer_name text not null,
  customer_phone text not null,
  pickup_code text not null,
  pickup_start timestamptz not null,
  pickup_end timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved','collected','cancelled')),
  created_at timestamptz not null default now(),
  quantity int default 1
);

alter table reservations enable row level security;

-- Anyone can create a reservation (customers aren't logged in)
create policy "anyone can create a reservation"
  on reservations for insert
  with check (true);

-- Anyone can look up a reservation by matching phone number or pickup code
-- (this mirrors the current "look up by phone" / "verify by code" behavior)
create policy "reservations are readable for lookup"
  on reservations for select
  using (true);

-- Only the owning vendor can update (e.g. mark collected)
create policy "vendors can update reservations on their own listings"
  on reservations for update
  using (auth.uid() = vendor_id);


-- ============================================================
-- Keep quantity_left in sync automatically when a reservation is made
-- NOTE: this now decrements by the reserved quantity (reservations.quantity),
-- not a flat 1 — the original version in the repo was stale here too.
-- ============================================================
create or replace function decrement_listing_stock()
returns trigger as $$
begin
  update listings
  set quantity_left = quantity_left - new.quantity
  where id = new.listing_id and quantity_left >= new.quantity;

  if not found then
    raise exception 'Not enough stock available.';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_reservation_created
  before insert on reservations
  for each row execute function decrement_listing_stock();


-- ============================================================
-- Auto-create a vendor profile row when someone signs up
-- This was NOT in the previous schema.sql at all. It's what actually
-- populates `vendors` (including address) from the signup form's
-- auth metadata — the "vendors can insert their own profile" RLS
-- policy above is a fallback path, not the primary one.
-- ============================================================
create or replace function handle_new_vendor()
returns trigger as $$
begin
  -- Only create a vendor row when signup metadata is present (i.e. the
  -- signup went through vendor-signup.html). Admin-only accounts, created
  -- directly in the Supabase dashboard with no metadata, correctly get
  -- no vendor row at all — see the admins table below.
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
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_vendor();


-- ============================================================
-- ADMINS
-- Decoupled from vendors on purpose — an admin never has to look like
-- a business. No signup form for this; see the migration file
-- (20260730_admins_table.sql) for how a new admin gets created.
-- ============================================================
create table admins (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;
-- Deliberately no policies — nobody can query this table directly, not
-- even to check their own membership. is_admin() below is the only way
-- in, and it only ever returns true/false.

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

grant execute on function is_admin(uuid) to anon, authenticated;

-- ============================================================
-- admin_settings / approve_vendor / revoke_vendor already match the
-- live DB exactly — see supabase/admin_setup.sql, run that file after
-- this one, same as before. No changes needed there.
-- ============================================================

-- ============================================================
-- Going forward: track schema changes as migrations instead of ad hoc
-- Table Editor edits, so this file (and `list_migrations`) stays true.
-- e.g. with the Supabase CLI:
--   supabase migration new add_something
--   (edit the generated file, then) supabase db push
-- ============================================================
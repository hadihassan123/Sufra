-- Sufra database schema
-- Run this once in Supabase's SQL Editor (SQL Editor → New query → paste → Run)

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
  created_at timestamptz not null default now()
);

alter table vendors enable row level security;

-- Anyone can read basic vendor info (needed to show vendor name on listings)
create policy "vendors are publicly readable"
  on vendors for select
  using (true);

-- A vendor can only insert/update their own row
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
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now()
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
-- ============================================================
create or replace function decrement_listing_stock()
returns trigger as $$
begin
  update listings
  set quantity_left = quantity_left - 1
  where id = new.listing_id and quantity_left > 0;

  if not found then
    raise exception 'This item is sold out.';
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger on_reservation_created
  before insert on reservations
  for each row execute function decrement_listing_stock();

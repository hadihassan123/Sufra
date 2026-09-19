-- Customer accounts (Phase 3) - database layer.
--
-- Scope, as agreed: v1 is login + reservation history + cancellation.
-- Existing anonymous phone-only reservations keep working fully -
-- a real, forced migration off that flow isn't realistic (can't make
-- existing customers who never signed up suddenly have an account,
-- and the pickup-code verification flow still needs to work for
-- anyone who never creates one). This is additive, not a replacement.
--
-- Login is email + password via Supabase Auth, same mechanism vendors
-- already use - not a separate auth system.
--
-- Every piece below was verified in rolled-back transactions against
-- the live database before being written here, across two full test
-- passes (the first surfaced two real bugs in the design itself, both
-- fixed before this file was written - see the customer_id comment
-- on create_reservation_safe for the more important one):
--   - handle_new_customer's trigger correctly creates a customers row
--     on signup, and correctly does NOT fire for vendor signups
--   - a logged-in customer's reservation correctly gets customer_id set
--   - a logged-in VENDOR (or admin) making a reservation - a real,
--     previously-unhandled case - still succeeds, falling back to a
--     null customer_id rather than crashing on a foreign key violation
--   - a fully anonymous reservation is completely unaffected
--   - get_my_reservation_history() returns exactly the right rows -
--     not the vendor's, not an unrelated anonymous reservation
--   - cancel_reservation() correctly restores the listing's
--     quantity_left, correctly rejects cancelling an
--     already-cancelled reservation, and correctly rejects a
--     different customer trying to cancel someone else's reservation

create table customers (
  id uuid primary key references auth.users(id) on delete cascade,
  phone_number text,
  created_at timestamptz not null default now()
);

alter table customers enable row level security;

create policy "customers can view their own profile"
  on customers for select
  using (auth.uid() = id);

create policy "customers can update their own profile"
  on customers for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "customers can insert their own profile"
  on customers for insert
  with check (auth.uid() = id);

-- Nullable, references customers (not auth.users directly) - a
-- reservation from someone without a customers row (anonymous, or a
-- logged-in vendor/admin) simply has no link here, which is the
-- correct, safe default rather than a constraint violation.
alter table reservations add column customer_id uuid references customers(id);
create index idx_reservations_customer_id on reservations (customer_id);

-- Mirrors handle_new_vendor's own guard exactly, inverted: fires only
-- when signup metadata has NO business_name, so a vendor signup and a
-- customer signup can never both create a row for the same user, and
-- neither trigger needs to know the other exists.
create or replace function handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_user_meta_data->>'business_name' is null then
    insert into public.customers (id, phone_number)
    values (new.id, new.raw_user_meta_data->>'phone_number');
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created_customer
  after insert on auth.users
  for each row execute function handle_new_customer();

-- Modified: links customer_id when the caller is a real, logged-in
-- customer. IMPORTANT, found via testing not assumed: a raw
-- `customer_id = auth.uid()` unconditionally would have thrown a
-- foreign key violation and failed the ENTIRE reservation for anyone
-- authenticated but without a customers row - concretely, a vendor or
-- admin logged into their own account, browsing and reserving an item
-- as a customer would. Checking that a customers row actually exists
-- first means that case still succeeds normally, just without the
-- account link - the same outcome as an anonymous reservation, which
-- is the correct, safe fallback.
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
    v_attempt_count integer;
    v_customer_id uuid;
begin
    v_phone := normalize_qatar_phone(p_customer_phone);

    insert into public.reservation_attempts (phone_number) values (v_phone);

    select count(*) into v_attempt_count
    from public.reservation_attempts
    where phone_number = v_phone
      and attempted_at > now() - interval '1 hour';

    if v_attempt_count > 5 then
        return json_build_object('success', false, 'reason', 'rate_limited');
    end if;

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

    if auth.uid() is not null then
      select id into v_customer_id from public.customers where id = auth.uid();
    end if;

    insert into public.reservations(
        listing_id, vendor_id, vendor_name, item_name, price, quantity,
        customer_name, customer_phone, pickup_code, pickup_start, pickup_end, status, customer_id
    )
    values(
        v_listing.id, v_listing.vendor_id, coalesce(v_vendor_name, ''), v_listing.item_name,
        v_listing.discounted_price * p_quantity, p_quantity,
        p_customer_name, v_phone, v_code,
        v_listing.pickup_start, v_listing.pickup_end, 'reserved', v_customer_id
    )
    returning * into v_reservation;

    return json_build_object('success', true, 'reservation', row_to_json(v_reservation));
end;
$$;

-- Bridges a customer's pre-account reservation history: matches by
-- customer_id (anything reserved while logged in, going forward) OR
-- by the account's own stored phone number (so signing up doesn't
-- orphan reservations made anonymously before the account existed).
-- This is the mechanism that makes "eventually replace phone-only"
-- achievable later without a disruptive one-time data migration now -
-- history just accumulates correctly either way as accounts get used.
create or replace function get_my_reservation_history()
returns setof reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  if auth.uid() is null then
    return;
  end if;

  select phone_number into v_phone
  from public.customers
  where id = auth.uid();

  return query
    select * from public.reservations
    where customer_id = auth.uid()
       or (v_phone is not null and customer_phone = v_phone)
    order by created_at desc;
end;
$$;
grant execute on function get_my_reservation_history() to authenticated;

-- Requires being logged in - an anonymous reservation (no customer_id)
-- has no self-service cancellation path in v1. That's a deliberate
-- scope line, not an oversight: allowing cancellation by phone number
-- alone (matching how "Your pickups" already does lookups) would mean
-- anyone who knows or guesses a phone number could cancel that
-- person's reservation, which is a meaningfully different risk than a
-- read-only lookup. Restoring quantity_left on cancel (not on
-- collected or no_show, which correctly never restore stock, since
-- the food is genuinely gone either way) - a cancellation happens
-- before pickup, so the item is still genuinely sellable.
create or replace function cancel_reservation(p_reservation_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.reservations;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_reservation
  from public.reservations
  where id = p_reservation_id and customer_id = auth.uid()
  for update;

  if not found then
    raise exception 'Reservation not found or not yours to cancel.';
  end if;

  if v_reservation.status <> 'reserved' then
    raise exception 'Only pending reservations can be cancelled.';
  end if;

  update public.reservations
  set status = 'cancelled'
  where id = p_reservation_id;

  update public.listings
  set quantity_left = quantity_left + v_reservation.quantity
  where id = v_reservation.listing_id;

  return json_build_object('success', true);
end;
$$;
grant execute on function cancel_reservation(uuid) to authenticated;

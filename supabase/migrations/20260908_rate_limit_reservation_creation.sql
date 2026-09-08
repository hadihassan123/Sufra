-- Rate limiting for create_reservation_safe - Phase 3 abuse control.
--
-- create_reservation_safe() is an unauthenticated write endpoint
-- (granted to anon) with nothing before this stopping rapid-fire
-- requests. The existing customer_flags no-show restriction is
-- reactive - it only kicks in after someone has already reserved and
-- failed to show up. This adds a preventive check: no more than 5
-- reservation ATTEMPTS (successful or not) from the same phone number
-- per rolling hour.
--
-- HONEST SCOPE NOTE, not silently glossed over: phone numbers here are
-- format-validated (normalize_qatar_phone) but never SMS-verified. An
-- attacker who randomizes the phone number on every request is not
-- slowed down by this at all - each "new" number gets its own fresh 5
-- attempts. This closes the easy case (one script hammering the same
-- number, or one real person mashing a button) but is not a complete
-- defense against a determined attacker. A proper IP-based layer
-- (Cloudflare Turnstile, or a Supabase Edge Function reading the
-- caller's real IP) is the stronger follow-up the original review
-- actually recommended - this is the deliberately-simpler first step,
-- not a replacement for that.
--
-- Verified in a rolled-back transaction against the live database
-- before this migration was written: 5 attempts from one phone number
-- succeed, the 6th and 7th are correctly blocked, a different phone
-- number is completely unaffected, and the full integrated function
-- (rate limit + restriction check + oversell guard + success path)
-- was retested together, not just the rate-limit logic in isolation -
-- confirmed a normal reservation still succeeds and correctly
-- decrements stock, an oversell attempt still correctly raises, and
-- light legitimate use (2 attempts) is never falsely blocked.

create table reservation_attempts (
  id bigint generated always as identity primary key,
  phone_number text not null,
  attempted_at timestamptz not null default now()
);

create index idx_reservation_attempts_phone_time on reservation_attempts (phone_number, attempted_at);

alter table reservation_attempts enable row level security;
-- No client-facing policies, same pattern as admin_audit_log - this is
-- only ever written from inside create_reservation_safe() via its
-- SECURITY DEFINER privileges, never touched directly by anon/authenticated.

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
begin
    -- Raises a clear error if this isn't a plausible Qatar mobile
    -- number; also collapses formatting variants ("55512345",
    -- "+974 5551 2345", "0097455512345"...) to one canonical value so
    -- customer_flags restriction checks (and now rate limiting) can't
    -- be dodged by retyping the same real number differently.
    v_phone := normalize_qatar_phone(p_customer_phone);

    -- Rate limit: log this attempt (success or not, decided below)
    -- and check volume BEFORE doing anything else - this is the very
    -- first gate, ahead of even the no-show restriction check, since
    -- it's about request VOLUME rather than any specific customer's
    -- history.
    insert into public.reservation_attempts (phone_number) values (v_phone);

    select count(*) into v_attempt_count
    from public.reservation_attempts
    where phone_number = v_phone
      and attempted_at > now() - interval '1 hour';

    if v_attempt_count > 5 then
        return json_build_object(
            'success', false,
            'reason', 'rate_limited'
        );
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

-- Housekeeping: reservation_attempts logs one row per attempt and
-- would otherwise grow forever. Deliberately a SEPARATE cron job from
-- expire_stale_reservations rather than folding into it - that job's
-- name and purpose is specifically about expiring stale
-- RESERVATIONS, not pruning an unrelated log table. Once daily is
-- plenty since only the last hour of data is ever actually read;
-- 48 hours of retention gives comfortable buffer for debugging a
-- recent rate-limit event without keeping the table growing forever.
create or replace function prune_reservation_attempts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.reservation_attempts
  where attempted_at < now() - interval '48 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
-- execute intentionally not granted to anon/authenticated - cron-only.

select cron.schedule(
  'prune-reservation-attempts',
  '0 3 * * *',
  $$select public.prune_reservation_attempts()$$
);

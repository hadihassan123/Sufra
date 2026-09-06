-- Documents a cron job and function that were already live in
-- production before this file existed - written to match exactly
-- what's already running, pulled directly from the live database
-- (pg_extension, cron.job, pg_get_functiondef), not reconstructed from
-- memory. This is the same class of gap that
-- 20260830131227_fix_nearby_listings_v2_security_definer.sql already
-- fixed once for a different function: a real, working change made
-- directly against the live database with zero trace anywhere in git.
-- supabase/schema.sql's own header comment is the place to go for the
-- full "why does this keep happening" story - the short version is
-- that SQL Editor changes are real and live immediately, but only
-- `supabase db push`/pull leave a trail in this repo.
--
-- What this does: every 15 minutes, any reservation still sitting in
-- 'reserved' status more than 30 minutes past its listing's pickup_end
-- gets automatically marked 'no_show' and folds into the same
-- customer_flags escalation (3 no-shows -> 1 day restricted, 4 -> 3
-- days, 5+ -> 7 days) that a vendor manually clicking "No-show" in the
-- dashboard already triggers via mark_no_show(). Before this existed,
-- a customer who simply never showed up stayed 'reserved' forever
-- unless a vendor happened to notice and manually intervene.
--
-- Reviewed 2026-09-06, not just pulled and left unread. Two real,
-- non-blocking things worth knowing if this is ever touched again:
--
-- 1. The escalation logic below is now duplicated between this
--    function and mark_no_show() rather than one calling the other.
--    mark_no_show() can't be called directly from here because it
--    checks `vendor_id = auth.uid()`, and there is no authenticated
--    caller in a cron context - auth.uid() is null. If the escalation
--    tiers ever change, both copies need updating together.
--
-- 2. There is no per-row exception handling in the loop below. If a
--    single row causes a genuine error, the whole batch for that run
--    rolls back - nothing in that 15-minute window gets expired, with
--    no alert. Check `select * from cron.job_run_details order by
--    start_time desc limit 20;` if reservations ever seem to be
--    sitting in 'reserved' well past their window without expiring -
--    that table is pg_cron's own execution history and will show
--    whether recent runs actually succeeded.

create extension if not exists pg_cron;

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

-- execute intentionally NOT granted to anon/authenticated - this is
-- cron-only, confirmed live (only `postgres` has execute).

select cron.schedule(
  'expire-stale-reservations',
  '*/15 * * * *',
  $$select public.expire_stale_reservations()$$
);

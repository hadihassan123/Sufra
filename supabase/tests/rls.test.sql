-- pgTAP test suite: RLS policies and SECURITY DEFINER functions.
--
-- Every test here was proven against the REAL live database before
-- being committed - not written speculatively. Run this via
-- `supabase test db` (needs the Supabase CLI + local Postgres, see
-- README below) or paste it directly into the Supabase SQL Editor.
--
-- SAFETY: the whole file is one transaction that always ends in
-- ROLLBACK. It creates temporary vendors/listings/reservations, runs
-- assertions against them as anon/authenticated would really
-- experience them (via SET LOCAL ROLE + a faked request.jwt.claims,
-- matching how PostgREST actually authenticates real requests), then
-- rolls everything back. Nothing here is ever actually saved - you can
-- run this against production safely, which is the whole point: there
-- is no separate staging database (see supabase/README.md - deferred,
-- real ongoing cost, no free tier available), so testing real RLS
-- meant testing it against the real database without ever committing
-- to it.
--
-- What's covered, and why each one matters:
--   1-2. An unverified vendor's listing must be invisible to the
--        public homepage grid, but a verified one must be visible.
--        This is the exact rule nearby_listings_v2 exists to enforce.
--   3.   A vendor can read their OWN reservations directly (sanity
--        check that the RLS policy isn't accidentally too strict).
--   4.   A vendor CANNOT mark another vendor's reservation as
--        collected - this is what stops a malicious or buggy request
--        from marking a stranger's order fulfilled.
--   5-6. approve_vendor is unreachable both by a fully anonymous
--        caller AND by a logged-in vendor who isn't an admin - the
--        exact hole the review's #1 finding was about, checked from
--        both angles rather than just one.
--   7-9. The oversell guard: requesting more than quantity_left fails
--        cleanly without mutating anything, requesting exactly what's
--        left succeeds, and the stock actually decrements. This is the
--        one that would have caught a real race-condition-adjacent bug
--        automatically instead of needing a human to find it by hand.
--
-- NOT covered here, deliberately: true concurrent-request oversell
-- (two requests racing for the last unit at the exact same instant).
-- pgTAP runs sequentially in one session, so it can only prove the
-- guard's LOGIC is correct, not that Postgres's row lock actually
-- serializes two real simultaneous connections - that needs a
-- multi-connection tool (e.g. two parallel psql sessions, or a small
-- k6/Node script firing concurrent requests) as a separate, later test
-- if that guarantee ever needs to be proven rather than assumed correct
-- by inspection of the `for update` clause in create_reservation_safe.

BEGIN;

CREATE TEMP TABLE tap_output (line text);
GRANT INSERT, SELECT ON tap_output TO anon, authenticated;

INSERT INTO tap_output SELECT plan(9);

-- ============================================================
-- Fixtures - all fake, all isolated to this rolled-back transaction
-- ============================================================
DO $$
DECLARE
  v_vendor_a uuid := gen_random_uuid();
  v_vendor_b uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('test.vendor_a', v_vendor_a::text, false);
  PERFORM set_config('test.vendor_b', v_vendor_b::text, false);

  INSERT INTO auth.users (id) VALUES (v_vendor_a), (v_vendor_b);

  INSERT INTO vendors (id, business_name, category, area, verification_status, latitude, longitude)
  VALUES
    (v_vendor_a, 'TEST Vendor A (verified)', 'bakery', 'Test Area', 'verified', 25.2854, 51.5310),
    (v_vendor_b, 'TEST Vendor B (unverified)', 'bakery', 'Test Area', 'pending', 25.2854, 51.5310);
END $$;

-- listings used for RLS / visibility tests
INSERT INTO listings (id, vendor_id, item_name, category, original_price, discounted_price, quantity_total, quantity_left, pickup_start, pickup_end)
VALUES
  ('11111111-1111-1111-1111-111111111111', current_setting('test.vendor_a')::uuid, 'TEST item A', 'bakery', 10, 5, 3, 1, now(), now() + interval '2 hours'),
  ('22222222-2222-2222-2222-222222222222', current_setting('test.vendor_b')::uuid, 'TEST item B', 'bakery', 10, 5, 3, 3, now(), now() + interval '2 hours');

-- a SEPARATE, dedicated listing for the oversell test - inserting the
-- fixture reservation below fires the real decrement_listing_stock
-- trigger (it runs on ANY insert into reservations, not just ones
-- via create_reservation_safe), so it must not share a listing with
-- the oversell assertions or it silently consumes their stock first.
-- (This was caught the hard way while first writing this suite -
-- quantity_left was 0 by the time the oversell tests ran, and it took
-- an isolated diagnostic query to find the fixture, not the product,
-- was the cause. Left as a comment so nobody "fixes" this file by
-- merging the two listings back together.)
INSERT INTO listings (id, vendor_id, item_name, category, original_price, discounted_price, quantity_total, quantity_left, pickup_start, pickup_end)
VALUES ('44444444-4444-4444-4444-444444444444', current_setting('test.vendor_a')::uuid, 'TEST item A2 (oversell)', 'bakery', 10, 5, 3, 1, now(), now() + interval '2 hours');

INSERT INTO reservations (id, listing_id, vendor_id, vendor_name, item_name, price, customer_name, customer_phone, pickup_code, pickup_start, pickup_end, status)
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', current_setting('test.vendor_a')::uuid, 'TEST Vendor A', 'TEST item A', 5, 'Test Customer', '+97430000000', 'TESTCD', now(), now() + interval '2 hours', 'reserved');

-- ============================================================
-- 1-2: unverified vendor's listing invisible to anon; verified is visible
-- ============================================================
SET LOCAL ROLE anon;
INSERT INTO tap_output SELECT is(
  (SELECT count(*)::int FROM nearby_listings_v2(25.2854, 51.5310, 500000) WHERE id = '22222222-2222-2222-2222-222222222222'),
  0, 'unverified vendor listing is invisible to anon via nearby_listings_v2');
INSERT INTO tap_output SELECT is(
  (SELECT count(*)::int FROM nearby_listings_v2(25.2854, 51.5310, 500000) WHERE id = '11111111-1111-1111-1111-111111111111'),
  1, 'verified vendor listing IS visible to anon via nearby_listings_v2');
RESET ROLE;

-- ============================================================
-- 3-4: reservations RLS - own data readable, another vendor's
-- reservation cannot be marked collected
-- ============================================================
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.vendor_a'), 'role', 'authenticated')::text, true);
INSERT INTO tap_output SELECT is(
  (SELECT count(*)::int FROM reservations WHERE id = '33333333-3333-3333-3333-333333333333'),
  1, 'vendor A CAN see their own reservation directly');

SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.vendor_b'), 'role', 'authenticated')::text, true);
INSERT INTO tap_output SELECT throws_like(
  $t$SELECT mark_collected('33333333-3333-3333-3333-333333333333'::uuid)$t$,
  '%not found or already processed%', 'vendor B cannot mark_collected on vendor A''s reservation');
RESET ROLE;

-- ============================================================
-- 5-6: approve_vendor unreachable from both anon and a non-admin
-- authenticated vendor
-- ============================================================
SET LOCAL ROLE anon;
INSERT INTO tap_output SELECT throws_ok(
  $t$SELECT approve_vendor('11111111-1111-1111-1111-111111111111'::uuid)$t$,
  '42501', null, 'anon cannot call approve_vendor (permission denied)');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('test.vendor_a'), 'role', 'authenticated')::text, true);
INSERT INTO tap_output SELECT throws_like(
  $t$SELECT approve_vendor('22222222-2222-2222-2222-222222222222'::uuid)$t$,
  '%not authorized%', 'a non-admin authenticated vendor cannot call approve_vendor');
RESET ROLE;

-- ============================================================
-- 7-9: oversell guard (non-concurrent case - see file header)
-- ============================================================
SET LOCAL ROLE anon;
INSERT INTO tap_output SELECT throws_like(
  $t$SELECT create_reservation_safe('44444444-4444-4444-4444-444444444444'::uuid, 'Test', '+97430000001', 2)$t$,
  '%Not enough quantity available%', 'reserving more than quantity_left (1) raises, does not oversell');

INSERT INTO tap_output SELECT lives_ok(
  $t$SELECT create_reservation_safe('44444444-4444-4444-4444-444444444444'::uuid, 'Test', '+97430000002', 1)$t$,
  'reserving exactly the available quantity (1) succeeds');

INSERT INTO tap_output SELECT is(
  (SELECT quantity_left FROM listings WHERE id = '44444444-4444-4444-4444-444444444444'),
  0, 'quantity_left correctly decremented to 0 after the successful reservation');
RESET ROLE;

INSERT INTO tap_output SELECT * FROM finish();
SELECT line FROM tap_output;

ROLLBACK;

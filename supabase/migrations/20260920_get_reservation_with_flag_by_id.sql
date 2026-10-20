-- QR verify used Store.getReservation(id) which returns a bare row with no
-- customer_flag / history_with_you. Typed code used get_reservation_with_flag
-- and correctly showed phone-based reputation. This RPC mirrors that function
-- but looks up by reservation id (what the QR encodes).

create or replace function public.get_reservation_with_flag_by_id(p_reservation_id uuid)
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
    where id = p_reservation_id;

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

grant execute on function public.get_reservation_with_flag_by_id(uuid) to authenticated;

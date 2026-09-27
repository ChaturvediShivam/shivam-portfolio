-- ----------------------------------------------------------------------------
-- Fix: a test sale that carries an external order id could not be recorded.
--
-- `vbyb_record_order` looks for an existing order by (provider,
-- external_order_id) before inserting. PL/pgSQL's SELECT INTO sets *every*
-- target to NULL when no row matches, so a miss wiped the
-- `v_capacity := 'not_applicable'` initializer. A real sale then re-assigned it
-- in the capacity block, but a test sale skips that block entirely and the
-- insert hit `null value in column "capacity_status" ... violates not-null`
-- (SQLSTATE 23502). Symptom: every Gumroad test ping returned HTTP 500 and was
-- retried; real sales were unaffected.
--
-- Only the reset after a missed lookup is new; the rest of the function is
-- unchanged from 20260914090000_validate_before_you_build.sql.
-- ----------------------------------------------------------------------------
create or replace function vbyb_record_order(
  p_launch_slug        text,
  p_provider           text,
  p_external_order_id  text,
  p_email              text,
  p_name               text,
  p_purchaser_id       text,
  p_product_id         text,
  p_product_name       text,
  p_amount_cents       integer,
  p_currency           text,
  p_purchased_at       timestamptz,
  p_is_test            boolean,
  p_raw_payload        jsonb,
  p_notes              text,
  p_actor_type         text,
  p_actor_id           uuid
)
returns table (order_id uuid, created boolean, capacity_status vbyb_capacity_status, slot_number integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  v_launch         vbyb_launches%rowtype;
  v_email          text := lower(btrim(coalesce(p_email, '')));
  v_currency       text := upper(btrim(coalesce(p_currency, '')));
  v_customer_id    uuid;
  v_order_id       uuid;
  v_validation_id  uuid;
  v_occupied       integer;
  v_capacity       vbyb_capacity_status := 'not_applicable';
  v_slot           integer;
begin
  if p_provider is null or p_provider not in ('gumroad', 'manual') then
    raise exception 'Invalid order provider.' using errcode = '22023';
  end if;
  if v_email = '' then
    raise exception 'An order needs a customer email.' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'An order needs a non-negative amount.' using errcode = '22023';
  end if;

  select * into v_launch from vbyb_launches where slug = p_launch_slug;
  if not found then
    raise exception 'Unknown launch.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vbyb_capacity:' || v_launch.id::text, 0));

  if p_external_order_id is not null then
    select o.id, o.capacity_status, o.slot_number
      into v_order_id, v_capacity, v_slot
      from vbyb_orders o
     where o.provider = p_provider and o.external_order_id = p_external_order_id;
    if found then
      order_id := v_order_id;
      created := false;
      capacity_status := v_capacity;
      slot_number := v_slot;
      return next;
      return;
    end if;
    -- A miss has just nulled all three targets, including the capacity default.
    -- Restore it: a test sale returns below without visiting the capacity block.
    v_order_id := null;
    v_capacity := 'not_applicable';
    v_slot := null;
  end if;

  insert into vbyb_customers as c (email, name)
  values (v_email, nullif(btrim(p_name), ''))
  on conflict (email) do update set name = coalesce(c.name, excluded.name)
  returning c.id into v_customer_id;

  if not coalesce(p_is_test, false) then
    select count(*) into v_occupied
      from vbyb_orders o
     where o.launch_id = v_launch.id
       and o.payment_status = 'paid'
       and o.capacity_status = 'within_capacity'
       and not o.is_test;

    if v_occupied < v_launch.capacity then
      v_capacity := 'within_capacity';
      -- Reuse the lowest slot number freed by a refund.
      select min(s.n) into v_slot
        from generate_series(1, v_launch.capacity) as s(n)
       where not exists (
         select 1 from vbyb_orders o
          where o.launch_id = v_launch.id
            and o.payment_status = 'paid'
            and o.capacity_status = 'within_capacity'
            and not o.is_test
            and o.slot_number = s.n
       );
      v_slot := coalesce(v_slot, v_occupied + 1);
    else
      v_capacity := 'over_capacity';
      v_slot := null;
    end if;
  end if;

  insert into vbyb_orders (
    launch_id, customer_id, provider, external_order_id, external_purchaser_id,
    product_id, product_name, amount_cents, currency, purchased_at,
    payment_status, capacity_status, slot_number, is_test, raw_payload, notes
  )
  values (
    v_launch.id, v_customer_id, p_provider, p_external_order_id, p_purchaser_id,
    p_product_id, p_product_name, p_amount_cents, v_currency, coalesce(p_purchased_at, now()),
    'paid', v_capacity, v_slot, coalesce(p_is_test, false), p_raw_payload, nullif(btrim(p_notes), '')
  )
  returning id into v_order_id;

  insert into vbyb_validations (order_id, customer_id)
  values (v_order_id, v_customer_id)
  returning id into v_validation_id;

  insert into vbyb_events (event_type, customer_id, order_id, validation_id, actor_type, actor_id, metadata)
  values (
    'ORDER_CREATED', v_customer_id, v_order_id, v_validation_id,
    coalesce(p_actor_type, 'system'), p_actor_id,
    jsonb_build_object(
      'provider', p_provider,
      'amount_cents', p_amount_cents,
      'currency', v_currency,
      'is_test', coalesce(p_is_test, false),
      'capacity_status', v_capacity,
      'slot_number', v_slot
    )
  );

  if v_capacity = 'over_capacity' then
    insert into vbyb_events (event_type, customer_id, order_id, validation_id, actor_type, actor_id, metadata)
    values (
      'ORDER_CAPACITY_EXCEEDED', v_customer_id, v_order_id, v_validation_id,
      coalesce(p_actor_type, 'system'), p_actor_id,
      jsonb_build_object('capacity', v_launch.capacity)
    );
  end if;

  order_id := v_order_id;
  created := true;
  capacity_status := v_capacity;
  slot_number := v_slot;
  return next;
end;
$$;

revoke all on function vbyb_record_order(text, text, text, text, text, text, text, text, integer, text, timestamptz, boolean, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function vbyb_record_order(text, text, text, text, text, text, text, text, integer, text, timestamptz, boolean, jsonb, text, text, uuid) to service_role;

-- ============================================================================
-- VBYB database self-test — runs inside a transaction that is ROLLED BACK.
-- Nothing it creates is kept. Run in the Supabase SQL Editor after the
-- migration. Success prints: NOTICE:  VBYB self-test passed
-- A failure raises an ASSERT error naming the check that failed.
--
-- Uses its own throwaway launch (capacity 2) so real orders never affect the
-- capacity arithmetic being tested. Emails use the reserved .invalid domain.
-- ============================================================================
begin;

do $$
declare
  v_a          record;
  v_dup        record;
  v_b          record;
  v_c          record;
  v_d          record;
  v_sub        uuid;
  v_sub_row    record;
  v_metrics    jsonb;
  v_delivery   record;
  v_delivery2  record;
begin
  insert into vbyb_launches (slug, name, price_cents, currency, capacity)
  values ('vbyb-selftest', 'Self-test launch', 3900, 'USD', 2);

  -- 1. First paid order takes slot 1; email is normalized.
  select * into v_a from vbyb_record_order(
    'vbyb-selftest', 'gumroad', 'selftest-sale-a', '  A@SelfTest.invalid ', 'Alice',
    null, 'prod', 'Product', 3900, 'usd', now(), false, '{}'::jsonb, null, 'system', null);
  assert v_a.created, 'first order is created';
  assert v_a.capacity_status = 'within_capacity' and v_a.slot_number = 1, 'first order takes slot 1';
  assert (select count(*) from vbyb_customers where email = 'a@selftest.invalid') = 1, 'customer email normalized';
  assert (select status from vbyb_validations where order_id = v_a.order_id) = 'paid', 'validation starts as paid';

  -- 2. Duplicate webhook for the same sale returns the existing order.
  select * into v_dup from vbyb_record_order(
    'vbyb-selftest', 'gumroad', 'selftest-sale-a', 'a@selftest.invalid', 'Alice',
    null, 'prod', 'Product', 3900, 'USD', now(), false, '{}'::jsonb, null, 'webhook', null);
  assert not v_dup.created and v_dup.order_id = v_a.order_id, 'duplicate sale returns the existing order';
  assert (select count(*) from vbyb_orders where external_order_id = 'selftest-sale-a') = 1, 'no duplicate order row';
  assert (select count(*) from vbyb_validations where order_id = v_a.order_id) = 1, 'no duplicate validation row';

  -- 3. Second order takes slot 2; third is over capacity.
  select * into v_b from vbyb_record_order(
    'vbyb-selftest', 'gumroad', 'selftest-sale-b', 'b@selftest.invalid', 'Bea',
    null, 'prod', 'Product', 3900, 'USD', now(), false, '{}'::jsonb, null, 'system', null);
  assert v_b.capacity_status = 'within_capacity' and v_b.slot_number = 2, 'second order takes slot 2';

  select * into v_c from vbyb_record_order(
    'vbyb-selftest', 'manual', null, 'c@selftest.invalid', 'Cal',
    null, null, null, 3900, 'USD', now(), false, null, 'manual', 'user', null);
  assert v_c.capacity_status = 'over_capacity' and v_c.slot_number is null, 'third order is over capacity';

  -- 4. Test orders never occupy a slot.
  perform vbyb_record_order(
    'vbyb-selftest', 'manual', null, 'test@selftest.invalid', null,
    null, null, null, 0, 'USD', now(), true, null, null, 'user', null);
  assert (select capacity_status from vbyb_orders where customer_id = (select id from vbyb_customers where email = 'test@selftest.invalid')) = 'not_applicable',
    'test order does not take capacity';

  -- 5. Refund frees slot 1 and is idempotent; data is kept.
  assert vbyb_record_refund(v_a.order_id, now(), null, 'self-test', 'user', null) = true, 'refund applies';
  assert vbyb_record_refund(v_a.order_id, now(), null, 'self-test', 'user', null) = false, 'repeat refund is a no-op';
  assert (select payment_status from vbyb_orders where id = v_a.order_id) = 'refunded', 'order marked refunded';
  assert (select status from vbyb_validations where order_id = v_a.order_id) = 'refunded', 'validation marked refunded';

  -- 6. The next paid order reuses the freed slot 1.
  select * into v_d from vbyb_record_order(
    'vbyb-selftest', 'gumroad', 'selftest-sale-d', 'd@selftest.invalid', 'Dee',
    null, 'prod', 'Product', 3900, 'USD', now(), false, '{}'::jsonb, null, 'system', null);
  assert v_d.capacity_status = 'within_capacity' and v_d.slot_number = 1, 'freed slot 1 is reused';

  -- 7. DELIVERED without a decision is rejected by the database.
  begin
    update vbyb_validations set status = 'delivered', delivered_at = now() where order_id = v_b.order_id;
    assert false, 'delivered without decision should have been rejected';
  exception when check_violation then
    null;
  end;

  -- 8. A stored submission links to its order and seeds the idea fields.
  select * into v_sub_row from vbyb_store_submission(
    'selftest-submission-1', null, 'selftest-event-1', 'form', null, now(),
    'B@selftest.invalid', 'Bea', null, '{"idea_what": "A test idea"}'::jsonb, '{"raw": true}'::jsonb);
  assert v_sub_row.created, 'submission stored';
  v_sub := v_sub_row.submission_id;

  select * into v_sub_row from vbyb_store_submission(
    'selftest-submission-1', null, 'selftest-event-1', 'form', null, now(),
    'b@selftest.invalid', 'Bea', null, '{}'::jsonb, '{"raw": true}'::jsonb);
  assert not v_sub_row.created and v_sub_row.submission_id = v_sub, 'duplicate submission returns the existing row';

  assert vbyb_link_submission(v_sub, v_b.order_id, 'email', 'system', null) = 'linked', 'submission links';
  assert vbyb_link_submission(v_sub, v_b.order_id, 'email', 'system', null) = 'already_linked', 'relinking is a no-op';
  assert (select status from vbyb_validations where order_id = v_b.order_id) = 'submitted', 'validation moves to submitted';
  assert (select idea_what from vbyb_validations where order_id = v_b.order_id) = 'A test idea', 'idea fields seeded';

  -- 9. DELIVERED with decision, date and rationale is accepted.
  update vbyb_validations
     set status = 'delivered', delivered_at = now(), decision = 'test_more',
         decided_at = now(), decision_rationale = 'Self-test rationale'
   where order_id = v_b.order_id;

  -- 10. Metrics come from the rows above.
  v_metrics := vbyb_launch_metrics('vbyb-selftest');
  assert (v_metrics->>'capacity')::int = 2, 'metrics capacity';
  assert (v_metrics->>'occupied_slots')::int = 2, 'metrics occupied slots (b and d)';
  assert (v_metrics->>'remaining_slots')::int = 0, 'metrics remaining slots';
  assert (v_metrics->>'over_capacity_orders')::int = 1, 'metrics over-capacity orders (c)';
  assert (v_metrics->>'paid_orders')::int = 3, 'metrics paid orders (b, c, d)';
  assert (v_metrics->>'refunded_orders')::int = 1, 'metrics refunded orders (a)';
  assert (v_metrics->>'test_orders')::int = 1, 'metrics test orders';
  assert (v_metrics->>'gross_revenue_cents')::int = 15600, 'metrics gross revenue';
  assert (v_metrics->>'refunded_cents')::int = 3900, 'metrics refunded amount';
  assert (v_metrics->>'net_revenue_cents')::int = 11700, 'metrics net revenue';
  assert (v_metrics->>'delivered')::int = 1, 'metrics delivered';
  assert (v_metrics->'decisions'->>'test_more')::int = 1, 'metrics decision distribution';

  -- 11. Webhook delivery registration is deduplicated.
  select * into v_delivery from vbyb_register_delivery('tally', 'selftest-delivery', 'FORM_RESPONSE', 'x', null);
  select * into v_delivery2 from vbyb_register_delivery('tally', 'selftest-delivery', 'FORM_RESPONSE', 'x', null);
  assert v_delivery2.delivery_id = v_delivery.delivery_id and v_delivery2.attempts = 2, 'delivery deduplicated';

  raise notice 'VBYB self-test passed';
end $$;

rollback;

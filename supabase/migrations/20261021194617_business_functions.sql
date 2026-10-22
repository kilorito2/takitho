-- Takitho · business logic in SQL.
-- Conventions
--  * Internals live in schema `private` (never exposed as RPC).
--  * Anything callable from the API is SECURITY DEFINER with search_path = '' AND an explicit role check inside;
--    EXECUTE is revoked from PUBLIC and granted per role in the grants migration.
--  * Business errors are `raise exception '<CODE>'` (SQLSTATE P0001) so Edge Functions can map them.

-- ---------------------------------------------------------------- allowed transitions (ADR-0005)
insert into public.order_status_transitions (order_type, from_status, to_status)
select t, f, x
from unnest(array['pickup', 'delivery', 'dine_in']::public.order_type[]) as t,
  (values
    ('pending_payment'::public.order_status, 'received'::public.order_status),
    ('received', 'preparing'),
    ('preparing', 'ready')
  ) as forward(f, x)
union all
select t, 'ready', case when t = 'delivery' then 'out_for_delivery'::public.order_status else 'delivered'::public.order_status end
from unnest(array['pickup', 'delivery', 'dine_in']::public.order_type[]) as t
union all
select 'delivery', 'out_for_delivery', 'delivered'
union all
select t, s, 'cancelled'
from unnest(array['pickup', 'delivery', 'dine_in']::public.order_type[]) as t,
  unnest(array['pending_payment', 'received', 'preparing', 'ready']::public.order_status[]) as s
union all
select 'delivery', 'out_for_delivery', 'cancelled';

-- ---------------------------------------------------------------- identity helpers
create or replace function public.auth_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.is_active
$$;

-- ---------------------------------------------------------------- order status guard
-- Nobody (not even the service role) changes orders.status except through private.apply_transition().
create or replace function private.guard_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('takitho.allow_status_update', true), '') <> '1' then
    raise exception 'STATUS_CHANGE_FORBIDDEN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger orders_guard_status before update on public.orders
  for each row execute function private.guard_order_status();

-- ---------------------------------------------------------------- coupons
create or replace function private.release_coupon(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_coupon uuid;
begin
  delete from public.coupon_redemptions where order_id = p_order_id returning coupon_id into v_coupon;
  if v_coupon is not null then
    update public.coupons set uses_count = greatest(uses_count - 1, 0) where id = v_coupon;
  end if;
end;
$$;

-- ---------------------------------------------------------------- the one place status changes
create or replace function private.apply_transition(
  p_order_id uuid,
  p_to public.order_status,
  p_reason text,
  p_actor uuid
)
returns public.orders
language plpgsql
set search_path = ''
as $$
declare
  o public.orders;
  v_from public.order_status;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_from := o.status;
  if not exists (
    select 1 from public.order_status_transitions t
    where t.order_type = o.type and t.from_status = o.status and t.to_status = p_to
  ) then
    raise exception 'INVALID_TRANSITION' using errcode = 'P0001', detail = o.status::text;
  end if;
  if p_to = 'received' and o.status = 'pending_payment'
     and o.payment_method = 'mercado_pago' and o.payment_status <> 'paid' then
    raise exception 'PAYMENT_REQUIRED' using errcode = 'P0001';
  end if;
  if p_to = 'cancelled' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;

  perform set_config('takitho.allow_status_update', '1', true);
  update public.orders
     set status = p_to,
         cancel_reason = case when p_to = 'cancelled' then p_reason else cancel_reason end
   where id = o.id
   returning * into o;
  perform set_config('takitho.allow_status_update', '', true);

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, reason)
  values (o.id, v_from, p_to, p_actor, p_reason);

  if p_to = 'cancelled' then
    perform private.release_coupon(o.id);
  end if;
  return o;
end;
$$;

-- Staff action: kitchen can move forward; only admins can cancel.
create or replace function public.transition_order(
  p_order_id uuid,
  p_to public.order_status,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.staff_role := public.auth_role();
  o public.orders;
begin
  if v_role is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_to = 'cancelled' and v_role <> 'admin' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  o := private.apply_transition(p_order_id, p_to, p_reason, (select auth.uid()));
  return to_jsonb(o);
end;
$$;

-- Admin action: cash / transfer collected.
create or replace function public.mark_order_paid(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.orders
     set payment_status = 'paid', paid_at = now()
   where id = p_order_id and payment_method in ('cash', 'transfer') and payment_status = 'pending'
   returning * into o;
  if not found then
    raise exception 'NOT_MANUAL_PAYMENT' using errcode = 'P0001';
  end if;
  return to_jsonb(o);
end;
$$;

-- Quick buttons for the kitchen ("Agotar producto", "Pausar pedidos"): any staff role.
create or replace function public.set_product_available(p_product_id uuid, p_available boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.products set is_available = p_available where id = p_product_id;
end;
$$;

create or replace function public.set_modifier_available(p_modifier_id uuid, p_available boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.modifiers set is_available = p_available where id = p_modifier_id;
end;
$$;

create or replace function public.set_store_paused(p_paused boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.auth_role() is null then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.store_settings set is_paused = p_paused where id = 1;
end;
$$;

-- ---------------------------------------------------------------- rate limiting (ADR-0008)
-- Fixed window; atomic upsert. Service role only.
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_s int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  return jsonb_build_object(
    'allowed', v_count <= p_max,
    'count', v_count,
    'retry_after_s', greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_s) - now())))::int)
  );
end;
$$;

create or replace function private.next_order_code(p_date date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_n int;
begin
  insert into public.order_counters as c (business_date, last_value)
  values (p_date, 1)
  on conflict (business_date) do update set last_value = c.last_value + 1
  returning c.last_value into v_n;
  return 'TK-' || lpad(v_n::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------- create_order_tx (ADR-0008)
-- Payload shape: see supabase/functions/_shared/order-pipeline.ts (OrderRow).
create or replace function public.create_order_tx(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existing public.orders;
  v_item jsonb;
  v_mod jsonb;
  v_item_id uuid;
  v_coupon uuid := nullif(p ->> 'coupon_id', '')::uuid;
  v_phone text := p #>> '{customer,phone}';
  v_status public.order_status := (p ->> 'initial_status')::public.order_status;
  o public.orders;
  v_sort int := 0;
begin
  -- Claim the idempotency key. A concurrent retry waits here for the first transaction to finish.
  insert into public.orders (
    idempotency_key, request_hash, business_date, status, type,
    customer_name, customer_phone,
    delivery_street, delivery_number, delivery_floor_apt, delivery_references,
    zone_id, table_id, scheduled_for,
    subtotal, delivery_fee, discount, tip, total, coupon_id,
    payment_method, cash_paid_with, estimated_minutes, client_ip_hash
  ) values (
    (p ->> 'idempotency_key')::uuid, p ->> 'request_hash', (p ->> 'business_date')::date, v_status, (p ->> 'type')::public.order_type,
    p #>> '{customer,name}', v_phone,
    p #>> '{delivery,street}', p #>> '{delivery,number}', p #>> '{delivery,floor_apt}', p #>> '{delivery,references}',
    nullif(p ->> 'zone_id', '')::uuid, nullif(p ->> 'table_id', '')::uuid, nullif(p ->> 'scheduled_for', '')::timestamptz,
    (p #>> '{totals,subtotal}')::int, (p #>> '{totals,delivery_fee}')::int, (p #>> '{totals,discount}')::int,
    (p #>> '{totals,tip}')::int, (p #>> '{totals,total}')::int, v_coupon,
    (p #>> '{payment,method}')::public.payment_method, nullif(p #>> '{payment,cash_paid_with}', '')::int,
    nullif(p ->> 'estimated_minutes', '')::int, p ->> 'client_ip_hash'
  )
  on conflict (idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing from public.orders where idempotency_key = (p ->> 'idempotency_key')::uuid;
    if v_existing.request_hash <> p ->> 'request_hash' then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'id', v_existing.id, 'code', v_existing.code, 'public_token', v_existing.public_token,
      'status', v_existing.status, 'payment_status', v_existing.payment_status,
      'total', v_existing.total, 'estimated_minutes', v_existing.estimated_minutes, 'replayed', true
    );
  end if;

  update public.orders set code = private.next_order_code((p ->> 'business_date')::date)
   where id = v_id returning * into o;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    insert into public.order_items (order_id, product_id, name_snapshot, unit_price_snapshot, quantity, line_total, note, sort)
    values (v_id, (v_item ->> 'product_id')::uuid, v_item ->> 'name', (v_item ->> 'unit_price')::int,
            (v_item ->> 'quantity')::int, (v_item ->> 'line_total')::int, nullif(v_item ->> 'note', ''), v_sort)
    returning id into v_item_id;
    v_sort := v_sort + 1;
    for v_mod in select * from jsonb_array_elements(coalesce(v_item -> 'modifiers', '[]'::jsonb)) loop
      insert into public.order_item_modifiers (order_item_id, modifier_id, name_snapshot, price_delta_snapshot)
      values (v_item_id, (v_mod ->> 'modifier_id')::uuid, v_mod ->> 'name', (v_mod ->> 'price_delta')::int);
    end loop;
  end loop;

  if v_coupon is not null then
    update public.coupons set uses_count = uses_count + 1
     where id = v_coupon and is_active and (max_uses is null or uses_count < max_uses);
    if not found then
      raise exception 'COUPON_EXHAUSTED' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.coupons c
      where c.id = v_coupon and c.max_uses_per_phone is not null
        and (select count(*) from public.coupon_redemptions r where r.coupon_id = c.id and r.phone = v_phone) >= c.max_uses_per_phone
    ) then
      raise exception 'COUPON_PHONE_EXHAUSTED' using errcode = 'P0001';
    end if;
    insert into public.coupon_redemptions (coupon_id, order_id, phone, discount)
    values (v_coupon, v_id, v_phone, (p #>> '{totals,discount}')::int);
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, reason)
  values (v_id, null, v_status, 'Pedido creado');

  return jsonb_build_object(
    'id', o.id, 'code', o.code, 'public_token', o.public_token, 'status', o.status,
    'payment_status', o.payment_status, 'total', o.total, 'estimated_minutes', o.estimated_minutes, 'replayed', false
  );
end;
$$;

-- ---------------------------------------------------------------- payments (ADR-0007)
-- Called by the verified webhook after it re-queried Mercado Pago. Idempotent per (payment, status).
create or replace function public.apply_payment_result(
  p_order_id uuid,
  p_mp_payment_id text,
  p_mp_status text,
  p_amount numeric,
  p_currency text,
  p_raw jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  v_event uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    insert into public.admin_alerts (kind, message)
    values ('unknown_order', 'Pago ' || p_mp_payment_id || ' de Mercado Pago sin pedido asociado.');
    return jsonb_build_object('result', 'unknown_order');
  end if;

  insert into public.payment_events (order_id, mp_payment_id, mp_status, raw)
  values (o.id, p_mp_payment_id, p_mp_status, coalesce(p_raw, '{}'::jsonb))
  on conflict (mp_payment_id, mp_status) do nothing
  returning id into v_event;
  if v_event is null then
    return jsonb_build_object('result', 'duplicate');
  end if;

  if p_mp_status = 'approved' then
    if p_currency is distinct from 'ARS' or p_amount is distinct from o.total::numeric then
      insert into public.admin_alerts (kind, order_id, message)
      values ('amount_mismatch', o.id, 'Pago ' || p_mp_payment_id || ' por ' || p_amount || ' ' || coalesce(p_currency, '?') || ' no coincide con el pedido ' || o.code || ' ($ ' || o.total || ').');
      return jsonb_build_object('result', 'amount_mismatch');
    end if;
    update public.orders set payment_status = 'paid', mp_payment_id = p_mp_payment_id, paid_at = now() where id = o.id;
    if o.status = 'pending_payment' then
      perform private.apply_transition(o.id, 'received', 'Pago aprobado', null);
    elsif o.status = 'cancelled' then
      insert into public.admin_alerts (kind, order_id, message)
      values ('late_payment', o.id, 'Se aprobó un pago del pedido ' || o.code || ' que ya estaba cancelado: reembolsar en Mercado Pago.');
    end if;
    return jsonb_build_object('result', 'paid');
  elsif p_mp_status in ('rejected', 'cancelled') then
    update public.orders set payment_status = 'failed' where id = o.id and payment_status = 'pending';
    return jsonb_build_object('result', 'failed');
  elsif p_mp_status in ('refunded', 'charged_back') then
    update public.orders set payment_status = 'refunded' where id = o.id;
    insert into public.admin_alerts (kind, order_id, message)
    values ('refund', o.id, 'El pago del pedido ' || o.code || ' fue ' || p_mp_status || ' en Mercado Pago.');
    return jsonb_build_object('result', 'refunded');
  end if;
  return jsonb_build_object('result', 'ignored');
end;
$$;

-- Cancels Mercado Pago orders that never got paid. Run by pg_cron and callable by the service role.
create or replace function public.expire_pending_payments()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select o.id from public.orders o, public.store_settings s
     where s.id = 1 and o.status = 'pending_payment'
       and o.created_at < now() - make_interval(mins => s.pending_payment_ttl_min)
  loop
    perform private.apply_transition(r.id, 'cancelled', 'Pago no completado', null);
    v_n := v_n + 1;
  end loop;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return v_n;
end;
$$;

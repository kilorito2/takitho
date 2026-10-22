-- Takitho · admin dashboard report and the "last admin" guard.

-- ---------------------------------------------------------------- admin_dashboard
-- "Ventas" = orders that are not cancelled and not still waiting for an online payment. Days are business days
-- (the 06:00 cutoff, ADR-0010) and hours are the shop's local hours, so a 00:45 order belongs to the night before.
create or replace function public.admin_dashboard(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_result jsonb;
begin
  if public.auth_role() is distinct from 'admin' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'INVALID_RANGE' using errcode = 'P0001';
  end if;

  select timezone into v_tz from public.store_settings where id = 1;

  with sold as (
    select o.*
    from public.orders o
    where o.business_date between p_from and p_to
      and o.status not in ('cancelled', 'pending_payment')
  ),
  totals as (
    select
      count(*)::int as orders,
      coalesce(sum(total), 0)::bigint as sales,
      coalesce(round(avg(total)), 0)::bigint as avg_ticket,
      coalesce(sum(tip), 0)::bigint as tips,
      coalesce(sum(delivery_fee), 0)::bigint as delivery_fees,
      coalesce(sum(discount), 0)::bigint as discounts
    from sold
  ),
  by_day as (
    select d::date as day, count(s.id)::int as orders, coalesce(sum(s.total), 0)::bigint as sales
    from generate_series(p_from, p_to, interval '1 day') d
    left join sold s on s.business_date = d::date
    group by d
    order by d
  ),
  top_products as (
    select i.name_snapshot as name, sum(i.quantity)::int as quantity, sum(i.line_total)::bigint as revenue
    from public.order_items i
    join sold s on s.id = i.order_id
    group by i.name_snapshot
    order by sum(i.quantity) desc, sum(i.line_total) desc, i.name_snapshot
    limit 8
  ),
  by_hour as (
    select h, count(s.id)::int as orders
    from generate_series(0, 23) h
    left join sold s on extract(hour from s.created_at at time zone v_tz)::int = h
    group by h
    order by h
  ),
  payment_mix as (
    select payment_method::text as method, count(*)::int as orders, sum(total)::bigint as sales
    from sold group by payment_method order by sum(total) desc
  ),
  by_type as (
    select type::text as type, count(*)::int as orders, sum(total)::bigint as sales
    from sold group by type order by sum(total) desc
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totals', (select to_jsonb(t) from totals t),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'orders', orders, 'sales', sales) order by day) from by_day), '[]'),
    'top_products', coalesce((select jsonb_agg(to_jsonb(p)) from top_products p), '[]'),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'orders', orders) order by h) from by_hour), '[]'),
    'payment_mix', coalesce((select jsonb_agg(to_jsonb(m)) from payment_mix m), '[]'),
    'by_type', coalesce((select jsonb_agg(to_jsonb(t)) from by_type t), '[]')
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.admin_dashboard(date, date) from public, anon;
grant execute on function public.admin_dashboard(date, date) to authenticated;

-- ---------------------------------------------------------------- last admin guard
-- The shop can never end up without someone able to administer it (SPEC: "último admin no puede quitarse el rol").
create or replace function private.guard_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'admin' or not new.is_active)
     and not exists (
       select 1 from public.profiles p where p.role = 'admin' and p.is_active and p.id <> old.id
     ) then
    raise exception 'LAST_ADMIN' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger profiles_guard_last_admin
  before update or delete on public.profiles
  for each row execute function private.guard_last_admin();

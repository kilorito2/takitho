-- Takitho · Row Level Security and explicit grants (docs/API.md §4 "Matriz RLS").
-- Two layers, both required: GRANT decides whether a role can touch a table at all (Data API exposure),
-- RLS decides which rows. Customers are anonymous (`anon`); `authenticated` is staff only (ADR-0003).

-- ---------------------------------------------------------------- RLS on everything
alter table public.store_settings enable row level security;
alter table public.opening_hours enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.combo_items enable row level security;
alter table public.modifier_groups enable row level security;
alter table public.modifiers enable row level security;
alter table public.product_modifier_groups enable row level security;
alter table public.delivery_zones enable row level security;
alter table public.coupons enable row level security;
alter table public.tables enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_modifiers enable row level security;
alter table public.order_status_history enable row level security;
alter table public.order_status_transitions enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.payment_events enable row level security;
alter table public.rate_limits enable row level security;
alter table public.order_counters enable row level security;
alter table public.admin_alerts enable row level security;

-- ---------------------------------------------------------------- public menu (anon + staff read)
-- The public only sees what is active. Staff see everything (needed to edit hidden items).
create policy menu_read_public on public.categories for select to anon using (is_active);
create policy menu_read_public on public.products for select to anon using (is_active);
create policy menu_read_public on public.modifier_groups for select to anon using (is_active);
create policy menu_read_public on public.modifiers for select to anon using (is_active);
create policy menu_read_public on public.delivery_zones for select to anon using (is_active);
create policy menu_read_public on public.opening_hours for select to anon using (is_active);
create policy menu_read_public on public.product_modifier_groups for select to anon using (true);
create policy menu_read_public on public.combo_items for select to anon using (true);
create policy menu_read_public on public.store_settings for select to anon using (true);

create policy menu_read_staff on public.categories for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.products for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.modifier_groups for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.modifiers for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.delivery_zones for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.opening_hours for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.product_modifier_groups for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.combo_items for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.store_settings for select to authenticated using ((select public.auth_role()) is not null);
create policy menu_read_staff on public.tables for select to authenticated using ((select public.auth_role()) is not null);

-- ---------------------------------------------------------------- admin write access
create policy admin_all on public.store_settings for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.opening_hours for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.categories for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.products for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.combo_items for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.modifier_groups for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.modifiers for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.product_modifier_groups for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.delivery_zones for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.coupons for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.tables for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
create policy admin_all on public.profiles for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');

-- Everybody signed in can read their own profile (the app needs the role after login).
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));

-- ---------------------------------------------------------------- orders: staff read only
-- There is NO insert/update/delete policy and no such grant: writes go through SQL functions only.
create policy staff_read on public.orders for select to authenticated using ((select public.auth_role()) is not null);
create policy staff_read on public.order_items for select to authenticated using ((select public.auth_role()) is not null);
create policy staff_read on public.order_item_modifiers for select to authenticated using ((select public.auth_role()) is not null);
create policy staff_read on public.order_status_history for select to authenticated using ((select public.auth_role()) is not null);
create policy staff_read on public.order_status_transitions for select to authenticated using ((select public.auth_role()) is not null);
create policy admin_read on public.coupon_redemptions for select to authenticated using ((select public.auth_role()) = 'admin');
create policy admin_read on public.payment_events for select to authenticated using ((select public.auth_role()) = 'admin');
create policy admin_all on public.admin_alerts for all to authenticated
  using ((select public.auth_role()) = 'admin') with check ((select public.auth_role()) = 'admin');
-- rate_limits and order_counters: RLS on and no policy → only the service role (BYPASSRLS) touches them.

-- ---------------------------------------------------------------- table grants (Data API exposure)
-- anon: read the active menu. Sensitive store settings (transfer data, kitchen timers, TTL) stay hidden.
grant select on public.categories, public.products, public.modifier_groups, public.modifiers,
  public.product_modifier_groups, public.combo_items, public.delivery_zones, public.opening_hours to anon;
grant select (
  id, name, tagline, address, maps_url, whatsapp, instagram, facebook, tiktok,
  prep_minutes, is_paused, is_closed_manually, accepts_scheduled_when_closed, max_schedule_days,
  pay_mp_enabled, pay_cash_enabled, pay_transfer_enabled, tip_presets, timezone, public_url, updated_at
) on public.store_settings to anon;

-- authenticated (staff): RLS narrows by role.
grant select, insert, update, delete on
  public.store_settings, public.opening_hours, public.categories, public.products, public.combo_items,
  public.modifier_groups, public.modifiers, public.product_modifier_groups, public.delivery_zones,
  public.coupons, public.tables, public.profiles, public.admin_alerts to authenticated;
grant select on
  public.orders, public.order_items, public.order_item_modifiers, public.order_status_history,
  public.order_status_transitions, public.coupon_redemptions, public.payment_events to authenticated;

-- service_role (Edge Functions): bypasses RLS but still needs privileges.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
-- (the history table uses an identity column; the grant above covers its sequence)

-- ---------------------------------------------------------------- function grants
-- Defaults were revoked from PUBLIC in the first migration; grant exactly what each role needs.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.auth_role() to anon, authenticated, service_role;

-- staff RPCs (role check inside)
grant execute on function public.transition_order(uuid, public.order_status, text) to authenticated;
grant execute on function public.mark_order_paid(uuid) to authenticated;
grant execute on function public.set_product_available(uuid, boolean) to authenticated;
grant execute on function public.set_modifier_available(uuid, boolean) to authenticated;
grant execute on function public.set_store_paused(boolean) to authenticated;

-- server-only RPCs
grant execute on function public.check_rate_limit(text, int, int) to service_role;
grant execute on function public.create_order_tx(jsonb) to service_role;
grant execute on function public.apply_payment_result(uuid, text, text, numeric, text, jsonb) to service_role;
grant execute on function public.expire_pending_payments() to service_role;

-- trigger helper
grant execute on function public.set_updated_at() to service_role;

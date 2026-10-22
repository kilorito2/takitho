-- Takitho · base: private schema, privilege defaults, enums, helpers.
-- Security model (docs/API.md §4, ADR-0003): nothing is reachable through the Data API unless a later
-- migration GRANTs it explicitly, and every table has RLS enabled.

-- Internal functions live outside the exposed schemas, so they are never reachable as RPC.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Stop new objects in `public` from being auto-granted (Supabase enforces this for all projects from 2026-10-30).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
alter default privileges for role postgres revoke execute on functions from public;

create type public.staff_role as enum ('admin', 'kitchen');
create type public.product_type as enum ('single', 'combo');
create type public.coupon_kind as enum ('percent', 'fixed', 'two_for_one');
create type public.coupon_scope as enum ('all', 'category', 'products');
create type public.order_type as enum ('pickup', 'delivery', 'dine_in');
create type public.order_status as enum (
  'pending_payment', 'received', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'
);
create type public.payment_method as enum ('mercado_pago', 'cash', 'transfer');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

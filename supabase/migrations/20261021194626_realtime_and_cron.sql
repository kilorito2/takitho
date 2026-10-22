-- Takitho · realtime feeds and scheduled jobs (ADR-0006, ADR-0007).

-- Customer tracking: a PUBLIC broadcast on topic "order:<public_token>" with a minimal payload.
-- The token is unguessable (ADR-0013), so the channel leaks nothing to third parties.
create or replace function private.notify_order_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'status', new.status,
      'payment_status', new.payment_status,
      'estimated_minutes', new.estimated_minutes,
      'at', now()
    ),
    'order_update',
    'order:' || new.public_token,
    false -- public channel
  );
  return null;
end;
$$;

create trigger orders_broadcast
  after insert or update of status, payment_status, estimated_minutes on public.orders
  for each row execute function private.notify_order_change();

-- Postgres Changes: kitchen/admin watch `orders` (RLS limits to staff); the menu watches products & co.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.orders, public.products, public.modifiers, public.categories, public.admin_alerts;
  end if;
end
$$;

-- Expire unpaid Mercado Pago orders every 5 minutes (skipped where pg_cron is unavailable, e.g. tests).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('expire-pending-payments', '*/5 * * * *', 'select public.expire_pending_payments()');
  end if;
end
$$;

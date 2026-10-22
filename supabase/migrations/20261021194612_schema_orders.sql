-- Takitho · orders and everything around them.
-- Orders are only ever written by Edge Functions (service role) through SQL functions (next migration).

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- human code ("TK-0427"); assigned by create_order_tx. Unique per business day.
  code text not null default ('PENDING-' || gen_random_uuid()::text),
  business_date date not null,
  -- unguessable secret that goes in the tracking URL (ADR-0013)
  public_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  -- idempotency (ADR-0008): the unique constraint decides the winner of concurrent retries
  idempotency_key uuid not null unique,
  request_hash text not null,
  status public.order_status not null default 'pending_payment',
  type public.order_type not null,
  customer_name text not null,
  customer_phone text not null,
  delivery_street text,
  delivery_number text,
  delivery_floor_apt text,
  delivery_references text,
  zone_id uuid references public.delivery_zones (id) on delete set null,
  table_id uuid references public.tables (id) on delete set null,
  scheduled_for timestamptz,
  subtotal int not null check (subtotal >= 0),
  delivery_fee int not null default 0 check (delivery_fee >= 0),
  discount int not null default 0 check (discount >= 0),
  tip int not null default 0 check (tip >= 0),
  total int not null check (total >= 0),
  coupon_id uuid references public.coupons (id) on delete set null,
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  mp_preference_id text,
  mp_payment_id text,
  cash_paid_with int check (cash_paid_with is null or cash_paid_with >= 0),
  paid_at timestamptz,
  cancel_reason text,
  estimated_minutes int,
  client_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_date, code),
  constraint orders_total_matches check (total = subtotal - discount + delivery_fee + tip),
  constraint orders_delivery_has_address check (type <> 'delivery' or (delivery_street is not null and delivery_number is not null)),
  constraint orders_dine_in_has_table check (type <> 'dine_in' or table_id is not null)
);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create index orders_mp_payment_idx on public.orders (mp_payment_id) where mp_payment_id is not null;
create index orders_phone_idx on public.orders (customer_phone);
create trigger orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- snapshots: renaming or repricing a product never rewrites history
  name_snapshot text not null,
  unit_price_snapshot int not null check (unit_price_snapshot >= 0),
  quantity int not null check (quantity between 1 and 20),
  line_total int not null check (line_total >= 0),
  note text,
  sort int not null default 0
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  modifier_id uuid references public.modifiers (id) on delete set null,
  name_snapshot text not null,
  price_delta_snapshot int not null default 0
);
create index order_item_modifiers_item_idx on public.order_item_modifiers (order_item_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid,
  reason text,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- Allowed transitions per order type (ADR-0005). Seeded from src/lib/orderStatus.ts (TRANSITION_ROWS).
create table public.order_status_transitions (
  order_type public.order_type not null,
  from_status public.order_status not null,
  to_status public.order_status not null,
  primary key (order_type, from_status, to_status)
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  phone text not null,
  discount int not null check (discount >= 0),
  created_at timestamptz not null default now(),
  unique (coupon_id, order_id)
);
create index coupon_redemptions_phone_idx on public.coupon_redemptions (coupon_id, phone);

-- Webhook idempotency (ADR-0007): one row per (payment, status) ever seen.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete set null,
  mp_payment_id text not null,
  mp_status text not null,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (mp_payment_id, mp_status)
);

-- Fixed-window rate limiting (ADR-0008)
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

-- Daily counter behind the "TK-0001" codes
create table public.order_counters (
  business_date date primary key,
  last_value int not null default 0
);

-- Things an admin must look at (late payments, refunds, amount mismatches)
create table public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('late_payment', 'refund', 'amount_mismatch', 'unknown_order')),
  order_id uuid references public.orders (id) on delete set null,
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index admin_alerts_open_idx on public.admin_alerts (created_at desc) where resolved_at is null;

-- Takitho · store configuration, staff profiles and the menu catalogue.

-- ---------------------------------------------------------------- store_settings (singleton)
create table public.store_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Takitho',
  tagline text not null default 'Tacos de barrio',
  address text not null default '[COMPLETAR]',
  maps_url text not null default '[COMPLETAR]',
  whatsapp text not null default '[COMPLETAR]',
  instagram text not null default '[COMPLETAR]',
  facebook text not null default '[COMPLETAR]',
  tiktok text not null default '[COMPLETAR]',
  transfer_alias text not null default '[COMPLETAR]',
  transfer_cbu text not null default '[COMPLETAR]',
  transfer_holder text not null default '[COMPLETAR]',
  prep_minutes int not null default 25 check (prep_minutes between 0 and 240),
  timer_warn_minutes int not null default 10 check (timer_warn_minutes > 0),
  timer_late_minutes int not null default 20,
  is_paused boolean not null default false,
  is_closed_manually boolean not null default false,
  accepts_scheduled_when_closed boolean not null default false,
  max_schedule_days int not null default 2 check (max_schedule_days between 0 and 14),
  pay_mp_enabled boolean not null default true,
  pay_cash_enabled boolean not null default true,
  pay_transfer_enabled boolean not null default true,
  -- percentage presets offered as tip (0 = no tip)
  tip_presets int[] not null default '{0,5,10}',
  timezone text not null default 'America/Argentina/Buenos_Aires',
  pending_payment_ttl_min int not null default 30 check (pending_payment_ttl_min between 5 and 1440),
  public_url text not null default '',
  updated_at timestamptz not null default now(),
  constraint store_settings_timers check (timer_late_minutes > timer_warn_minutes)
);
insert into public.store_settings (id) values (1);
create trigger store_settings_updated before update on public.store_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- opening_hours
-- One row per shift. closes_at <= opens_at means the shift ends the next day (ADR-0010).
create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  opens_at time not null,
  closes_at time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekday, opens_at)
);
create trigger opening_hours_updated before update on public.opening_hours
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- profiles (staff only)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.staff_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- catalogue
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  type public.product_type not null default 'single',
  name text not null,
  slug text not null unique,
  description text not null default '',
  unit_label text not null default '',
  -- whole ARS pesos
  price int not null check (price >= 0),
  image_public_id text,
  spicy_level smallint not null default 0 check (spicy_level between 0 and 3),
  tags text[] not null default '{}',
  is_available boolean not null default true,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_sort_idx on public.products (category_id, sort);
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- Fixed composition of a combo (shown to the customer and printed for the kitchen).
create table public.combo_items (
  combo_id uuid not null references public.products (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  primary key (combo_id, product_id),
  check (combo_id <> product_id)
);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select >= 1),
  is_required boolean not null default false,
  sort int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modifier_groups_range check (max_select >= min_select),
  constraint modifier_groups_required check (not is_required or min_select >= 1)
);
create trigger modifier_groups_updated before update on public.modifier_groups
  for each row execute function public.set_updated_at();

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  name text not null,
  price_delta int not null default 0,
  is_available boolean not null default true,
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index modifiers_group_idx on public.modifiers (group_id, sort);
create trigger modifiers_updated before update on public.modifiers
  for each row execute function public.set_updated_at();

create table public.product_modifier_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id uuid not null references public.modifier_groups (id) on delete cascade,
  sort int not null default 0,
  primary key (product_id, group_id)
);

-- ---------------------------------------------------------------- delivery, promos, tables
create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhoods text[] not null default '{}',
  fee int not null default 0 check (fee >= 0),
  min_order int not null default 0 check (min_order >= 0),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger delivery_zones_updated before update on public.delivery_zones
  for each row execute function public.set_updated_at();

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text,
  label text not null,
  kind public.coupon_kind not null,
  value int not null default 0 check (value >= 0),
  scope public.coupon_scope not null default 'all',
  scope_ids uuid[] not null default '{}',
  -- 0 = Sunday … 6 = Saturday, evaluated on the business day. Empty = every day.
  weekdays smallint[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  uses_count int not null default 0 check (uses_count >= 0),
  max_uses_per_phone int check (max_uses_per_phone is null or max_uses_per_phone > 0),
  min_purchase int not null default 0 check (min_purchase >= 0),
  -- automatic promo (no code needed), shown on the home page
  auto_apply boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_code_or_auto check (code is not null or auto_apply),
  constraint coupons_code_upper check (code is null or code = upper(btrim(code))),
  constraint coupons_percent_range check (kind <> 'percent' or value between 1 and 100)
);
create unique index coupons_code_idx on public.coupons (lower(code)) where code is not null;
create trigger coupons_updated before update on public.coupons
  for each row execute function public.set_updated_at();

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  number int not null unique check (number > 0),
  label text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

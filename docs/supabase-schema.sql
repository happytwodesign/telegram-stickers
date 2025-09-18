-- Supabase schema for the Telegram AI sticker pack bot
-- Run this script inside the Supabase SQL editor (public schema)

-- 1) Users coming from Telegram
create table public.telegram_profiles (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint unique not null,
  tg_username text,
  first_name text,
  language_code text,
  is_premium boolean default false,
  country_code text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

-- 2) Styles/themes your bot offers
create table public.styles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  title text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) Photo uploads (source images)
create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null references public.telegram_profiles(tg_user_id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  width int,
  height int,
  sha256 bytea,
  status text not null default 'ready',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.uploads (tg_user_id, created_at desc);

-- 4) Orders (one per sticker pack purchase attempt)
create type order_status as enum ('pending','paid','failed','refunded','expired');
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null references public.telegram_profiles(tg_user_id) on delete cascade,
  style_id uuid not null references public.styles(id),
  price_stars int not null default 300,
  invoice_link text,
  invoice_payload jsonb,
  status order_status not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.orders (tg_user_id, created_at desc);

-- 5) Payments via Telegram Stars
create type payment_status as enum ('pending','succeeded','failed','refunded');
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  tg_charge_id text,
  amount_stars int not null,
  status payment_status not null,
  provider_data jsonb,
  created_at timestamptz not null default now()
);
create index on public.payments (order_id);

-- 6) Generations (the AI job)
create type gen_status as enum ('queued','processing','succeeded','failed');
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  input_upload_id uuid not null references public.uploads(id) on delete restrict,
  engine text not null,
  prompt text not null,
  params jsonb,
  status gen_status not null default 'queued',
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.generations (order_id);

-- 7) Individual sticker images
create type sticker_format as enum ('png','webp','webm','tgs');
create table public.stickers (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  emotion text,
  storage_path text not null,
  file_size_bytes int,
  width int,
  height int,
  format sticker_format not null default 'png',
  sha256 bytea,
  created_at timestamptz not null default now()
);
create index on public.stickers (generation_id);

-- 8) Sticker set created in Telegram
create type set_status as enum ('creating','ready','failed');
create table public.sticker_sets (
  id uuid primary key default gen_random_uuid(),
  tg_user_id bigint not null references public.telegram_profiles(tg_user_id) on delete cascade,
  set_name text unique,
  title text not null,
  type text not null default 'static',
  link text,
  status set_status not null default 'creating',
  created_at timestamptz not null default now(),
  ready_at timestamptz
);

-- 9) Mapping between your stickers and the TG sticker set
create table public.sticker_set_items (
  id uuid primary key default gen_random_uuid(),
  sticker_set_id uuid not null references public.sticker_sets(id) on delete cascade,
  sticker_id uuid not null references public.stickers(id) on delete cascade,
  emoji text default '🙂'
);

-- 10) Webhook audit (Telegram updates, payment events)
create table public.webhook_events (
  id bigint generated always as identity primary key,
  source text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  order_id uuid,
  tg_user_id bigint
);
create index on public.webhook_events (received_at desc);

-- 11) Minimal usage ledger (optional throttle/anti-abuse)
create table public.usage_ledger (
  id bigint generated always as identity primary key,
  tg_user_id bigint not null,
  kind text not null,
  units int not null default 1,
  created_at timestamptz not null default now()
);
create index on public.usage_ledger (tg_user_id, created_at desc);

-- Storage and RLS notes
-- Create private buckets: uploads, stickers, exports
-- Remember to enable RLS on all tables and add service-role or user policies as needed

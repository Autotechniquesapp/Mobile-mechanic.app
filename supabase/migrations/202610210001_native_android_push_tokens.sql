-- FCM registration tokens for installed native Android application.
-- Managed solely by the push-notifications Edge Function with service-role privileges.
-- Do NOT grant direct client access: tokens can receive customer-identifying alerts.
create table if not exists public.native_push_tokens (
  token text primary key check (length(token) between 20 and 4096),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'android' check (platform = 'android'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists native_push_tokens_shop_active
  on public.native_push_tokens (shop_id,active);
create index if not exists native_push_tokens_user
  on public.native_push_tokens (user_id);
alter table public.native_push_tokens enable row level security;
revoke all on public.native_push_tokens from anon, authenticated;
-- service_role bypasses RLS. No public policies are intentionally provided.

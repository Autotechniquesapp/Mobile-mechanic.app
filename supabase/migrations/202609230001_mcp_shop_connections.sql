create table if not exists public.mcp_connector_catalog (
  provider text primary key,
  display_name text not null,
  category text not null default 'Business tools',
  server_url text not null,
  homepage_url text,
  enabled boolean not null default false,
  trust_label text not null default 'approved',
  requested_scopes text[] not null default '{}',
  allowed_tools text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_mcp_connections (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(shop_id) on delete cascade,
  provider text not null references public.mcp_connector_catalog(provider) on delete restrict,
  status text not null default 'not_connected'
    check (status in ('not_connected','connecting','connected','needs_attention','disabled')),
  server_url text not null,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  token_type text,
  scope text,
  client_id text,
  client_secret text,
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  last_checked_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, provider)
);

create table if not exists public.mcp_oauth_states (
  state text primary key,
  shop_id text not null references public.shops(shop_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null references public.mcp_connector_catalog(provider) on delete cascade,
  code_verifier text not null,
  redirect_uri text not null,
  client_id text not null,
  client_secret text,
  token_endpoint_auth_method text,
  authorization_server text not null,
  authorization_endpoint text not null,
  token_endpoint text not null,
  resource text not null,
  scope text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

alter table public.mcp_connector_catalog enable row level security;
alter table public.shop_mcp_connections enable row level security;
alter table public.mcp_oauth_states enable row level security;

revoke all on table public.mcp_connector_catalog from anon, authenticated;
revoke all on table public.shop_mcp_connections from anon, authenticated;
revoke all on table public.mcp_oauth_states from anon, authenticated;

insert into public.mcp_connector_catalog
(provider, display_name, category, server_url, homepage_url, enabled, trust_label, notes)
values
(
  'quickbooks_mcp',
  'QuickBooks Online',
  'Accounting',
  'https://qbo-connector.meridian.pilot.com/mcp',
  'https://qbo-connector.meridian.pilot.com/',
  true,
  'hosted_mcp',
  'Hosted MCP connector by Meridian / Pilot.com. Each shop authorizes its own QuickBooks access.'
)
on conflict (provider) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  server_url = excluded.server_url,
  homepage_url = excluded.homepage_url,
  enabled = excluded.enabled,
  trust_label = excluded.trust_label,
  notes = excluded.notes,
  updated_at = now();

create index if not exists shop_mcp_connections_shop_idx
  on public.shop_mcp_connections(shop_id, status);

create index if not exists mcp_oauth_states_expiry_idx
  on public.mcp_oauth_states(expires_at);

create index if not exists shop_mcp_connections_provider_idx
  on public.shop_mcp_connections(provider);
create index if not exists mcp_oauth_states_shop_idx
  on public.mcp_oauth_states(shop_id);
create index if not exists mcp_oauth_states_user_idx
  on public.mcp_oauth_states(user_id);
create index if not exists mcp_oauth_states_provider_idx
  on public.mcp_oauth_states(provider);


create policy "mcp catalog service only"
on public.mcp_connector_catalog
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "mcp connections service only"
on public.shop_mcp_connections
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "mcp oauth states service only"
on public.mcp_oauth_states
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

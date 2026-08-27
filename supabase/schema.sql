-- Mobile Mechanic AI — initial multi-tenant schema
-- Run in a NEW Supabase project before adding production data.
-- No owner password or production secret belongs in this file.

create extension if not exists pgcrypto;

do $$ begin create type public.shop_plan as enum ('solo', 'shop', 'pro'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shop_status as enum ('trial', 'active', 'past_due', 'suspended', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.billing_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'comped', 'not_connected'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shop_role as enum ('shop_owner', 'manager', 'technician', 'service_writer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_status as enum ('invited', 'active', 'disabled', 'removed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.job_status as enum ('intake', 'workup', 'scheduled', 'en_route', 'arrived', 'diagnosing', 'waiting_authorization', 'getting_parts', 'repair_underway', 'ready', 'completed', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estimate_status as enum ('draft', 'sent', 'viewed', 'partially_approved', 'approved', 'declined', 'superseded', 'expired'); exception when duplicate_object then null; end $$;
do $$ begin create type public.invoice_status as enum ('draft', 'sent', 'partially_paid', 'paid', 'void', 'refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.admin_role as enum ('platform_owner', 'billing_admin', 'support_admin', 'operations_admin', 'technical_admin', 'read_only_admin'); exception when duplicate_object then null; end $$;
do $$ begin create type public.admin_status as enum ('active', 'disabled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.carfax_status as enum ('ready', 'submitted', 'failed', 'not_connected'); exception when duplicate_object then null; end $$;

create or replace function public.make_shop_id()
returns text
language sql
volatile
as $$
  select 'shp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table if not exists public.shops (
  id text primary key default public.make_shop_id(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  phone text not null default '',
  address text not null default '',
  service_area text not null default '',
  logo_url text,
  plan public.shop_plan not null default 'solo',
  status public.shop_status not null default 'trial',
  billing_status public.billing_status not null default 'trialing',
  trial_start timestamptz not null default now(),
  trial_end timestamptz not null default (now() + interval '60 days'),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  labor_rate numeric(10,2) not null default 0 check (labor_rate >= 0),
  tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  minimum_labor numeric(10,2) not null default 0,
  diagnostic_fee numeric(10,2) not null default 0,
  service_call_fee numeric(10,2) not null default 0,
  mileage_fee numeric(10,2) not null default 0,
  free_service_radius numeric(10,2) not null default 0,
  after_hours_rate numeric(10,2) not null default 0,
  fleet_labor_rate numeric(10,2) not null default 0,
  parts_markup numeric(8,3) not null default 0,
  deposit_mode text not null default 'parts_cost' check (deposit_mode in ('parts_cost', 'percentage', 'flat', 'custom')),
  deposit_value numeric(10,2) not null default 0,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_members (
  shop_id text not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.shop_role not null,
  status public.member_status not null default 'active',
  permissions jsonb not null default '{}'::jsonb,
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);

create table if not exists public.shop_invitations (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  email text not null,
  name text not null,
  role public.shop_role not null,
  invited_by uuid not null references auth.users(id),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shop_invitations_active_email_unique
  on public.shop_invitations(shop_id, lower(email))
  where status = 'sent';

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  name text not null,
  phone text not null default '',
  email text,
  address text not null default '',
  preferred_contact text not null default 'text' check (preferred_contact in ('text', 'call', 'email')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id)
);

create index if not exists customers_shop_phone_idx on public.customers(shop_id, phone);
create index if not exists customers_shop_email_idx on public.customers(shop_id, lower(email));

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  customer_id uuid not null,
  year text not null,
  make text not null,
  model text not null,
  trim text not null default '',
  engine text not null default '',
  drivetrain text not null default '',
  vin text,
  license_plate text,
  mileage bigint not null default 0 check (mileage >= 0),
  vehicle_data_source text,
  vehicle_data_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint vehicles_customer_tenant_fk foreign key (shop_id, customer_id)
    references public.customers(shop_id, id) on delete cascade
);

create index if not exists vehicles_customer_idx on public.vehicles(shop_id, customer_id);
create index if not exists vehicles_plate_idx on public.vehicles(shop_id, license_plate);
create unique index if not exists vehicles_shop_vin_unique
  on public.vehicles(shop_id, upper(vin))
  where vin is not null and btrim(vin) <> '';

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  customer_id uuid not null,
  vehicle_id uuid not null,
  assigned_user_id uuid references auth.users(id),
  public_reference text not null unique default ('MMI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9))),
  service_type text not null default 'repair' check (service_type in ('repair', 'pre_purchase', 'roadside', 'fleet')),
  status public.job_status not null default 'intake',
  customer_states text not null,
  location_text text not null default '',
  latitude numeric(10,7),
  longitude numeric(10,7),
  availability_date date,
  availability_window text not null default '',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  seller_name text not null default '',
  seller_phone text not null default '',
  vehicle_location text not null default '',
  job_type text not null default 'standard' check (job_type in ('standard', 'warranty', 'comeback', 'recheck')),
  original_job_id uuid,
  carfax_status public.carfax_status not null default 'not_connected',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint jobs_customer_tenant_fk foreign key (shop_id, customer_id)
    references public.customers(shop_id, id) on delete restrict,
  constraint jobs_vehicle_tenant_fk foreign key (shop_id, vehicle_id)
    references public.vehicles(shop_id, id) on delete restrict,
  constraint jobs_original_job_tenant_fk foreign key (shop_id, original_job_id)
    references public.jobs(shop_id, id) on delete restrict
);

create index if not exists jobs_shop_status_idx on public.jobs(shop_id, status, created_at desc);
create index if not exists jobs_vehicle_idx on public.jobs(shop_id, vehicle_id, created_at desc);

create table if not exists public.ai_workups (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  job_id uuid not null,
  requested_by uuid not null,
  mode text not null check (mode in ('workup', 'second_opinion', 'before_replace', 'customer_explanation', 'inspection_summary')),
  model text,
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  advisory_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint ai_workups_job_tenant_fk foreign key (shop_id, job_id)
    references public.jobs(shop_id, id) on delete cascade,
  constraint ai_workups_requester_tenant_fk foreign key (shop_id, requested_by)
    references public.shop_members(shop_id, user_id) on delete restrict
);

create table if not exists public.technician_findings (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  job_id uuid not null,
  technician_user_id uuid not null,
  finding_type text not null default 'note' check (finding_type in ('note', 'code', 'test', 'measurement', 'scan', 'photo', 'video', 'before', 'after', 'safety')),
  repair_item_id uuid,
  content text not null default '',
  value jsonb not null default '{}'::jsonb,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint technician_findings_job_tenant_fk foreign key (shop_id, job_id)
    references public.jobs(shop_id, id) on delete cascade,
  constraint technician_findings_member_tenant_fk foreign key (shop_id, technician_user_id)
    references public.shop_members(shop_id, user_id) on delete restrict
);

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  job_id uuid not null,
  version integer not null default 1 check (version > 0),
  status public.estimate_status not null default 'draft',
  public_token_hash text unique,
  expires_at timestamptz,
  customer_message text not null default '',
  internal_cost numeric(12,2) not null default 0,
  internal_projected_profit numeric(12,2) not null default 0,
  sent_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, version),
  unique (shop_id, id),
  constraint estimates_job_tenant_fk foreign key (shop_id, job_id)
    references public.jobs(shop_id, id) on delete cascade,
  constraint estimates_creator_tenant_fk foreign key (shop_id, created_by)
    references public.shop_members(shop_id, user_id) on delete restrict
);

create table if not exists public.estimate_options (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  estimate_id uuid not null,
  option_name text not null check (option_name in ('single', 'good', 'better', 'best')),
  title text not null,
  description text not null default '',
  parts jsonb not null default '[]'::jsonb,
  labor jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  deposit_due numeric(12,2) not null default 0,
  warranty_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, option_name),
  unique (shop_id, id),
  constraint estimate_options_estimate_tenant_fk foreign key (shop_id, estimate_id)
    references public.estimates(shop_id, id) on delete cascade
);

create table if not exists public.estimate_authorizations (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  estimate_id uuid not null,
  estimate_option_id uuid,
  estimate_version integer not null,
  decision text not null check (decision in ('approved', 'declined', 'partial')),
  approved_items jsonb not null default '[]'::jsonb,
  declined_items jsonb not null default '[]'::jsonb,
  exact_price numeric(12,2),
  customer_name text not null,
  signature_storage_path text,
  ip_address inet,
  user_agent text,
  authorized_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint estimate_authorizations_estimate_tenant_fk foreign key (shop_id, estimate_id)
    references public.estimates(shop_id, id) on delete restrict,
  constraint estimate_authorizations_option_tenant_fk foreign key (shop_id, estimate_option_id)
    references public.estimate_options(shop_id, id) on delete restrict
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  job_id uuid not null,
  estimate_id uuid,
  invoice_number text not null,
  status public.invoice_status not null default 'draft',
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  deposit_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  payment_provider text,
  payment_reference text,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, invoice_number),
  unique (shop_id, id),
  constraint invoices_job_tenant_fk foreign key (shop_id, job_id)
    references public.jobs(shop_id, id) on delete restrict,
  constraint invoices_estimate_tenant_fk foreign key (shop_id, estimate_id)
    references public.estimates(shop_id, id) on delete restrict
);

create table if not exists public.core_charges (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  job_id uuid not null,
  part_name text not null,
  supplier text not null default '',
  amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'returned', 'refunded', 'waived')),
  returned_at timestamptz,
  refund_amount numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint core_charges_job_tenant_fk foreign key (shop_id, job_id)
    references public.jobs(shop_id, id) on delete cascade
);

create table if not exists public.receipt_vault (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  job_id uuid,
  vehicle_id uuid,
  supplier text not null default '',
  part_number text not null default '',
  purchase_date date,
  warranty_text text not null default '',
  storage_path text not null,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint receipt_vault_job_tenant_fk foreign key (shop_id, job_id)
    references public.jobs(shop_id, id) on delete cascade,
  constraint receipt_vault_vehicle_tenant_fk foreign key (shop_id, vehicle_id)
    references public.vehicles(shop_id, id) on delete cascade,
  constraint receipt_vault_uploader_tenant_fk foreign key (shop_id, uploaded_by)
    references public.shop_members(shop_id, user_id) on delete restrict
);

create table if not exists public.warranty_cases (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  job_id uuid not null,
  original_job_id uuid not null,
  case_type text not null check (case_type in ('parts_warranty', 'labor_warranty', 'unrelated_failure', 'diagnostic_follow_up', 'comeback', 'recheck')),
  notes text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved', 'denied')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, id),
  constraint warranty_cases_job_tenant_fk foreign key (shop_id, job_id)
    references public.jobs(shop_id, id) on delete cascade,
  constraint warranty_cases_original_job_tenant_fk foreign key (shop_id, original_job_id)
    references public.jobs(shop_id, id) on delete restrict
);

create table if not exists public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  shop_id text references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  acceptance_context text not null default 'shop_signup',
  ip_address inet,
  unique (user_id, terms_version, acceptance_context)
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.admin_role not null,
  status public.admin_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_shop_access_grants (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.platform_admins(user_id) on delete cascade,
  shop_id text not null references public.shops(id) on delete cascade,
  reason text not null,
  granted_by uuid not null references public.platform_admins(user_id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_activity_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references public.platform_admins(user_id),
  admin_role public.admin_role not null,
  action text not null,
  affected_shop_id text references public.shops(id),
  details jsonb not null default '{}'::jsonb,
  requires_reauthentication boolean not null default false,
  occurred_at timestamptz not null default now()
);

create table if not exists public.shop_integrations (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(id) on delete cascade,
  provider text not null,
  status text not null default 'not_connected' check (status in ('not_connected', 'connected', 'error', 'disabled')),
  public_metadata jsonb not null default '{}'::jsonb,
  -- Secret credentials are NOT stored here; use server-side secret storage/environment variables.
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, provider)
);

create or replace function public.is_shop_member(target_shop_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shop_members sm
    where sm.shop_id = target_shop_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
  )
$$;

create or replace function public.has_shop_role(target_shop_id text, allowed_roles public.shop_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shop_members sm
    where sm.shop_id = target_shop_id
      and sm.user_id = auth.uid()
      and sm.status = 'active'
      and sm.role = any(allowed_roles)
  )
$$;

create or replace function public.is_active_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid() and pa.status = 'active'
  )
$$;

create or replace function public.has_platform_role(allowed_roles public.admin_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = auth.uid()
      and pa.status = 'active'
      and pa.role = any(allowed_roles)
  )
$$;

create or replace function public.has_admin_shop_grant(target_shop_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_shop_access_grants g
    join public.platform_admins pa on pa.user_id = g.admin_user_id and pa.status = 'active'
    where g.admin_user_id = auth.uid()
      and g.shop_id = target_shop_id
      and g.revoked_at is null
      and g.expires_at > now()
  )
$$;

create or replace function public.can_access_shop(target_shop_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_shop_member(target_shop_id) or public.has_admin_shop_grant(target_shop_id)
$$;

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_invitations enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.jobs enable row level security;
alter table public.ai_workups enable row level security;
alter table public.technician_findings enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_options enable row level security;
alter table public.estimate_authorizations enable row level security;
alter table public.invoices enable row level security;
alter table public.core_charges enable row level security;
alter table public.receipt_vault enable row level security;
alter table public.warranty_cases enable row level security;
alter table public.terms_acceptances enable row level security;
alter table public.platform_admins enable row level security;
alter table public.admin_shop_access_grants enable row level security;
alter table public.admin_activity_log enable row level security;
alter table public.shop_integrations enable row level security;

drop policy if exists shops_select on public.shops;
create policy shops_select on public.shops for select using (
  public.can_access_shop(id) or public.is_active_platform_admin()
);
drop policy if exists shops_update on public.shops;
create policy shops_update on public.shops for update using (public.has_shop_role(id, array['shop_owner','manager']::public.shop_role[])) with check (public.has_shop_role(id, array['shop_owner','manager']::public.shop_role[]));

drop policy if exists shop_members_select on public.shop_members;
create policy shop_members_select on public.shop_members for select using (public.can_access_shop(shop_id));
drop policy if exists shop_members_write on public.shop_members;
create policy shop_members_write on public.shop_members for all using (public.has_shop_role(shop_id, array['shop_owner','manager']::public.shop_role[])) with check (public.has_shop_role(shop_id, array['shop_owner','manager']::public.shop_role[]));

drop policy if exists shop_invitations_access on public.shop_invitations;
create policy shop_invitations_access on public.shop_invitations for all using (public.has_shop_role(shop_id, array['shop_owner','manager']::public.shop_role[])) with check (public.has_shop_role(shop_id, array['shop_owner','manager']::public.shop_role[]));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'customers','vehicles','jobs','ai_workups','technician_findings','estimates','estimate_options',
    'estimate_authorizations','invoices','core_charges','receipt_vault','warranty_cases','shop_integrations'
  ]
  loop
    execute format('drop policy if exists tenant_select on public.%I', table_name);
    execute format('create policy tenant_select on public.%I for select using (public.can_access_shop(shop_id))', table_name);
    execute format('drop policy if exists tenant_insert on public.%I', table_name);
    execute format('create policy tenant_insert on public.%I for insert with check (public.is_shop_member(shop_id))', table_name);
    execute format('drop policy if exists tenant_update on public.%I', table_name);
    execute format('create policy tenant_update on public.%I for update using (public.is_shop_member(shop_id)) with check (public.is_shop_member(shop_id))', table_name);
    execute format('drop policy if exists tenant_delete on public.%I', table_name);
    execute format('create policy tenant_delete on public.%I for delete using (public.has_shop_role(shop_id, array[''shop_owner'',''manager'']::public.shop_role[]))', table_name);
  end loop;
end $$;

drop policy if exists terms_own on public.terms_acceptances;
create policy terms_own on public.terms_acceptances for select using (user_id = auth.uid() or public.can_access_shop(shop_id));
drop policy if exists terms_insert on public.terms_acceptances;
create policy terms_insert on public.terms_acceptances for insert with check (user_id = auth.uid());

drop policy if exists platform_admins_self_or_owner on public.platform_admins;
create policy platform_admins_self_or_owner on public.platform_admins for select using (
  user_id = auth.uid()
  or public.has_platform_role(array['platform_owner']::public.admin_role[])
);

drop policy if exists platform_owner_manage_admins on public.platform_admins;
create policy platform_owner_manage_admins on public.platform_admins for all using (
  public.has_platform_role(array['platform_owner']::public.admin_role[])
) with check (
  public.has_platform_role(array['platform_owner']::public.admin_role[])
);

drop policy if exists admin_grants_visible on public.admin_shop_access_grants;
create policy admin_grants_visible on public.admin_shop_access_grants for select using (admin_user_id = auth.uid() or public.is_active_platform_admin());
drop policy if exists admin_grants_owner_ops on public.admin_shop_access_grants;
create policy admin_grants_owner_ops on public.admin_shop_access_grants for all using (
  public.has_platform_role(array['platform_owner','operations_admin']::public.admin_role[])
) with check (
  public.has_platform_role(array['platform_owner','operations_admin']::public.admin_role[])
);

drop policy if exists admin_activity_visible on public.admin_activity_log;
create policy admin_activity_visible on public.admin_activity_log for select using (public.is_active_platform_admin());
drop policy if exists admin_activity_insert on public.admin_activity_log;
create policy admin_activity_insert on public.admin_activity_log for insert with check (admin_user_id = auth.uid() and public.is_active_platform_admin());

drop policy if exists shop_integrations_technical_admin_update on public.shop_integrations;
create policy shop_integrations_technical_admin_update on public.shop_integrations for update using (
  public.has_admin_shop_grant(shop_id)
  and public.has_platform_role(array['platform_owner','technical_admin']::public.admin_role[])
) with check (
  public.has_admin_shop_grant(shop_id)
  and public.has_platform_role(array['platform_owner','technical_admin']::public.admin_role[])
);

create or replace function public.bootstrap_shop(
  p_name text,
  p_slug text,
  p_phone text,
  p_address text,
  p_service_area text,
  p_plan text,
  p_labor_rate numeric,
  p_tax_rate numeric,
  p_service_call_fee numeric,
  p_parts_markup numeric,
  p_terms_version text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  new_shop_id text;
  requested_plan public.shop_plan;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid shop slug'; end if;
  if exists (select 1 from public.shop_members where user_id = auth.uid() and status = 'active') then
    select shop_id into new_shop_id from public.shop_members where user_id = auth.uid() and status = 'active' order by created_at limit 1;
    return new_shop_id;
  end if;
  requested_plan := case when p_plan in ('solo','shop','pro') then p_plan::public.shop_plan else 'solo'::public.shop_plan end;
  insert into public.shops (
    slug, name, owner_user_id, phone, address, service_area, plan, labor_rate, tax_rate, service_call_fee, parts_markup
  ) values (
    lower(p_slug), trim(p_name), auth.uid(), coalesce(p_phone,''), coalesce(p_address,''), coalesce(p_service_area,''), requested_plan,
    greatest(coalesce(p_labor_rate,0),0), greatest(coalesce(p_tax_rate,0),0), greatest(coalesce(p_service_call_fee,0),0), greatest(coalesce(p_parts_markup,0),0)
  ) returning id into new_shop_id;
  insert into public.shop_members (shop_id, user_id, role, status) values (new_shop_id, auth.uid(), 'shop_owner', 'active');
  insert into public.terms_acceptances (shop_id, user_id, terms_version, acceptance_context)
    values (new_shop_id, auth.uid(), coalesce(nullif(p_terms_version,''),'unknown'), 'shop_signup')
    on conflict do nothing;
  return new_shop_id;
end
$$;

grant execute on function public.bootstrap_shop(text,text,text,text,text,text,numeric,numeric,numeric,numeric,text) to authenticated;

create or replace function public.public_shop_by_slug(p_slug text)
returns table(name text, slug text, phone text, logo_url text, service_area text)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, s.slug, s.phone, s.logo_url, s.service_area
  from public.shops s
  where s.slug = lower(p_slug)
    and s.status in ('trial','active','past_due')
  limit 1
$$;

grant execute on function public.public_shop_by_slug(text) to anon, authenticated;

create or replace function public.create_public_intake(p_shop_slug text, p_payload jsonb)
returns table(job_id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_shop public.shops%rowtype;
  customer_data jsonb := p_payload->'customer';
  vehicle_data jsonb := p_payload->'vehicle';
  request_data jsonb := p_payload->'request';
  target_customer_id uuid;
  target_vehicle_id uuid;
  target_job_id uuid;
  target_reference text;
  normalized_phone text;
  normalized_email text;
begin
  select * into target_shop from public.shops where slug = lower(p_shop_slug) and status in ('trial','active','past_due') limit 1;
  if target_shop.id is null then raise exception 'Shop intake is unavailable'; end if;
  normalized_phone := regexp_replace(coalesce(customer_data->>'phone',''), '\D', '', 'g');
  normalized_email := lower(nullif(customer_data->>'email',''));
  select c.id into target_customer_id
  from public.customers c
  where c.shop_id = target_shop.id
    and ((normalized_phone <> '' and regexp_replace(c.phone, '\D', '', 'g') = normalized_phone)
      or (normalized_email is not null and lower(c.email) = normalized_email))
  order by c.updated_at desc limit 1;
  if target_customer_id is null then
    insert into public.customers (shop_id, name, phone, email, address, preferred_contact)
    values (target_shop.id, customer_data->>'name', customer_data->>'phone', normalized_email, coalesce(customer_data->>'address',''), coalesce(customer_data->>'preferred_contact','text'))
    returning id into target_customer_id;
  else
    update public.customers set
      name = coalesce(nullif(customer_data->>'name',''), name),
      phone = coalesce(nullif(customer_data->>'phone',''), phone),
      email = coalesce(normalized_email, email),
      address = coalesce(nullif(customer_data->>'address',''), address),
      preferred_contact = coalesce(nullif(customer_data->>'preferred_contact',''), preferred_contact),
      updated_at = now()
    where id = target_customer_id;
  end if;
  if nullif(vehicle_data->>'vin','') is not null then
    select v.id into target_vehicle_id from public.vehicles v where v.shop_id = target_shop.id and v.vin = upper(vehicle_data->>'vin') limit 1;
  end if;
  if target_vehicle_id is null then
    insert into public.vehicles (shop_id, customer_id, year, make, model, trim, engine, drivetrain, vin, license_plate, mileage)
    values (
      target_shop.id, target_customer_id, vehicle_data->>'year', vehicle_data->>'make', vehicle_data->>'model',
      coalesce(vehicle_data->>'trim',''), coalesce(vehicle_data->>'engine',''), coalesce(vehicle_data->>'drivetrain',''),
      upper(nullif(vehicle_data->>'vin','')), upper(nullif(vehicle_data->>'plate','')), greatest(coalesce((vehicle_data->>'mileage')::bigint,0),0)
    ) returning id into target_vehicle_id;
  else
    update public.vehicles set customer_id = target_customer_id, mileage = greatest(mileage, coalesce((vehicle_data->>'mileage')::bigint,0)), updated_at = now() where id = target_vehicle_id;
  end if;
  insert into public.jobs (
    shop_id, customer_id, vehicle_id, service_type, customer_states, location_text, latitude, longitude,
    availability_date, availability_window, seller_name, seller_phone, vehicle_location
  ) values (
    target_shop.id, target_customer_id, target_vehicle_id,
    case when p_payload->>'service_type' in ('repair','pre_purchase','roadside','fleet') then p_payload->>'service_type' else 'repair' end,
    request_data->>'customer_states', coalesce(request_data->>'address',''),
    nullif(request_data->>'latitude','')::numeric, nullif(request_data->>'longitude','')::numeric,
    nullif(request_data->>'availability_date','')::date, coalesce(request_data->>'availability_window',''),
    coalesce(request_data->>'seller_name',''), coalesce(request_data->>'seller_phone',''), coalesce(request_data->>'vehicle_location','')
  ) returning id, public_reference into target_job_id, target_reference;
  return query select target_job_id, target_reference;
end
$$;

revoke all on function public.create_public_intake(text,jsonb) from public, anon, authenticated;
grant execute on function public.create_public_intake(text,jsonb) to service_role;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.shops to authenticated;
grant select, insert, update, delete on
  public.shop_members,
  public.shop_invitations,
  public.customers,
  public.vehicles,
  public.jobs,
  public.ai_workups,
  public.technician_findings,
  public.estimates,
  public.estimate_options,
  public.estimate_authorizations,
  public.invoices,
  public.core_charges,
  public.receipt_vault,
  public.warranty_cases,
  public.terms_acceptances,
  public.platform_admins,
  public.admin_shop_access_grants,
  public.admin_activity_log,
  public.shop_integrations
to authenticated;
grant usage, select on sequence public.admin_activity_log_id_seq to authenticated;

create or replace function public.handle_invited_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_shop text := new.raw_user_meta_data->>'invited_shop_id';
  valid_invitation public.shop_invitations%rowtype;
begin
  if invited_shop is null then return new; end if;
  select i.* into valid_invitation
  from public.shop_invitations i
  where i.shop_id = invited_shop
    and lower(i.email) = lower(new.email)
    and i.status = 'sent'
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;
  if valid_invitation.id is null then return new; end if;
  insert into public.shop_members (shop_id, user_id, role, status, invited_by)
  values (valid_invitation.shop_id, new.id, valid_invitation.role, 'active', valid_invitation.invited_by)
  on conflict (shop_id, user_id) do update set role = excluded.role, status = 'active', updated_at = now();
  update public.shop_invitations set status = 'accepted', updated_at = now() where id = valid_invitation.id;
  return new;
end
$$;

drop trigger if exists on_auth_user_invited on auth.users;
create trigger on_auth_user_invited after insert on auth.users for each row execute function public.handle_invited_user();

do $$
declare table_name text;
begin
  foreach table_name in array array['shops','shop_members','shop_invitations','customers','vehicles','jobs','technician_findings','estimates','estimate_options','invoices','core_charges','warranty_cases','shop_integrations','platform_admins']
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

-- After the Platform Owner creates a normal authenticated account, promote it once:
-- insert into public.platform_admins (user_id, role) values ('AUTH-USER-UUID', 'platform_owner');
-- Do not hard-code an email or password in source control.

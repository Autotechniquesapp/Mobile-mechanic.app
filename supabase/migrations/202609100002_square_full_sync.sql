-- Durable, shop-scoped mirrors for Square invoices and payments.
-- These tables let the app reconcile records created in either Square or
-- Mobile Mechanic AI without putting provider credentials in the browser.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_shop_id_id_key'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_shop_id_id_key unique (shop_id, id);
  end if;
end $$;

create unique index if not exists payment_processor_credentials_square_merchant_key
  on public.payment_processor_credentials (merchant_id)
  where provider = 'square' and merchant_id is not null;

create table if not exists public.payment_processor_invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(shop_id) on delete cascade,
  provider text not null check (provider in ('square')),
  external_invoice_id text not null,
  local_invoice_id uuid null,
  external_order_id text null,
  external_customer_id text null,
  local_customer_id uuid null,
  invoice_number text null,
  status text not null,
  currency text not null default 'USD',
  total numeric(12,2) not null default 0 check (total >= 0),
  paid numeric(12,2) not null default 0 check (paid >= 0),
  balance numeric(12,2) not null default 0 check (balance >= 0),
  due_date date null,
  public_url text null,
  metadata jsonb not null default '{}'::jsonb,
  provider_created_at timestamptz null,
  provider_updated_at timestamptz null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, provider, external_invoice_id),
  foreign key (shop_id, local_invoice_id)
    references public.invoices(shop_id, id) on delete set null (local_invoice_id),
  foreign key (shop_id, local_customer_id)
    references public.customers(shop_id, id) on delete set null (local_customer_id)
);

create index if not exists payment_processor_invoices_shop_status_idx
  on public.payment_processor_invoices (shop_id, provider, status, provider_updated_at desc);
create index if not exists payment_processor_invoices_order_idx
  on public.payment_processor_invoices (shop_id, provider, external_order_id)
  where external_order_id is not null;
create index if not exists payment_processor_invoices_local_invoice_idx
  on public.payment_processor_invoices (shop_id, local_invoice_id)
  where local_invoice_id is not null;
create index if not exists payment_processor_invoices_local_customer_idx
  on public.payment_processor_invoices (shop_id, local_customer_id)
  where local_customer_id is not null;

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references public.shops(shop_id) on delete cascade,
  provider text not null check (provider in ('square')),
  external_payment_id text not null,
  local_invoice_id uuid null,
  local_customer_id uuid null,
  external_order_id text null,
  external_customer_id text null,
  location_id text null,
  status text not null,
  source_type text null,
  currency text not null default 'USD',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  refunded numeric(12,2) not null default 0 check (refunded >= 0),
  tip numeric(12,2) not null default 0 check (tip >= 0),
  processing_fee numeric(12,2) not null default 0 check (processing_fee >= 0),
  receipt_url text null,
  paid_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  provider_created_at timestamptz null,
  provider_updated_at timestamptz null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, provider, external_payment_id),
  foreign key (shop_id, local_invoice_id)
    references public.invoices(shop_id, id) on delete set null (local_invoice_id),
  foreign key (shop_id, local_customer_id)
    references public.customers(shop_id, id) on delete set null (local_customer_id)
);

create index if not exists payment_transactions_shop_paid_idx
  on public.payment_transactions (shop_id, provider, paid_at desc);
create index if not exists payment_transactions_order_idx
  on public.payment_transactions (shop_id, provider, external_order_id)
  where external_order_id is not null;
create index if not exists payment_transactions_local_invoice_idx
  on public.payment_transactions (shop_id, local_invoice_id)
  where local_invoice_id is not null;
create index if not exists payment_transactions_local_customer_idx
  on public.payment_transactions (shop_id, local_customer_id)
  where local_customer_id is not null;

create table if not exists public.square_webhook_events (
  event_id text primary key,
  shop_id text null references public.shops(shop_id) on delete cascade,
  merchant_id text null,
  event_type text not null,
  status text not null default 'received'
    check (status in ('received','processing','processed','failed','ignored')),
  error text null,
  received_at timestamptz not null default now(),
  processed_at timestamptz null
);

create index if not exists square_webhook_events_shop_received_idx
  on public.square_webhook_events (shop_id, received_at desc);

alter table public.payment_processor_invoices enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.square_webhook_events enable row level security;

create or replace function app_private.can_manage_shop_payments(target_shop_id text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.shop_members sm
    where sm.shop_id = target_shop_id
      and sm.user_id = (select auth.uid())
      and sm.status = 'active'
      and sm.role in ('shop_owner', 'manager', 'service_writer')
  );
$$;

revoke all on function app_private.can_manage_shop_payments(text) from public, anon;
grant execute on function app_private.can_manage_shop_payments(text) to authenticated;

revoke all on public.payment_processor_invoices from anon;
revoke all on public.payment_transactions from anon;
revoke all on public.square_webhook_events from anon, authenticated;
grant select on public.payment_processor_invoices to authenticated;
grant select on public.payment_transactions to authenticated;

drop policy if exists payment_processor_invoices_admin_select
  on public.payment_processor_invoices;
create policy payment_processor_invoices_admin_select
  on public.payment_processor_invoices
  for select
  to authenticated
  using (app_private.can_manage_shop_payments(shop_id));

drop policy if exists payment_transactions_admin_select
  on public.payment_transactions;
create policy payment_transactions_admin_select
  on public.payment_transactions
  for select
  to authenticated
  using (app_private.can_manage_shop_payments(shop_id));

drop policy if exists invoices_admin_all on public.invoices;
drop policy if exists invoices_payment_staff_select on public.invoices;
drop policy if exists invoices_admin_insert on public.invoices;
drop policy if exists invoices_admin_update on public.invoices;
drop policy if exists invoices_admin_delete on public.invoices;
drop policy if exists invoices_payment_staff_insert on public.invoices;
drop policy if exists invoices_payment_staff_update on public.invoices;
create policy invoices_payment_staff_select
  on public.invoices
  for select
  to authenticated
  using (app_private.can_manage_shop_payments(shop_id));
create policy invoices_payment_staff_insert
  on public.invoices
  for insert
  to authenticated
  with check (app_private.can_manage_shop_payments(shop_id));
create policy invoices_payment_staff_update
  on public.invoices
  for update
  to authenticated
  using (app_private.can_manage_shop_payments(shop_id))
  with check (app_private.can_manage_shop_payments(shop_id));
create policy invoices_admin_delete
  on public.invoices
  for delete
  to authenticated
  using (app_private.is_shop_admin(shop_id));

comment on table public.payment_processor_invoices is
  'Read-only browser mirror of shop-scoped processor invoices; written by trusted Edge Functions.';
comment on table public.payment_transactions is
  'Read-only browser mirror of shop-scoped processor payments and refunds; written by trusted Edge Functions.';
comment on table public.square_webhook_events is
  'Idempotency and processing audit records for verified Square webhook notifications; never exposed to browsers.';

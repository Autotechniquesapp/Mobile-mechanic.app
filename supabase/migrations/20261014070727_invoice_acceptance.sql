-- Invoice acceptance is separate from repair authorization and payment status.
create table public.customer_invoice_acceptances (
 id uuid primary key default gen_random_uuid(),shop_id text not null references public.shops(shop_id),
 invoice_id uuid not null,job_id uuid not null,token_hash bytea not null unique,
 snapshot jsonb not null,status text not null default 'pending' check(status in('pending','signed','declined','revoked')),
 signature_name text,signed_at timestamptz,consumed_at timestamptz,
 expires_at timestamptz not null,created_at timestamptz not null default now(),created_by uuid not null
);
alter table public.customer_invoice_acceptances enable row level security;
create index invoice_acceptances_shop_invoice_idx on public.customer_invoice_acceptances(shop_id,invoice_id,created_at desc);
revoke all on public.customer_invoice_acceptances from public,anon,authenticated;
grant select on public.customer_invoice_acceptances to authenticated;
create policy invoice_acceptance_shop_read on public.customer_invoice_acceptances for select to authenticated
 using(app_private.can_manage_shop_payments(shop_id));

create or replace function app_private.create_invoice_acceptance(p_invoice_id uuid,p_payment_amount numeric default null) returns jsonb
language plpgsql security definer set search_path=public,app_private,extensions,pg_temp as $$
declare inv public.invoices%rowtype;j public.jobs%rowtype;s public.shops%rowtype;c public.customers%rowtype;v public.vehicles%rowtype;tok text;sid uuid;bal numeric;w text;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into inv from public.invoices where id=p_invoice_id;
 if not found or not exists(select 1 from public.shop_members m where m.shop_id=inv.shop_id and m.user_id=auth.uid() and m.status='active' and m.role in('owner','shop_owner','manager','service_writer')) then raise exception 'Invoice not found';end if;
 select * into j from public.jobs where id=inv.job_id and shop_id=inv.shop_id;if not found then raise exception 'Open an invoice attached to a job';end if;
 select * into s from public.shops where shop_id=inv.shop_id;
 select * into c from public.customers where id=j.customer_id and shop_id=inv.shop_id;
 select * into v from public.vehicles where id=j.vehicle_id and shop_id=inv.shop_id;
 bal:=coalesce((inv.processor_metadata->>'remaining_calculated')::numeric,greatest(0,inv.total-coalesce((inv.processor_metadata->>'total_paid')::numeric,case when inv.status='paid' then inv.total else 0 end)));
 if p_payment_amount is not null and (p_payment_amount<=0 or p_payment_amount>bal) then raise exception 'Payment amount must be within the unpaid balance';end if;
 w:=coalesce(inv.processor_metadata->>'warranty_text',j.ai_workup->'job_paperwork'->>'warranty_text','');
 if w='' and s.slug='autotechniques' then w:='30-day labor warranty from repair completion, covering defects in our workmanship on the repairs listed. Parts are subject to the supplier''s warranty. Contact us promptly for inspection. Coverage excludes defects or damage caused by another person altering, removing, or redoing our repaired work. Unrelated repairs or maintenance elsewhere do not void this warranty. Your statutory rights are unaffected.';end if;
 tok:=encode(extensions.gen_random_bytes(32),'hex');
 update public.customer_invoice_acceptances set status='revoked' where invoice_id=inv.id and status='pending';
 insert into public.customer_invoice_acceptances(shop_id,invoice_id,job_id,token_hash,snapshot,expires_at,created_by)
 values(inv.shop_id,inv.id,j.id,extensions.digest(tok,'sha256'),jsonb_build_object(
 'shop',jsonb_build_object('name',s.name,'phone',s.business_phone),
 'customer',jsonb_build_object('name',c.name,'phone',c.phone,'email',c.email,'address',c.address),
 'vehicle',jsonb_build_object('year',v.year,'make',v.make,'model',v.model,'engine',v.engine,'vin',v.vin,'mileage',v.mileage,'plate',v.license_plate),
 'invoice',jsonb_build_object('id',inv.id,'number',inv.processor_metadata->>'square_invoice_number','total',inv.total,'subtotal',inv.subtotal,'tax',inv.tax,'line_items',inv.line_items,'balance',bal),
 'warranty',w,'payment_amount',p_payment_amount,
 'unpaid_terms','Payment is due upon repair completion unless a different due date is stated on the invoice. Signing does not mark this invoice paid or authorize additional charges. Unpaid agreed charges may be pursued through lawful collection procedures. Any mechanic’s lien requires separate legal eligibility and process.'
 ),now()+interval '7 days',auth.uid()) returning id into sid;
 return jsonb_build_object('token',tok,'id',sid,'expires_at',now()+interval '7 days');
end $$;

create or replace function app_private.get_invoice_acceptance(p_token text) returns jsonb
language plpgsql security definer set search_path=public,app_private,extensions,pg_temp as $$
declare r public.customer_invoice_acceptances%rowtype;
begin
 if p_token is null or p_token !~ '^[a-fA-F0-9]{64}$' then return null;end if;
 select * into r from public.customer_invoice_acceptances where token_hash=extensions.digest(p_token,'sha256');if not found then return null;end if;
 return jsonb_build_object('id',r.id,'snapshot',r.snapshot,'status',case when r.status='pending' and r.expires_at<=now() then 'expired' else r.status end,'signature_name',r.signature_name,'signed_at',r.signed_at,'expires_at',r.expires_at);
end $$;

create or replace function app_private.sign_invoice_acceptance(p_token text,p_name text,p_accept boolean) returns jsonb
language plpgsql security definer set search_path=public,app_private,extensions,pg_temp as $$
declare r public.customer_invoice_acceptances%rowtype;inv public.invoices%rowtype;
begin
 if p_token is null or p_token !~ '^[a-fA-F0-9]{64}$' then raise exception 'Invalid signing link';end if;
 if p_accept is distinct from true or length(trim(coalesce(p_name,'')))<2 or length(trim(p_name))>150 then raise exception 'Type your full name and accept the terms before signing';end if;
 select * into r from public.customer_invoice_acceptances where token_hash=extensions.digest(p_token,'sha256') for update;
 if not found or r.status<>'pending' or r.expires_at<=now() then raise exception 'This signing link is no longer pending';end if;
 select * into inv from public.invoices where id=r.invoice_id and shop_id=r.shop_id;
 if not found or inv.total is distinct from (r.snapshot->'invoice'->>'total')::numeric or coalesce(inv.line_items,'[]'::jsonb) is distinct from coalesce(r.snapshot->'invoice'->'line_items','[]'::jsonb) then raise exception 'Invoice changed. Ask the shop for a new signing link';end if;
 update public.customer_invoice_acceptances set status='signed',signature_name=trim(p_name),signed_at=now() where id=r.id;
 return jsonb_build_object('signed',true,'id',r.id,'signed_at',now());
end $$;

create or replace function public.create_customer_invoice_acceptance(p_invoice_id uuid,p_payment_amount numeric default null) returns jsonb
language sql security invoker set search_path='' as $$select app_private.create_invoice_acceptance(p_invoice_id,p_payment_amount)$$;
create or replace function public.get_customer_invoice_acceptance(p_token text) returns jsonb
language sql security invoker set search_path='' as $$select app_private.get_invoice_acceptance(p_token)$$;
create or replace function public.sign_customer_invoice_acceptance(p_token text,p_name text,p_accept boolean) returns jsonb
language sql security invoker set search_path='' as $$select app_private.sign_invoice_acceptance(p_token,p_name,p_accept)$$;
revoke execute on function app_private.create_invoice_acceptance(uuid,numeric),app_private.get_invoice_acceptance(text),app_private.sign_invoice_acceptance(text,text,boolean),public.create_customer_invoice_acceptance(uuid,numeric),public.get_customer_invoice_acceptance(text),public.sign_customer_invoice_acceptance(text,text,boolean) from public;
grant usage on schema app_private to anon,authenticated;
grant execute on function app_private.create_invoice_acceptance(uuid,numeric),public.create_customer_invoice_acceptance(uuid,numeric) to authenticated;
grant execute on function app_private.get_invoice_acceptance(text),app_private.sign_invoice_acceptance(text,text,boolean),public.get_customer_invoice_acceptance(text),public.sign_customer_invoice_acceptance(text,text,boolean) to anon,authenticated;
-- A card checkout consumes one matching signature, so the next charge needs a new one.
grant all on public.customer_invoice_acceptances to service_role;
create or replace function app_private.claim_invoice_card_signature(p_invoice_id uuid,p_amount numeric) returns uuid
language plpgsql security definer set search_path=public,app_private,pg_temp as $$
declare sid uuid;
begin
 select a.id into sid from public.customer_invoice_acceptances a join public.invoices i on i.id=a.invoice_id and i.shop_id=a.shop_id where a.invoice_id=p_invoice_id and a.status='signed' and a.consumed_at is null and (a.snapshot->>'payment_amount')::numeric=p_amount and (a.snapshot->'invoice'->>'total')::numeric=i.total and coalesce(a.snapshot->'invoice'->'line_items','[]'::jsonb)=coalesce(i.line_items,'[]'::jsonb) order by a.signed_at desc limit 1 for update of a skip locked;
 if sid is null then return null;end if;
 update public.customer_invoice_acceptances set consumed_at=now() where id=sid;return sid;
end $$;
create or replace function public.claim_invoice_card_signature(p_invoice_id uuid,p_amount numeric) returns uuid
language sql security invoker set search_path='' as $$select app_private.claim_invoice_card_signature(p_invoice_id,p_amount)$$;
revoke execute on function app_private.claim_invoice_card_signature(uuid,numeric),public.claim_invoice_card_signature(uuid,numeric) from public,anon,authenticated;
grant execute on function app_private.claim_invoice_card_signature(uuid,numeric),public.claim_invoice_card_signature(uuid,numeric) to service_role;

create table app_private.invoice_received_payments (
  id uuid primary key,
  shop_id text not null,
  invoice_id uuid not null,
  method text not null check (method in ('cash','zelle','cash_app','other','square_pos')),
  amount numeric(12,2) not null check (amount > 0),
  reference text not null default '',
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  square_baseline numeric(12,2) not null default 0,
  reconciled_at timestamptz,
  foreign key (shop_id,invoice_id) references public.invoices(shop_id,id) on delete cascade
);
alter table app_private.invoice_received_payments enable row level security;
create index invoice_received_payments_invoice_idx on app_private.invoice_received_payments(shop_id,invoice_id);
create unique index invoice_received_payments_pos_unique on app_private.invoice_received_payments(reference) where method='square_pos';
revoke all on app_private.invoice_received_payments from public,anon,authenticated;

create function app_private.apply_received_invoice_payments() returns trigger
language plpgsql security definer set search_path='' as $$
declare provider_paid numeric; pending numeric; history jsonb;
begin
 if not exists(select 1 from app_private.invoice_received_payments where invoice_id=new.id) then return new; end if;
 if new.processor_metadata->>'last_square_sync_at' is distinct from old.processor_metadata->>'last_square_sync_at' then
   provider_paid:=coalesce((new.processor_metadata->>'total_paid')::numeric,0);
 else
   provider_paid:=coalesce((old.processor_metadata->>'provider_total_paid')::numeric,(old.processor_metadata->>'total_paid')::numeric,0);
 end if;
 select coalesce(sum(amount) filter(where reconciled_at is null),0),coalesce(jsonb_agg(jsonb_build_object('id',id,'method',method,'amount',amount,'reference',reference,'recorded_at',recorded_at,'reconciled_at',reconciled_at) order by recorded_at),'[]')
 into pending,history from app_private.invoice_received_payments where invoice_id=new.id and shop_id=new.shop_id;
 new.processor_metadata:=new.processor_metadata||jsonb_build_object('provider_total_paid',provider_paid,'received_payment_total',pending,'received_payments',history,'total_paid',provider_paid+pending,'remaining_calculated',greatest(0,new.total-provider_paid-pending));
 if new.status<>'void' then
   if provider_paid+pending>=new.total and new.total>0 then new.status:='paid';new.paid_at:=coalesce(new.paid_at,now());
   elsif provider_paid+pending>0 then new.status:='partially_paid';new.paid_at:=null; end if;
 end if;
 return new;
end $$;
revoke all on function app_private.apply_received_invoice_payments() from public,anon,authenticated,service_role;
create trigger invoice_received_payment_totals before update on public.invoices for each row execute function app_private.apply_received_invoice_payments();

create function app_private.record_received_invoice_payment(p_invoice_id uuid,p_amount numeric,p_method text,p_reference text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare inv public.invoices%rowtype; existing app_private.invoice_received_payments%rowtype; provider_paid numeric; balance numeric;
begin
 select * into inv from public.invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 if coalesce(auth.role(),'')<>'service_role' and not exists(select 1 from public.shop_members where shop_id=inv.shop_id and user_id=auth.uid() and status='active' and role in ('shop_owner','owner','manager','service_writer')) then raise exception 'Invoice not found';end if;
 if p_method not in ('cash','zelle','cash_app','other','square_pos') or (p_method='square_pos' and coalesce(auth.role(),'')<>'service_role') then raise exception 'Choose Cash, Zelle, Cash App, or Other';end if;
 if p_request_id is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or length(coalesce(p_reference,''))>250 then raise exception 'Enter a valid payment amount and reference';end if;
 select * into existing from app_private.invoice_received_payments where id=p_request_id;
 if found then
   if existing.invoice_id<>inv.id or existing.amount<>p_amount or existing.method<>p_method then raise exception 'This payment request was already used';end if;
   return to_jsonb(inv);
 end if;
 balance:=coalesce((inv.processor_metadata->>'remaining_calculated')::numeric,greatest(0,inv.total-coalesce((inv.processor_metadata->>'total_paid')::numeric,case when inv.status='paid' then inv.total else 0 end)));
 if inv.status in ('paid','void') or p_amount>balance then raise exception 'Payment must not exceed the remaining balance';end if;
 provider_paid:=coalesce((inv.processor_metadata->>'provider_total_paid')::numeric,(inv.processor_metadata->>'total_paid')::numeric,0);
 insert into app_private.invoice_received_payments(id,shop_id,invoice_id,method,amount,reference,recorded_by,square_baseline)
 values(p_request_id,inv.shop_id,inv.id,p_method,p_amount,coalesce(p_reference,''),auth.uid(),provider_paid+coalesce((inv.processor_metadata->>'received_payment_total')::numeric,0));
 update public.invoices set updated_at=now() where id=inv.id returning * into inv;
 if inv.status='paid' and not exists(select 1 from public.invoices where shop_id=inv.shop_id and job_id=inv.job_id and total>0 and status not in ('paid','void')) then
   update public.jobs set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=inv.job_id and shop_id=inv.shop_id;
 end if;
 return to_jsonb(inv);
end $$;
revoke all on function app_private.record_received_invoice_payment(uuid,numeric,text,text,uuid) from public,anon;
grant execute on function app_private.record_received_invoice_payment(uuid,numeric,text,text,uuid) to authenticated,service_role;
create function public.record_received_invoice_payment(p_invoice_id uuid,p_amount numeric,p_method text,p_reference text,p_request_id uuid) returns jsonb
language sql set search_path='' as $$ select app_private.record_received_invoice_payment(p_invoice_id,p_amount,p_method,p_reference,p_request_id) $$;
revoke all on function public.record_received_invoice_payment(uuid,numeric,text,text,uuid) from public,anon;
grant execute on function public.record_received_invoice_payment(uuid,numeric,text,text,uuid) to authenticated,service_role;

create function app_private.match_received_payment_in_square(p_payment_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare inv public.invoices%rowtype; payment app_private.invoice_received_payments%rowtype;
begin
 select * into payment from app_private.invoice_received_payments where id=p_payment_id;
 if not found then raise exception 'Payment not found';end if;
 select * into inv from public.invoices where id=payment.invoice_id for update;
 if not exists(select 1 from public.shop_members where shop_id=inv.shop_id and user_id=auth.uid() and status='active' and role in ('shop_owner','owner','manager','service_writer')) then raise exception 'Payment not found';end if;
 if coalesce((inv.processor_metadata->>'provider_total_paid')::numeric,0)<payment.square_baseline+payment.amount then raise exception 'Refresh Square after marking this payment received there';end if;
 update app_private.invoice_received_payments set reconciled_at=coalesce(reconciled_at,now()) where id=payment.id;
 update public.invoices set updated_at=now() where id=inv.id returning * into inv;
 return to_jsonb(inv);
end $$;
revoke all on function app_private.match_received_payment_in_square(uuid) from public,anon,service_role;
grant execute on function app_private.match_received_payment_in_square(uuid) to authenticated;
create function public.match_received_payment_in_square(p_payment_id uuid) returns jsonb language sql set search_path='' as $$select app_private.match_received_payment_in_square(p_payment_id)$$;
revoke all on function public.match_received_payment_in_square(uuid) from public,anon,service_role;
grant execute on function public.match_received_payment_in_square(uuid) to authenticated;

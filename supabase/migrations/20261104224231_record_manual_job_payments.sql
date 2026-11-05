-- Manual receipts are kept in invoice metadata and survive Square refreshes.
create or replace function app_private.keep_manual_invoice_payments()
returns trigger language plpgsql security invoker set search_path='' as $$
declare receipts jsonb:=coalesce(old.processor_metadata->'manual_payments','[]'); manual_total numeric; provider_paid numeric; paid numeric;
begin
 if current_setting('app.recording_manual_payment',true)='on' then receipts:=new.processor_metadata->'manual_payments'; end if;
 if jsonb_array_length(receipts)=0 then return new; end if;
 select coalesce(sum((r->>'amount')::numeric),0) into manual_total from jsonb_array_elements(receipts) r;
 provider_paid:=coalesce((new.processor_metadata->>'provider_total_paid')::numeric,(old.processor_metadata->>'provider_total_paid')::numeric,(old.processor_metadata->>'total_paid')::numeric,0);
 paid:=least(new.total,greatest(0,provider_paid)+manual_total);
 new.processor_metadata:=coalesce(new.processor_metadata,'{}')||jsonb_build_object('manual_payments',receipts,'manual_total_paid',manual_total,'provider_total_paid',provider_paid,'total_paid',paid,'remaining_calculated',greatest(0,new.total-paid));
 if lower(new.status) not in ('void','canceled','cancelled','refunded','partially_refunded') then
  new.status:=case when paid>=new.total and new.total>0 then 'paid' else 'partially_paid' end;
  new.paid_at:=case when new.status='paid' then coalesce(new.paid_at,now()) else null end;
  if new.status='paid' and not exists(select 1 from public.invoices i where i.shop_id=new.shop_id and i.job_id=new.job_id and i.id<>new.id and i.total>0 and lower(i.status) not in ('paid','void','canceled','cancelled','refunded')) then
   update public.jobs set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now() where id=new.job_id and shop_id=new.shop_id and status<>'completed';
  end if;
 end if;
 return new;
end $$;
revoke all on function app_private.keep_manual_invoice_payments() from public,anon,authenticated;
drop trigger if exists keep_manual_invoice_payments on public.invoices;
create trigger keep_manual_invoice_payments before update on public.invoices for each row execute function app_private.keep_manual_invoice_payments();
create or replace function public.record_manual_job_payment(p_invoice_id uuid,p_method text,p_amount numeric,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare inv public.invoices; receipts jsonb; already jsonb; completed boolean; remaining numeric;
begin
 if auth.uid() is null then raise exception 'Sign in before recording a payment.' using errcode='42501'; end if;
 if p_method is null or p_method not in ('cash','zelle','cash_app') then raise exception 'Choose Cash, Zelle, or Cash App.'; end if;
 if p_request_id is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Enter a positive payment amount with at most two decimals.'; end if;
 select * into inv from public.invoices where id=p_invoice_id;
 if not found then raise exception 'Invoice not found or access denied.' using errcode='42501'; end if;
 if not exists(select 1 from public.shop_members m where m.shop_id=inv.shop_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','shop_owner','manager','service_writer')) then raise exception 'Your shop role cannot record payments.' using errcode='42501'; end if;
 perform 1 from public.jobs where id=inv.job_id and shop_id=inv.shop_id for update;
 select * into inv from public.invoices where id=p_invoice_id for update;
 receipts:=coalesce(inv.processor_metadata->'manual_payments','[]');
 select r into already from jsonb_array_elements(receipts) r where r->>'id'=p_request_id::text;
 if already is not null then
  if already->>'method'<>p_method or (already->>'amount')::numeric<>p_amount then raise exception 'This payment request was already used for a different amount or method.'; end if;
 else
  if lower(inv.status) in ('paid','void','canceled','cancelled','refunded','partially_refunded') then raise exception 'This invoice is already paid or closed.'; end if;
  remaining:=round(inv.total-coalesce((inv.processor_metadata->>'total_paid')::numeric,0),2);
  if p_amount>remaining then raise exception 'Payment exceeds the remaining balance (%).',remaining; end if;
  perform set_config('app.recording_manual_payment','on',true);
  update public.invoices set processor_metadata=coalesce(processor_metadata,'{}')||jsonb_build_object('manual_payments',receipts||jsonb_build_array(jsonb_build_object('id',p_request_id,'method',p_method,'amount',p_amount,'paid_at',now(),'recorded_by',auth.uid()))),updated_at=now() where id=p_invoice_id returning * into inv;
  perform set_config('app.recording_manual_payment','off',true);
 end if;
 select status='completed' into completed from public.jobs where id=inv.job_id and shop_id=inv.shop_id;
 return jsonb_build_object('invoice',to_jsonb(inv),'job_completed',coalesce(completed,false));
end $$;
revoke all on function public.record_manual_job_payment(uuid,text,numeric,uuid) from public,anon;
grant execute on function public.record_manual_job_payment(uuid,text,numeric,uuid) to authenticated;

alter table app_private.invoice_received_payments add column refunded_amount numeric(12,2) not null default 0 check(refunded_amount>=0 and refunded_amount<=amount);
create or replace function app_private.apply_received_invoice_payments() returns trigger
language plpgsql security definer set search_path='' as $$
declare provider_paid numeric; pending numeric; history jsonb;
begin
 if not exists(select 1 from app_private.invoice_received_payments where invoice_id=new.id) then return new; end if;
 if new.processor_metadata->>'last_square_sync_at' is distinct from old.processor_metadata->>'last_square_sync_at' then
   provider_paid:=coalesce((new.processor_metadata->>'total_paid')::numeric,0);
 else
   provider_paid:=coalesce((old.processor_metadata->>'provider_total_paid')::numeric,(old.processor_metadata->>'total_paid')::numeric,0);
 end if;
 select coalesce(sum(amount-refunded_amount) filter(where reconciled_at is null),0),coalesce(jsonb_agg(jsonb_build_object('id',id,'method',method,'amount',amount,'refunded_amount',refunded_amount,'reference',reference,'recorded_at',recorded_at,'reconciled_at',reconciled_at) order by recorded_at),'[]')
 into pending,history from app_private.invoice_received_payments where invoice_id=new.id and shop_id=new.shop_id;
 new.processor_metadata:=new.processor_metadata||jsonb_build_object('provider_total_paid',provider_paid,'received_payment_total',pending,'received_payments',history,'total_paid',provider_paid+pending,'remaining_calculated',greatest(0,new.total-provider_paid-pending));
 if new.status<>'void' then
   if provider_paid+pending>=new.total and new.total>0 then new.status:='paid';new.paid_at:=coalesce(new.paid_at,now());
   elsif provider_paid+pending>0 then new.status:='partially_paid';new.paid_at:=null; end if;
 end if;
 return new;
end $$;
create function app_private.update_received_pos_refund(p_payment_id text,p_refunded numeric) returns void
language plpgsql security definer set search_path='' as $$
declare iid uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Server verification required';end if;
 update app_private.invoice_received_payments set refunded_amount=least(amount,greatest(0,p_refunded)) where method='square_pos' and reference=p_payment_id and refunded_amount is distinct from least(amount,greatest(0,p_refunded)) returning invoice_id into iid;
 if iid is not null then update public.invoices set updated_at=now() where id=iid;end if;
end $$;
revoke all on function app_private.update_received_pos_refund(text,numeric) from public,anon,authenticated;
grant execute on function app_private.update_received_pos_refund(text,numeric) to service_role;
create function public.update_received_pos_refund(p_payment_id text,p_refunded numeric) returns void language sql set search_path='' as $$select app_private.update_received_pos_refund(p_payment_id,p_refunded)$$;
revoke all on function public.update_received_pos_refund(text,numeric) from public,anon,authenticated;
grant execute on function public.update_received_pos_refund(text,numeric) to service_role;

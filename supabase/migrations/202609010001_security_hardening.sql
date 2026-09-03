-- Protect automatic intake jobs with an internal token shared through Vault.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'intake_internal_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'intake_internal_token','Authenticates automatic intake Edge Function calls');
  end if;
end $$;

create or replace function public.get_intake_internal_secret()
returns text language sql security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name='intake_internal_token' order by created_at desc limit 1
$$;
revoke all on function public.get_intake_internal_secret() from public, anon, authenticated;
grant execute on function public.get_intake_internal_secret() to service_role;

create or replace function public.trigger_intake_ai_workup()
returns trigger language plpgsql security definer
set search_path = public, extensions, net, vault
as $$
declare v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name='intake_internal_token' order by created_at desc limit 1;
  perform net.http_post(
    url := 'https://rapcejqlydedceegbcrs.supabase.co/functions/v1/intake-ai-workup',
    headers := jsonb_build_object('Content-Type','application/json','x-intake-internal-token',v_token),
    body := jsonb_build_object('intake_id',new.id)
  );
  return new;
end $$;

create or replace function public.trigger_intake_push_notification()
returns trigger language plpgsql security definer
set search_path = public, extensions, net, vault
as $$
declare v_token text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets
  where name='intake_internal_token' order by created_at desc limit 1;
  perform net.http_post(
    url := 'https://rapcejqlydedceegbcrs.supabase.co/functions/v1/push-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-intake-internal-token',v_token),
    body := jsonb_build_object('action','notify_intake','intake_id',new.id)
  );
  return new;
end $$;
revoke all on function public.trigger_intake_ai_workup() from public, anon, authenticated;
revoke all on function public.trigger_intake_push_notification() from public, anon, authenticated;

drop trigger if exists intake_push_notification on public.intake_submissions;
create trigger intake_push_notification after insert on public.intake_submissions
for each row execute function public.trigger_intake_push_notification();

create or replace function public.submit_public_intake(
  p_shop_id text,p_customer_name text,p_phone text default null,p_email text default null,
  p_address text default null,p_availability text default null,p_current_location jsonb default null,
  p_vehicle jsonb default '{}'::jsonb,p_customer_states text default ''
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if nullif(trim(coalesce(p_customer_name,'')),'') is null then raise exception 'Customer name required'; end if;
  if not exists(select 1 from public.shops s where s.shop_id=p_shop_id and coalesce(s.billing_status,'trialing')<>'suspended')
    then raise exception 'Shop is not available for intake'; end if;
  if (select count(*) from public.intake_submissions where shop_id=p_shop_id and created_at>now()-interval '1 hour') >= 30
    then raise exception 'This shop has received too many requests. Please call the shop directly.'; end if;
  if (select count(*) from public.intake_submissions
      where shop_id=p_shop_id and created_at>now()-interval '15 minutes'
      and (nullif(trim(p_phone),'') is not null and phone=nullif(trim(p_phone),'')
        or nullif(lower(trim(p_email)),'') is not null and lower(email)=nullif(lower(trim(p_email)),''))) >= 5
    then raise exception 'Please wait before sending another request.'; end if;
  insert into public.intake_submissions
    (shop_id,customer_name,phone,email,address,current_location,preferred_contact,availability,vehicle,customer_states,status,converted_job_id)
  values
    (p_shop_id,left(trim(p_customer_name),200),nullif(left(trim(coalesce(p_phone,'')),80),''),
     nullif(left(trim(coalesce(p_email,'')),320),''),nullif(left(trim(coalesce(p_address,'')),500),''),
     p_current_location,null,nullif(left(trim(coalesce(p_availability,'')),500),''),
     coalesce(p_vehicle,'{}'::jsonb),left(coalesce(p_customer_states,''),5000),'new',null)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_public_intake(text,text,text,text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.submit_public_intake(text,text,text,text,text,text,jsonb,jsonb,text) to anon, authenticated;

-- Return full job JSON to owners/managers/service writers, but strip financial fields for technicians.
create or replace function public.get_my_shop_jobs()
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_shop text; v_role text; v_result jsonb;
begin
  select shop_id,role into v_shop,v_role from public.shop_members
  where user_id=(select auth.uid()) and status='active' order by created_at limit 1;
  if v_shop is null then raise exception 'Active shop membership required'; end if;
  select coalesce(jsonb_agg(
    case when v_role in ('shop_owner','owner','manager','service_writer')
      then to_jsonb(j)
      else to_jsonb(j)-'estimate'-'approval'-'estimated_labor_hours'
    end order by j.created_at desc
  ),'[]'::jsonb) into v_result from public.jobs j where j.shop_id=v_shop;
  return v_result;
end $$;
revoke all on function public.get_my_shop_jobs() from public, anon;
grant execute on function public.get_my_shop_jobs() to authenticated;

revoke select on public.jobs from authenticated;
grant select (id,shop_id,customer_id,vehicle_id,assigned_user_id,status,customer_states,current_location,
  availability,priority,ai_workup,ai_disclaimer_acknowledged,created_at,updated_at,findings,codes,
  completed_at,carfax_status,scheduled_start_at,scheduled_end_at,travel_minutes,buffer_minutes,schedule_notes)
on public.jobs to authenticated;

create or replace function public.protect_job_financial_fields()
returns trigger language plpgsql security invoker set search_path=public
as $$
begin
  if (new.estimate is distinct from old.estimate or new.approval is distinct from old.approval
      or new.estimated_labor_hours is distinct from old.estimated_labor_hours)
     and not app_private.is_shop_admin(old.shop_id) then
    raise exception 'Financial job fields require shop owner or manager access';
  end if;
  return new;
end $$;
drop trigger if exists protect_job_financial_fields on public.jobs;
create trigger protect_job_financial_fields before update on public.jobs
for each row execute function public.protect_job_financial_fields();
revoke all on function public.protect_job_financial_fields() from public, anon, authenticated;

-- Provider readiness is operational metadata and no longer public.

create or replace function app_private.get_my_shop_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop text;
  v_role text;
  v_result jsonb;
begin
  select m.shop_id,m.role into v_shop,v_role
  from public.shop_members m
  where m.user_id=(select auth.uid()) and m.status='active'
  order by m.created_at limit 1;

  if v_shop is null then
    raise exception 'Active shop membership required';
  end if;

  select coalesce(jsonb_agg(
    case when v_role in ('shop_owner','owner','manager','service_writer')
      then to_jsonb(j)
      else to_jsonb(j)-'estimate'-'approval'-'estimated_labor_hours'
    end order by j.created_at desc
  ),'[]'::jsonb)
  into v_result
  from public.jobs j
  where j.shop_id=v_shop;

  return v_result;
end
$function$;

revoke execute on function app_private.get_my_shop_jobs() from public, anon;
grant usage on schema app_private to authenticated;
grant execute on function app_private.get_my_shop_jobs() to authenticated;

create or replace function public.get_my_shop_jobs()
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.get_my_shop_jobs();
$function$;

revoke execute on function public.get_my_shop_jobs() from public, anon;
grant execute on function public.get_my_shop_jobs() to authenticated;

create or replace function app_private.submit_public_intake_by_shop_id(
  p_shop_id text,
  p_customer_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_availability text default null,
  p_current_location jsonb default null,
  p_vehicle jsonb default '{}'::jsonb,
  p_customer_states text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if nullif(trim(coalesce(p_customer_name,'')),'') is null then
    raise exception 'Customer name required';
  end if;

  if p_current_location is not null and octet_length(p_current_location::text) > 5000 then
    raise exception 'Location data is too large';
  end if;

  if p_vehicle is not null and octet_length(p_vehicle::text) > 20000 then
    raise exception 'Vehicle data is too large';
  end if;

  if octet_length(coalesce(p_customer_states,'')) > 10000 then
    raise exception 'Customer request is too large';
  end if;

  if not exists(
    select 1 from public.shops s
    where s.shop_id=p_shop_id and coalesce(s.billing_status,'trialing')<>'suspended'
  ) then
    raise exception 'Shop is not available for intake';
  end if;

  if (
    select count(*) from public.intake_submissions i
    where i.shop_id=p_shop_id and i.created_at>now()-interval '1 hour'
  ) >= 30 then
    raise exception 'This shop has received too many requests. Please call the shop directly.';
  end if;

  if (
    select count(*) from public.intake_submissions i
    where i.shop_id=p_shop_id and i.created_at>now()-interval '15 minutes'
      and (
        nullif(trim(p_phone),'') is not null and i.phone=nullif(trim(p_phone),'')
        or nullif(lower(trim(p_email)),'') is not null and lower(i.email)=nullif(lower(trim(p_email)),'')
      )
  ) >= 5 then
    raise exception 'Please wait before sending another request.';
  end if;

  insert into public.intake_submissions
    (shop_id,customer_name,phone,email,address,current_location,preferred_contact,availability,vehicle,customer_states,status,converted_job_id)
  values
    (p_shop_id,left(trim(p_customer_name),200),nullif(left(trim(coalesce(p_phone,'')),80),''),
     nullif(left(trim(coalesce(p_email,'')),320),''),nullif(left(trim(coalesce(p_address,'')),500),''),
     p_current_location,null,nullif(left(trim(coalesce(p_availability,'')),500),''),
     coalesce(p_vehicle,'{}'::jsonb),left(coalesce(p_customer_states,''),5000),'new',null)
  returning id into v_id;

  return v_id;
end
$function$;

revoke execute on function app_private.submit_public_intake_by_shop_id(text,text,text,text,text,text,jsonb,jsonb,text) from public;
grant usage on schema app_private to anon, authenticated;
grant execute on function app_private.submit_public_intake_by_shop_id(text,text,text,text,text,text,jsonb,jsonb,text) to anon, authenticated;

create or replace function public.submit_public_intake(
  p_shop_id text,
  p_customer_name text,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_availability text default null,
  p_current_location jsonb default null,
  p_vehicle jsonb default '{}'::jsonb,
  p_customer_states text default ''
)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select app_private.submit_public_intake_by_shop_id(
    p_shop_id,p_customer_name,p_phone,p_email,p_address,p_availability,p_current_location,p_vehicle,p_customer_states
  );
$function$;

revoke execute on function public.submit_public_intake(text,text,text,text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.submit_public_intake(text,text,text,text,text,text,jsonb,jsonb,text) to anon, authenticated;

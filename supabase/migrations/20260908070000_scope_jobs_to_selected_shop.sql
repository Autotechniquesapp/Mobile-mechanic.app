-- Scope job reads to the shop selected by the authenticated user.
-- The server validates membership; a browser-provided shop id is never trusted by itself.
create or replace function app_private.get_my_shop_jobs(p_shop_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_result jsonb;
begin
  if nullif(trim(coalesce(p_shop_id, '')), '') is null then
    raise exception 'Shop id required';
  end if;

  select m.role into v_role
  from public.shop_members m
  where m.user_id = (select auth.uid())
    and m.shop_id = p_shop_id
    and m.status = 'active'
  limit 1;

  if v_role is null then
    raise exception 'Active membership for selected shop required';
  end if;

  select coalesce(jsonb_agg(
    case when v_role in ('shop_owner','owner','manager','service_writer')
      then to_jsonb(j)
      else to_jsonb(j)-'estimate'-'approval'-'estimated_labor_hours'
    end order by j.created_at desc
  ), '[]'::jsonb)
  into v_result
  from public.jobs j
  where j.shop_id = p_shop_id;

  return v_result;
end
$function$;

revoke execute on function app_private.get_my_shop_jobs(text) from public, anon;
grant execute on function app_private.get_my_shop_jobs(text) to authenticated;

create or replace function public.get_my_shop_jobs(p_shop_id text)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.get_my_shop_jobs(p_shop_id);
$function$;

revoke execute on function public.get_my_shop_jobs(text) from public, anon;
grant execute on function public.get_my_shop_jobs(text) to authenticated;

-- Retire the ambiguous zero-argument endpoint. It chose the oldest membership,
-- which is unsafe for users who belong to more than one shop.
revoke execute on function public.get_my_shop_jobs() from authenticated;
revoke execute on function app_private.get_my_shop_jobs() from authenticated;

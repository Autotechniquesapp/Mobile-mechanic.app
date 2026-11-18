-- Serialize scheduling confirmations for the same intake across devices.
-- Keep the existing converter's permissions and behavior.
create function public.convert_schedule_intake_once(p_shop_id uuid, p_intake_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_intake_id::text, 88));

  select intake.converted_job_id into job_id
  from public.intake_submissions intake
  where intake.id = p_intake_id and intake.shop_id = p_shop_id;

  if not found then
    raise exception 'Intake unavailable';
  end if;

  if job_id is not null then
    return job_id;
  end if;

  return public.convert_intake_to_job(p_intake_id);
end;
$$;

revoke all on function public.convert_schedule_intake_once(uuid, uuid) from public, anon;
grant execute on function public.convert_schedule_intake_once(uuid, uuid) to authenticated;

-- NULL follows the device default; -1 disables this job; nonnegative minutes override it.
alter table public.jobs add column if not exists schedule_reminder_minutes integer
  check (schedule_reminder_minutes >= -1);
comment on column public.jobs.schedule_reminder_minutes is
  'NULL=device default; -1=off; >=0=minutes before scheduled appointment';

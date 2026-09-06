-- Start the mechanic-facing AI pre-workup automatically for every new customer intake.
drop trigger if exists intake_ai_workup on public.intake_submissions;
create trigger intake_ai_workup
after insert on public.intake_submissions
for each row execute function public.trigger_intake_ai_workup();

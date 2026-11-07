-- Keep persisted job statuses aligned with the calendar save action.
ALTER TABLE public.jobs DROP CONSTRAINT jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status = ANY (ARRAY['new','ai_workup','scheduled','diagnosing','estimate_sent','authorized','repairing','invoiced','paid','completed','declined','warranty','comeback']::text[]));

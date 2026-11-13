-- Restore the privilege revoked by intake_queue_shop_access.
-- Existing intake_member_delete RLS policy still restricts rows to shop members.
GRANT DELETE ON TABLE public.intake_submissions TO authenticated;

-- Square sync and invoice refresh update job status through
-- protect_job_financial_fields, which resolves app_private.is_shop_admin.
-- Keep client schema/function grants and row policies unchanged.
grant usage on schema app_private to service_role;
grant execute on function app_private.is_shop_admin(text) to service_role;

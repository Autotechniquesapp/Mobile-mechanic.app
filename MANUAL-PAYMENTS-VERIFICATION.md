# Cash, Zelle and Cash App receipts

This change is not deployed. The database connector stalled on two validation calls; neither produced a result. Those calls wrapped the schema changes in BEGIN/ROLLBACK. Do not infer success from missing errors or publish the website before the backend is verified.

The invoice shows three receipt buttons. Each opens an amount field prefilled with the outstanding balance. The server records the method, amount, authenticated user and timestamp, serializes changes to the invoice, and deduplicates retries by request UUID. Existing payment-role and shop RLS apply. Fully paid jobs complete only when no other billable invoice has an unpaid balance.

The SQL trigger preserves manual receipts across Square refreshes. The accompanying Square Edge Function changes set `provider_total_paid` so the trigger can distinguish provider payments from manual receipts. Deploy both function changes before exposing the receipt buttons. These are app records; they do not charge customers or record external payments in Square. The UI explains that a linked Square invoice must be reconciled separately and hides its collection/share controls after a manual receipt.

Before deploying:

- Run the SQL migration in a rollback transaction with synthetic shop/user/job/invoice fixtures. Verify all three methods, partial and full payment, multiple unpaid invoices, invalid amount/method, overpayment, duplicate retry, altered retry, technician denial, cross-shop denial and anonymous denial.
- Simulate a Square refresh with stale metadata. Verify manual receipts and combined totals survive and a fully paid job remains Completed.
- Run Supabase security advisors; confirm authenticated-only RPC grants, SECURITY INVOKER, existing invoice RLS and a fixed search path.
- Deploy the migration and the two reviewed Square function patches, then publish the site after CI passes. Verify the live script URLs and test on Android with a synthetic job.

No real customer payment or provider charge was intentionally created for testing.

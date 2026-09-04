-- Let authenticated shop members review and convert only their own shop's intake queue.
drop policy if exists "shop members view intake queue" on public.intake_submissions;
create policy "shop members view intake queue"
on public.intake_submissions for select to authenticated
using (exists (select 1 from public.shop_members member where member.shop_id=intake_submissions.shop_id and member.user_id=(select auth.uid()) and member.status='active'));

drop policy if exists "shop members update intake queue" on public.intake_submissions;
create policy "shop members update intake queue"
on public.intake_submissions for update to authenticated
using (exists (select 1 from public.shop_members member where member.shop_id=intake_submissions.shop_id and member.user_id=(select auth.uid()) and member.status='active'))
with check (exists (select 1 from public.shop_members member where member.shop_id=intake_submissions.shop_id and member.user_id=(select auth.uid()) and member.status='active'));

revoke insert, delete, truncate on public.intake_submissions from authenticated;
grant select, update on public.intake_submissions to authenticated;

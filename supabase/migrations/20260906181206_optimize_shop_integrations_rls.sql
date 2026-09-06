drop policy if exists "shop members can view integrations" on public.shop_integrations;

create policy "shop members can view integrations"
on public.shop_integrations
for select
to authenticated
using (
  exists (
    select 1
    from public.shop_members m
    where m.shop_id = shop_integrations.shop_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  )
);

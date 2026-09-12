-- The platform has exactly one platform-wide administrator: the Platform Owner.
-- Shop owners and managers remain scoped through shop_members and are unaffected.

alter table public.platform_admins
  drop constraint if exists platform_admins_platform_owner_only;

alter table public.platform_admins
  add constraint platform_admins_platform_owner_only
  check (role = 'platform_owner');

create unique index if not exists platform_admins_single_row
  on public.platform_admins ((true));

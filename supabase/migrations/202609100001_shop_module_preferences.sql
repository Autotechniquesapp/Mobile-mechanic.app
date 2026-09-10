alter table public.shops
  add column if not exists specialties text[] not null default array['automotive']::text[],
  add column if not exists modules text[] not null default array['estimates','inventory','inspections','scheduling','reporting','time_clock','ai']::text[],
  add column if not exists custom_specialty text not null default '',
  add column if not exists asset_label text not null default 'Vehicle / Equipment';

comment on column public.shops.specialties is 'Shop-selected repair business specialties.';
comment on column public.shops.modules is 'Shop-selected optional application modules.';

alter table public.terms_acceptances
  add column if not exists privacy_version text,
  add column if not exists privacy_sha256 text,
  add column if not exists data_use_version text,
  add column if not exists data_use_sha256 text;

alter table public.terms_acceptances
  drop constraint if exists terms_acceptances_privacy_version_nonempty,
  add constraint terms_acceptances_privacy_version_nonempty
    check (privacy_version is null or length(trim(privacy_version)) > 0),
  drop constraint if exists terms_acceptances_privacy_hash_format,
  add constraint terms_acceptances_privacy_hash_format
    check (privacy_sha256 is null or privacy_sha256 ~ '^[a-f0-9]{64}$'),
  drop constraint if exists terms_acceptances_data_use_version_nonempty,
  add constraint terms_acceptances_data_use_version_nonempty
    check (data_use_version is null or length(trim(data_use_version)) > 0),
  drop constraint if exists terms_acceptances_data_use_hash_format,
  add constraint terms_acceptances_data_use_hash_format
    check (data_use_sha256 is null or data_use_sha256 ~ '^[a-f0-9]{64}$');

alter table public.shops
  add column if not exists privacy_version text,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists data_use_version text,
  add column if not exists data_use_accepted_at timestamptz;

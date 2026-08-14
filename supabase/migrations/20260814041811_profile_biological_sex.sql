-- Mifflin-St Jeor needs biological sex to pick its constant (+5 male, -161 female).
-- The column stays nullable so existing profiles and anyone who prefers not to answer
-- fall back to the midpoint of the two constants rather than being blocked.
create type public.biological_sex as enum ('male', 'female', 'unspecified');

alter table public.profiles
  add column biological_sex public.biological_sex;

comment on column public.profiles.biological_sex is
  'Used only to select the Mifflin-St Jeor BMR constant. Null or unspecified uses a sex-neutral midpoint.';

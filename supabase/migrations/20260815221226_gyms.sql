-- The same lift can feel heavier at one gym than another: plate calibration, machine
-- brands, cable friction and bar weight all differ. Recording where a session happened
-- turns that from a felt effect into a measurable one, and keeps the comparison honest
-- when the load history spans several places.
create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  notes text check (notes is null or length(notes) <= 2000),
  -- Stamped onto new sessions so the data collects itself; a gym nobody selects is a
  -- gym nobody records.
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gyms_user_idx on public.gyms (user_id, name);
-- At most one default per user, enforced rather than left to the client.
create unique index gyms_single_default_idx on public.gyms (user_id) where is_default;

alter table public.gyms enable row level security;

create policy "Users manage own gyms" on public.gyms
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create trigger gyms_set_updated_at
  before update on public.gyms
  for each row execute function private.set_updated_at();

-- Nullable: sessions recorded before gyms existed, and sessions with no gym set, stay
-- valid rather than being forced into a placeholder that would pollute the comparison.
alter table public.workout_sessions
  add column gym_id uuid references public.gyms on delete set null;

create index workout_sessions_gym_idx on public.workout_sessions (user_id, gym_id);

comment on column public.workout_sessions.gym_id is
  'Where the session happened. Null means unrecorded, which is distinct from any particular gym.';

-- A set has three states, not two: waiting, done, and deliberately passed over. Without
-- somewhere to record the third, skipping a set meant either logging it as done, which
-- corrupts the training history and the progressive-overload suggestion, or leaving it
-- pending, which makes finishing the workout look incomplete forever.
--
-- A separate column rather than a set_type value, because set_type says what kind of set
-- it is (working, warmup) and stays true whether or not it was performed.
alter table public.workout_sets
  add column skipped_at timestamptz;

comment on column public.workout_sets.skipped_at is
  'Set was passed over rather than performed. Excluded from volume, records and overload suggestions.';

-- Skipping a training day advances the rotation the same way completing one does, so a
-- missed day does not leave the cycle stuck on it forever. Nothing is recorded as
-- trained: no session is created, so history and volume are untouched.
create or replace function public.skip_routine_day(target_day_id uuid)
returns public.workout_routines
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  target_routine public.workout_routines;
  current_day_id uuid;
  day_count integer;
  normalized_cycle_index integer;
  result public.workout_routines;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workout:' || (select auth.uid())::text, 0)
  );

  select routine.* into target_routine
  from public.workout_routines routine
  join public.routine_days day on day.routine_id = routine.id
  where day.id = target_day_id
    and routine.user_id = (select auth.uid())
    and routine.status = 'active'
  for update of routine;

  if target_routine.id is null then
    raise exception 'That day was not found in your active routine' using errcode = 'P0001';
  end if;

  -- Refuse while a workout is open, so skipping cannot strand a session on a day the
  -- rotation has already moved past.
  if exists (
    select 1 from public.workout_sessions s
    where s.user_id = (select auth.uid()) and s.status = 'in_progress'
  ) then
    raise exception 'Finish or discard the workout in progress first' using errcode = 'P0001';
  end if;

  select count(*) into day_count
  from public.routine_days day where day.routine_id = target_routine.id;

  normalized_cycle_index := target_routine.current_cycle_index % day_count;

  select day.id into current_day_id
  from public.routine_days day
  where day.routine_id = target_routine.id
  order by day.day_index, day.id
  offset normalized_cycle_index
  limit 1;

  if current_day_id is distinct from target_day_id then
    raise exception 'That day is not the current cycle day' using errcode = 'P0001';
  end if;

  update public.workout_routines
  set current_cycle_index = (normalized_cycle_index + 1) % day_count
  where id = target_routine.id
  returning * into result;

  return result;
end;
$function$;

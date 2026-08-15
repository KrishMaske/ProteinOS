-- Starting a workout stamps the default gym. Asking at the start of every session would
-- be answered carelessly or dismissed, and a field filled in wrongly is worse for the
-- comparison than one left null.
create or replace function public.start_or_resume_workout(target_day_id uuid)
returns public.workout_sessions
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  existing_session public.workout_sessions;
  selected_routine public.workout_routines;
  selected_day public.routine_days;
  created_session public.workout_sessions;
  exercise_count integer;
  default_gym_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workout:' || (select auth.uid())::text, 0)
  );

  select s.* into existing_session
  from public.workout_sessions s
  where s.user_id = (select auth.uid()) and s.status = 'in_progress'
  order by s.started_at desc, s.id
  limit 1
  for update;

  if existing_session.id is not null then
    return existing_session;
  end if;

  select r.* into selected_routine
  from public.workout_routines r
  join public.routine_days d on d.routine_id = r.id
  where d.id = target_day_id
    and not d.is_rest_day
    and r.user_id = (select auth.uid())
    and r.status = 'active'
  for update of r;

  if selected_routine.id is null then
    raise exception 'Choose a training day from your active routine' using errcode = 'P0001';
  end if;

  select d.* into selected_day
  from public.routine_days d
  where d.id = target_day_id and d.routine_id = selected_routine.id;

  select pg_catalog.count(*) into exercise_count
  from public.routine_exercises e where e.routine_day_id = selected_day.id;
  if exercise_count = 0 then
    raise exception 'Add exercises before starting this workout' using errcode = 'P0001';
  end if;

  select g.id into default_gym_id
  from public.gyms g
  where g.user_id = (select auth.uid()) and g.is_default
  limit 1;

  insert into public.workout_sessions (user_id, routine_id, routine_day_id, name, status, gym_id)
  values (
    (select auth.uid()), selected_routine.id, selected_day.id,
    selected_routine.name || ' · ' || selected_day.name, 'in_progress', default_gym_id
  ) returning * into created_session;

  insert into public.workout_session_exercises (
    workout_session_id, exercise_id, custom_exercise_id, exercise_index, notes
  )
  select created_session.id, e.exercise_id, e.custom_exercise_id, e.exercise_index, e.notes
  from public.routine_exercises e
  where e.routine_day_id = selected_day.id
  order by e.exercise_index;

  insert into public.workout_sets (
    workout_session_exercise_id, set_index, set_type
  )
  select session_exercise.id, generated_set.number - 1, 'working'
  from public.workout_session_exercises session_exercise
  join public.routine_exercises routine_exercise
    on routine_exercise.routine_day_id = selected_day.id
    and routine_exercise.exercise_index = session_exercise.exercise_index
  cross join lateral pg_catalog.generate_series(1, routine_exercise.target_sets)
    as generated_set(number)
  where session_exercise.workout_session_id = created_session.id;

  return created_session;
end;
$function$;

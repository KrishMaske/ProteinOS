alter table public.workout_routines
  add column current_cycle_index smallint not null default 0,
  add constraint workout_routines_current_cycle_index_check
    check (current_cycle_index >= 0);

alter table public.workout_routines
  drop constraint workout_routines_source_check,
  add constraint workout_routines_source_check
    check (source in ('manual', 'ai', 'import'));

alter table public.routine_days
  add column is_rest_day boolean not null default false;

create unique index workout_sessions_one_in_progress_per_user_idx
  on public.workout_sessions (user_id)
  where status = 'in_progress';

create or replace function public.activate_routine(target_routine_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_routine public.workout_routines;
  day_count integer;
  training_day_count integer;
  empty_training_day_count integer;
  populated_rest_day_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('routine:' || (select auth.uid())::text, 0)
  );

  select r.* into target_routine
  from public.workout_routines r
  where r.id = target_routine_id
    and r.user_id = (select auth.uid())
    and r.status = 'draft'
  for update;

  if target_routine.id is null then
    raise exception 'Routine must be an owned draft' using errcode = 'P0001';
  end if;

  select
    count(*),
    count(*) filter (where not d.is_rest_day),
    count(*) filter (
      where not d.is_rest_day
        and not exists (
          select 1
          from public.routine_exercises e
          where e.routine_day_id = d.id
        )
    ),
    count(*) filter (
      where d.is_rest_day
        and exists (
          select 1
          from public.routine_exercises e
          where e.routine_day_id = d.id
        )
    )
  into day_count, training_day_count, empty_training_day_count, populated_rest_day_count
  from public.routine_days d
  where d.routine_id = target_routine_id;

  if day_count = 0 then
    raise exception 'A routine must contain at least one cycle day' using errcode = 'P0001';
  end if;
  if training_day_count = 0 then
    raise exception 'A routine must contain at least one training day' using errcode = 'P0001';
  end if;
  if empty_training_day_count > 0 then
    raise exception 'Every training day must contain at least one exercise' using errcode = 'P0001';
  end if;
  if populated_rest_day_count > 0 then
    raise exception 'Rest days cannot contain exercises' using errcode = 'P0001';
  end if;

  perform set_config('app.routine_activation_allowed', 'true', true);

  update public.workout_routines
  set status = 'archived'
  where user_id = (select auth.uid())
    and status = 'active'
    and id <> target_routine_id;

  update public.workout_routines
  set status = 'active', current_cycle_index = 0
  where id = target_routine_id
    and user_id = (select auth.uid())
    and status = 'draft';
end;
$$;

create or replace function public.reorder_routine_days(
  target_routine_id uuid,
  ordered_day_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_routine public.workout_routines;
  expected_count integer;
  supplied_unique_count integer;
  current_day_id uuid;
  normalized_cycle_index integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('routine:' || (select auth.uid())::text, 0)
  );

  select r.* into target_routine
  from public.workout_routines r
  where r.id = target_routine_id
    and r.user_id = (select auth.uid())
  for update;

  if target_routine.id is null then
    raise exception 'Routine was not found' using errcode = 'P0001';
  end if;

  select count(*) into expected_count
  from public.routine_days
  where routine_id = target_routine_id;

  select count(distinct value) into supplied_unique_count
  from unnest(ordered_day_ids) as value;

  if ordered_day_ids is null
    or expected_count = 0
    or expected_count <> cardinality(ordered_day_ids)
    or supplied_unique_count <> cardinality(ordered_day_ids)
    or exists (
      select 1
      from unnest(ordered_day_ids) as value
      where not exists (
        select 1
        from public.routine_days
        where id = value and routine_id = target_routine_id
      )
    ) then
    raise exception 'Ordered day IDs must exactly match the routine' using errcode = 'P0001';
  end if;

  if target_routine.status = 'active' then
    normalized_cycle_index := target_routine.current_cycle_index % expected_count;

    select d.id into current_day_id
    from public.routine_days d
    where d.routine_id = target_routine_id
    order by d.day_index, d.id
    offset normalized_cycle_index
    limit 1;
  end if;

  update public.routine_days as day
  set day_index = ordered.position - 1
  from unnest(ordered_day_ids) with ordinality as ordered(id, position)
  where day.id = ordered.id
    and day.routine_id = target_routine_id;

  if current_day_id is not null then
    update public.workout_routines
    set current_cycle_index = array_position(ordered_day_ids, current_day_id) - 1
    where id = target_routine_id;
  end if;
end;
$$;

create function public.start_or_resume_workout(target_day_id uuid)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_session public.workout_sessions;
  selected_routine public.workout_routines;
  selected_day public.routine_days;
  created_session public.workout_sessions;
  exercise_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workout:' || (select auth.uid())::text, 0)
  );

  select s.* into existing_session
  from public.workout_sessions s
  where s.user_id = (select auth.uid())
    and s.status = 'in_progress'
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
  where d.id = target_day_id
    and d.routine_id = selected_routine.id;

  select count(*) into exercise_count
  from public.routine_exercises e
  where e.routine_day_id = selected_day.id;

  if exercise_count = 0 then
    raise exception 'Add exercises before starting this workout' using errcode = 'P0001';
  end if;

  insert into public.workout_sessions (
    user_id,
    routine_id,
    routine_day_id,
    name,
    status
  ) values (
    (select auth.uid()),
    selected_routine.id,
    selected_day.id,
    selected_routine.name || ' · ' || selected_day.name,
    'in_progress'
  )
  returning * into created_session;

  insert into public.workout_session_exercises (
    workout_session_id,
    exercise_id,
    exercise_index,
    notes
  )
  select
    created_session.id,
    e.exercise_id,
    e.exercise_index,
    e.notes
  from public.routine_exercises e
  where e.routine_day_id = selected_day.id
  order by e.exercise_index;

  insert into public.workout_sets (
    workout_session_exercise_id,
    set_index,
    set_type
  )
  select
    session_exercise.id,
    generated_set.number - 1,
    'working'
  from public.workout_session_exercises session_exercise
  join public.routine_exercises routine_exercise
    on routine_exercise.routine_day_id = selected_day.id
    and routine_exercise.exercise_index = session_exercise.exercise_index
  cross join lateral generate_series(1, routine_exercise.target_sets) as generated_set(number)
  where session_exercise.workout_session_id = created_session.id;

  return created_session;
end;
$$;

create function public.log_active_workout_set(
  target_set_id uuid,
  target_weight_kg numeric,
  target_reps smallint
)
returns public.workout_sets
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owning_session public.workout_sessions;
  target_set public.workout_sets;
  result public.workout_sets;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_weight_kg is not null and target_weight_kg < 0 then
    raise exception 'Weight must be null or zero or greater' using errcode = '22023';
  end if;
  if target_reps is null or target_reps <= 0 then
    raise exception 'Reps must be greater than zero' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workout:' || (select auth.uid())::text, 0)
  );

  select session.* into owning_session
  from public.workout_sessions session
  join public.workout_session_exercises session_exercise
    on session_exercise.workout_session_id = session.id
  join public.workout_sets workout_set
    on workout_set.workout_session_exercise_id = session_exercise.id
  where workout_set.id = target_set_id
    and session.user_id = (select auth.uid())
  for update of session;

  if owning_session.id is null or owning_session.status <> 'in_progress' then
    raise exception 'Workout set is not available in an active workout' using errcode = 'P0001';
  end if;

  select workout_set.* into target_set
  from public.workout_sets workout_set
  join public.workout_session_exercises session_exercise
    on session_exercise.id = workout_set.workout_session_exercise_id
  where workout_set.id = target_set_id
    and session_exercise.workout_session_id = owning_session.id
  for update of workout_set;

  if target_set.id is null then
    raise exception 'Workout set is not available in an active workout' using errcode = 'P0001';
  end if;

  if target_set.completed_at is not null
    and target_set.weight_kg is not distinct from target_weight_kg::numeric(8,3)
    and target_set.reps is not distinct from target_reps then
    return target_set;
  end if;

  update public.workout_sets
  set
    weight_kg = target_weight_kg,
    reps = target_reps,
    completed_at = coalesce(completed_at, pg_catalog.clock_timestamp())
  where id = target_set_id
  returning * into result;

  return result;
end;
$$;

create function public.complete_workout(target_session_id uuid)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_session public.workout_sessions;
  result public.workout_sessions;
  target_routine public.workout_routines;
  current_day_id uuid;
  day_count integer;
  normalized_cycle_index integer;
  finished_at timestamptz := pg_catalog.clock_timestamp();
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workout:' || (select auth.uid())::text, 0)
  );

  select session.* into target_session
  from public.workout_sessions session
  where session.id = target_session_id
    and session.user_id = (select auth.uid())
  for update;

  if target_session.id is null then
    raise exception 'Workout was not found' using errcode = 'P0001';
  end if;
  if target_session.status = 'completed' then
    return target_session;
  end if;
  if target_session.status <> 'in_progress' then
    raise exception 'Only an active workout can be completed' using errcode = 'P0001';
  end if;

  update public.workout_sessions
  set
    status = 'completed',
    completed_at = finished_at,
    duration_seconds = greatest(
      0,
      floor(extract(epoch from (finished_at - target_session.started_at)))::integer
    )
  where id = target_session.id
  returning * into result;

  if target_session.routine_id is null or target_session.routine_day_id is null then
    return result;
  end if;

  select routine.* into target_routine
  from public.workout_routines routine
  where routine.id = target_session.routine_id
    and routine.user_id = (select auth.uid())
  for update;

  if target_routine.id is null or target_routine.status <> 'active' then
    return result;
  end if;

  select count(*) into day_count
  from public.routine_days day
  where day.routine_id = target_routine.id;

  if day_count = 0 then
    return result;
  end if;

  normalized_cycle_index := target_routine.current_cycle_index % day_count;

  select day.id into current_day_id
  from public.routine_days day
  where day.routine_id = target_routine.id
  order by day.day_index, day.id
  offset normalized_cycle_index
  limit 1;

  if current_day_id = target_session.routine_day_id then
    update public.workout_routines
    set current_cycle_index = (normalized_cycle_index + 1) % day_count
    where id = target_routine.id;
  end if;

  return result;
end;
$$;

create function public.complete_rest_day(target_day_id uuid)
returns public.workout_routines
language plpgsql
security invoker
set search_path = ''
as $$
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
    and day.is_rest_day
    and routine.user_id = (select auth.uid())
    and routine.status = 'active'
  for update of routine;

  if target_routine.id is null then
    raise exception 'Rest day was not found in your active routine' using errcode = 'P0001';
  end if;

  select count(*) into day_count
  from public.routine_days day
  where day.routine_id = target_routine.id;

  normalized_cycle_index := target_routine.current_cycle_index % day_count;

  select day.id into current_day_id
  from public.routine_days day
  where day.routine_id = target_routine.id
  order by day.day_index, day.id
  offset normalized_cycle_index
  limit 1;

  if current_day_id is distinct from target_day_id then
    raise exception 'That rest day is not the current cycle day' using errcode = 'P0001';
  end if;

  update public.workout_routines
  set current_cycle_index = (normalized_cycle_index + 1) % day_count
  where id = target_routine.id
  returning * into result;

  return result;
end;
$$;

create function public.create_routine_draft_from_json(
  target_name text,
  target_description text,
  target_source text,
  target_days jsonb
)
returns public.workout_routines
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_name text := trim(target_name);
  normalized_description text := nullif(trim(target_description), '');
  created_routine public.workout_routines;
  created_day_id uuid;
  day_value jsonb;
  exercise_value jsonb;
  day_number bigint;
  training_day_seen boolean := false;
  exercise_total integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if normalized_name is null or char_length(normalized_name) not between 1 and 120 then
    raise exception 'Routine name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if target_source is null or target_source not in ('manual', 'ai', 'import') then
    raise exception 'Routine source must be manual, ai, or import' using errcode = '22023';
  end if;
  if target_days is null or jsonb_typeof(target_days) <> 'array' then
    raise exception 'Routine days must be an array containing 1 to 21 days' using errcode = '22023';
  end if;
  if jsonb_array_length(target_days) not between 1 and 21 then
    raise exception 'Routine days must be an array containing 1 to 21 days' using errcode = '22023';
  end if;

  for day_value, day_number in
    select value, ordinality
    from jsonb_array_elements(target_days) with ordinality
  loop
    if jsonb_typeof(day_value) <> 'object' then
      raise exception 'Each routine day must use the supported day fields' using errcode = '22023';
    end if;
    if not (day_value ?& array['name', 'notes', 'isRestDay', 'exercises'])
      or exists (
        select 1
        from jsonb_object_keys(day_value) as fields(key)
        where fields.key <> all (array['name', 'notes', 'isRestDay', 'exercises'])
      ) then
      raise exception 'Each routine day must use the supported day fields' using errcode = '22023';
    end if;
    if jsonb_typeof(day_value->'name') <> 'string' then
      raise exception 'Each routine day needs a name between 1 and 120 characters' using errcode = '22023';
    end if;
    if char_length(trim(day_value->>'name')) not between 1 and 120 then
      raise exception 'Each routine day needs a name between 1 and 120 characters' using errcode = '22023';
    end if;
    if jsonb_typeof(day_value->'notes') not in ('string', 'null') then
      raise exception 'Routine day notes must be text or null' using errcode = '22023';
    end if;
    if jsonb_typeof(day_value->'isRestDay') <> 'boolean' then
      raise exception 'isRestDay must be a boolean' using errcode = '22023';
    end if;
    if jsonb_typeof(day_value->'exercises') <> 'array' then
      raise exception 'Routine day exercises must be an array' using errcode = '22023';
    end if;

    exercise_total := jsonb_array_length(day_value->'exercises');
    if exercise_total > 50 then
      raise exception 'A routine day can contain at most 50 exercises' using errcode = '22023';
    end if;
    if (day_value->>'isRestDay')::boolean and exercise_total <> 0 then
      raise exception 'Rest days cannot contain exercises' using errcode = '22023';
    end if;
    if not (day_value->>'isRestDay')::boolean and exercise_total = 0 then
      raise exception 'Training days must contain at least one exercise' using errcode = '22023';
    end if;
    if not (day_value->>'isRestDay')::boolean then
      training_day_seen := true;
    end if;

    for exercise_value in
      select value
      from jsonb_array_elements(day_value->'exercises')
    loop
      if jsonb_typeof(exercise_value) <> 'object' then
        raise exception 'Each exercise must use the supported exercise fields' using errcode = '22023';
      end if;
      if not (exercise_value ?& array[
          'exerciseId', 'targetSets', 'repMin', 'repMax', 'restSeconds',
          'targetRpe', 'targetRir', 'notes'
        ])
        or exists (
          select 1
          from jsonb_object_keys(exercise_value) as fields(key)
          where fields.key <> all (array[
            'exerciseId', 'targetSets', 'repMin', 'repMax', 'restSeconds',
            'targetRpe', 'targetRir', 'notes'
          ])
      ) then
        raise exception 'Each exercise must use the supported exercise fields' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'exerciseId') <> 'string' then
        raise exception 'Each exercise needs a catalog ID' using errcode = '22023';
      end if;
      if char_length(trim(exercise_value->>'exerciseId')) = 0 then
        raise exception 'Each exercise needs a catalog ID' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'targetSets') <> 'number' then
        raise exception 'Target sets must be an integer between 1 and 20' using errcode = '22023';
      end if;
      if (exercise_value->>'targetSets')::numeric <> trunc((exercise_value->>'targetSets')::numeric)
        or (exercise_value->>'targetSets')::numeric not between 1 and 20 then
        raise exception 'Target sets must be an integer between 1 and 20' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'repMin') not in ('number', 'null') then
        raise exception 'Minimum reps must be null or an integer between 1 and 100' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'repMin') = 'number'
        and (
          (exercise_value->>'repMin')::numeric <> trunc((exercise_value->>'repMin')::numeric)
          or (exercise_value->>'repMin')::numeric not between 1 and 100
        ) then
        raise exception 'Minimum reps must be null or an integer between 1 and 100' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'repMax') not in ('number', 'null') then
        raise exception 'Maximum reps must be null or an integer between 1 and 100' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'repMax') = 'number'
        and (
          (exercise_value->>'repMax')::numeric <> trunc((exercise_value->>'repMax')::numeric)
          or (exercise_value->>'repMax')::numeric not between 1 and 100
        ) then
        raise exception 'Maximum reps must be null or an integer between 1 and 100' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'repMin') = 'number'
        and jsonb_typeof(exercise_value->'repMax') = 'number'
        and (exercise_value->>'repMax')::numeric < (exercise_value->>'repMin')::numeric then
        raise exception 'Maximum reps must be greater than or equal to minimum reps' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'restSeconds') <> 'number' then
        raise exception 'Rest seconds must be an integer between 0 and 3600' using errcode = '22023';
      end if;
      if (exercise_value->>'restSeconds')::numeric <> trunc((exercise_value->>'restSeconds')::numeric)
        or (exercise_value->>'restSeconds')::numeric not between 0 and 3600 then
        raise exception 'Rest seconds must be an integer between 0 and 3600' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'targetRpe') not in ('number', 'null') then
        raise exception 'Target RPE must be null or between 1 and 10' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'targetRpe') = 'number'
        and (exercise_value->>'targetRpe')::numeric not between 1 and 10 then
        raise exception 'Target RPE must be null or between 1 and 10' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'targetRir') not in ('number', 'null') then
        raise exception 'Target RIR must be null or between 0 and 10' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'targetRir') = 'number'
        and (exercise_value->>'targetRir')::numeric not between 0 and 10 then
        raise exception 'Target RIR must be null or between 0 and 10' using errcode = '22023';
      end if;
      if jsonb_typeof(exercise_value->'notes') not in ('string', 'null') then
        raise exception 'Exercise notes must be text or null' using errcode = '22023';
      end if;
      if not exists (
        select 1
        from public.exercise_catalog catalog
        where catalog.id = trim(exercise_value->>'exerciseId')
      ) then
        raise exception 'Routine contains an unknown exercise ID' using errcode = 'P0001';
      end if;
    end loop;
  end loop;

  if not training_day_seen then
    raise exception 'A routine must contain at least one training day' using errcode = '22023';
  end if;

  insert into public.workout_routines (
    user_id,
    name,
    description,
    status,
    source,
    current_cycle_index
  ) values (
    (select auth.uid()),
    normalized_name,
    normalized_description,
    'draft',
    target_source,
    0
  )
  returning * into created_routine;

  for day_value, day_number in
    select value, ordinality
    from jsonb_array_elements(target_days) with ordinality
  loop
    insert into public.routine_days (
      routine_id,
      name,
      day_index,
      notes,
      is_rest_day
    ) values (
      created_routine.id,
      trim(day_value->>'name'),
      day_number - 1,
      nullif(trim(day_value->>'notes'), ''),
      (day_value->>'isRestDay')::boolean
    )
    returning id into created_day_id;

    if not (day_value->>'isRestDay')::boolean then
      insert into public.routine_exercises (
        routine_day_id,
        exercise_id,
        exercise_index,
        target_sets,
        rep_min,
        rep_max,
        rest_seconds,
        target_rpe,
        target_rir,
        notes
      )
      select
        created_day_id,
        trim(exercise.value->>'exerciseId'),
        exercise.ordinality - 1,
        (exercise.value->>'targetSets')::smallint,
        (exercise.value->>'repMin')::smallint,
        (exercise.value->>'repMax')::smallint,
        (exercise.value->>'restSeconds')::smallint,
        (exercise.value->>'targetRpe')::numeric,
        (exercise.value->>'targetRir')::numeric,
        nullif(trim(exercise.value->>'notes'), '')
      from jsonb_array_elements(day_value->'exercises') with ordinality as exercise(value, ordinality)
      order by exercise.ordinality;
    end if;
  end loop;

  return created_routine;
end;
$$;

revoke all on function public.activate_routine(uuid) from public, anon;
revoke all on function public.reorder_routine_days(uuid, uuid[]) from public, anon;
revoke all on function public.start_or_resume_workout(uuid) from public, anon;
revoke all on function public.log_active_workout_set(uuid, numeric, smallint) from public, anon;
revoke all on function public.complete_workout(uuid) from public, anon;
revoke all on function public.complete_rest_day(uuid) from public, anon;
revoke all on function public.create_routine_draft_from_json(text, text, text, jsonb) from public, anon;

grant execute on function public.activate_routine(uuid) to authenticated;
grant execute on function public.reorder_routine_days(uuid, uuid[]) to authenticated;
grant execute on function public.start_or_resume_workout(uuid) to authenticated;
grant execute on function public.log_active_workout_set(uuid, numeric, smallint) to authenticated;
grant execute on function public.complete_workout(uuid) to authenticated;
grant execute on function public.complete_rest_day(uuid) to authenticated;
grant execute on function public.create_routine_draft_from_json(text, text, text, jsonb) to authenticated;

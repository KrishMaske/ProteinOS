alter table public.routine_exercises
drop constraint routine_exercises_routine_day_id_exercise_index_key;

alter table public.routine_exercises
add constraint routine_exercises_day_position_unique
unique (routine_day_id, exercise_index)
deferrable initially deferred;

alter table public.routine_days
drop constraint routine_days_routine_id_day_index_key;

alter table public.routine_days
add constraint routine_days_position_unique
unique (routine_id, day_index)
deferrable initially deferred;

create function public.reorder_routine_exercises(target_day_id uuid, ordered_exercise_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected_count integer;
  supplied_unique_count integer;
begin
  select count(*) into expected_count
  from public.routine_exercises
  where routine_day_id = target_day_id;

  select count(distinct value) into supplied_unique_count
  from unnest(ordered_exercise_ids) as value;

  if expected_count <> cardinality(ordered_exercise_ids)
    or supplied_unique_count <> cardinality(ordered_exercise_ids)
    or exists (
      select 1 from unnest(ordered_exercise_ids) as value
      where not exists (
        select 1 from public.routine_exercises
        where id = value and routine_day_id = target_day_id
      )
    ) then
    raise exception 'Ordered exercise IDs must exactly match the routine day' using errcode = 'P0001';
  end if;

  update public.routine_exercises as exercise
  set exercise_index = ordered.position - 1
  from unnest(ordered_exercise_ids) with ordinality as ordered(id, position)
  where exercise.id = ordered.id and exercise.routine_day_id = target_day_id;
end;
$$;

create function public.reorder_routine_days(target_routine_id uuid, ordered_day_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected_count integer;
  supplied_unique_count integer;
begin
  select count(*) into expected_count
  from public.routine_days
  where routine_id = target_routine_id;

  select count(distinct value) into supplied_unique_count
  from unnest(ordered_day_ids) as value;

  if expected_count <> cardinality(ordered_day_ids)
    or supplied_unique_count <> cardinality(ordered_day_ids)
    or exists (
      select 1 from unnest(ordered_day_ids) as value
      where not exists (
        select 1 from public.routine_days
        where id = value and routine_id = target_routine_id
      )
    ) then
    raise exception 'Ordered day IDs must exactly match the routine' using errcode = 'P0001';
  end if;

  update public.routine_days as day
  set day_index = ordered.position - 1
  from unnest(ordered_day_ids) with ordinality as ordered(id, position)
  where day.id = ordered.id and day.routine_id = target_routine_id;
end;
$$;

revoke all on function public.reorder_routine_exercises(uuid, uuid[]) from public, anon;
revoke all on function public.reorder_routine_days(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_routine_exercises(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_routine_days(uuid, uuid[]) to authenticated;


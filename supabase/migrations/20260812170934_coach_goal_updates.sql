create function public.set_fitness_goal(
  target_goal_type public.goal_type,
  target_notes text default null
)
returns public.fitness_goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.fitness_goals;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.fitness_goals
  set goal_type = target_goal_type,
      notes = nullif(trim(target_notes), '')
  where user_id = (select auth.uid())
    and is_active
  returning * into result;

  if found then
    return result;
  end if;

  insert into public.fitness_goals (user_id, goal_type, notes, is_active)
  values ((select auth.uid()), target_goal_type, nullif(trim(target_notes), ''), true)
  returning * into result;

  return result;
end;
$$;

revoke all on function public.set_fitness_goal(public.goal_type, text) from public, anon;
grant execute on function public.set_fitness_goal(public.goal_type, text) to authenticated;

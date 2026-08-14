-- Keep goal changes auditable and Coach confirmations atomic.
alter table public.fitness_goals
  add constraint fitness_goals_notes_length_check
  check (notes is null or char_length(notes) <= 500) not valid;

drop function public.set_fitness_goal(public.goal_type, text);

create function public.set_fitness_goal(
  target_goal_type public.goal_type,
  target_notes text default null,
  preserve_existing_notes boolean default false
)
returns public.fitness_goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_goal public.fitness_goals;
  result public.fitness_goals;
  next_notes text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((select auth.uid())::text, 0));

  select * into current_goal
  from public.fitness_goals
  where user_id = (select auth.uid()) and is_active
  for update;

  next_notes := case
    when preserve_existing_notes and target_notes is null then current_goal.notes
    else nullif(trim(target_notes), '')
  end;

  if char_length(coalesce(next_notes, '')) > 500 then
    raise exception 'Goal notes must be 500 characters or fewer' using errcode = '22001';
  end if;

  if current_goal.id is not null
    and current_goal.goal_type = target_goal_type
    and current_goal.notes is not distinct from next_notes then
    return current_goal;
  end if;

  if current_goal.id is not null then
    update public.fitness_goals set is_active = false where id = current_goal.id;
  end if;

  insert into public.fitness_goals (user_id, goal_type, notes, is_active)
  values ((select auth.uid()), target_goal_type, next_notes, true)
  returning * into result;

  return result;
end;
$$;

revoke all on function public.set_fitness_goal(public.goal_type, text, boolean) from public, anon;
grant execute on function public.set_fitness_goal(public.goal_type, text, boolean) to authenticated;

create policy ai_messages_update_own on public.ai_messages
for update to authenticated
using (exists (
  select 1 from public.ai_conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.ai_conversations c
  where c.id = conversation_id and c.user_id = (select auth.uid())
));

create function public.confirm_coach_goal_update(
  target_message_id uuid,
  target_goal_type public.goal_type,
  target_notes text,
  expected_goal_id uuid
)
returns public.fitness_goals
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action jsonb;
  current_goal public.fitness_goals;
  result public.fitness_goals;
  normalized_notes text := nullif(trim(target_notes), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if char_length(coalesce(normalized_notes, '')) > 500 then
    raise exception 'Goal notes must be 500 characters or fewer' using errcode = '22001';
  end if;

  select m.ui_action into action
  from public.ai_messages m
  join public.ai_conversations c on c.id = m.conversation_id
  where m.id = target_message_id
    and m.role = 'assistant'
    and c.user_id = (select auth.uid())
  for update of m;

  if action is null or action->>'type' <> 'confirm_goal_update' then
    raise exception 'Goal confirmation was not found' using errcode = 'P0001';
  end if;
  if action ? 'resolution' then
    raise exception 'This goal confirmation has already been resolved' using errcode = 'P0001';
  end if;
  if action->>'goalType' <> target_goal_type::text
    or nullif(action->>'notes', '') is distinct from normalized_notes
    or nullif(action->>'currentGoalId', '') is distinct from expected_goal_id::text then
    raise exception 'Goal confirmation does not match the saved proposal' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended((select auth.uid())::text, 0));

  select * into current_goal
  from public.fitness_goals
  where user_id = (select auth.uid()) and is_active
  for update;

  if current_goal.id is distinct from expected_goal_id then
    raise exception 'Your goal changed since this proposal. Ask Coach for a new update.' using errcode = 'P0001';
  end if;

  if current_goal.id is not null
    and current_goal.goal_type = target_goal_type
    and current_goal.notes is not distinct from normalized_notes then
    result := current_goal;
  else
    if current_goal.id is not null then
      update public.fitness_goals set is_active = false where id = current_goal.id;
    end if;
    insert into public.fitness_goals (user_id, goal_type, notes, is_active)
    values ((select auth.uid()), target_goal_type, normalized_notes, true)
    returning * into result;
  end if;

  update public.ai_messages
  set ui_action = ui_action || jsonb_build_object(
    'resolution', 'applied',
    'resolvedAt', pg_catalog.clock_timestamp()
  )
  where id = target_message_id;

  return result;
end;
$$;

create function public.dismiss_coach_goal_update(target_message_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select m.ui_action into action
  from public.ai_messages m
  join public.ai_conversations c on c.id = m.conversation_id
  where m.id = target_message_id
    and m.role = 'assistant'
    and c.user_id = (select auth.uid())
  for update of m;

  if action is null or action->>'type' <> 'confirm_goal_update' then
    raise exception 'Goal confirmation was not found' using errcode = 'P0001';
  end if;
  if action ? 'resolution' then
    return;
  end if;

  update public.ai_messages
  set ui_action = ui_action || jsonb_build_object(
    'resolution', 'dismissed',
    'resolvedAt', pg_catalog.clock_timestamp()
  )
  where id = target_message_id;
end;
$$;

revoke all on function public.confirm_coach_goal_update(uuid, public.goal_type, text, uuid) from public, anon;
revoke all on function public.dismiss_coach_goal_update(uuid) from public, anon;
grant execute on function public.confirm_coach_goal_update(uuid, public.goal_type, text, uuid) to authenticated;
grant execute on function public.dismiss_coach_goal_update(uuid) to authenticated;

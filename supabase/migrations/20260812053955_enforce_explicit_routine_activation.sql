create function private.enforce_explicit_routine_activation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'active'
     and old.status is distinct from 'active'
     and coalesce(current_setting('app.routine_activation_allowed', true), 'false') <> 'true' then
    raise exception 'Activate routines through activate_routine() after explicit user approval'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger workout_routines_require_explicit_activation
before update of status on public.workout_routines
for each row execute function private.enforce_explicit_routine_activation();

create or replace function public.activate_routine(target_routine_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare affected integer;
begin
  perform set_config('app.routine_activation_allowed', 'true', true);

  update public.workout_routines set status = 'archived'
  where user_id = (select auth.uid()) and status = 'active' and id <> target_routine_id;

  update public.workout_routines set status = 'active'
  where id = target_routine_id and user_id = (select auth.uid()) and status = 'draft';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Routine must be an owned draft' using errcode = 'P0001';
  end if;
end;
$$;


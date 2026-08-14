create table public.saved_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  serving_quantity numeric(10,3) check (serving_quantity > 0),
  serving_unit text check (serving_unit is null or char_length(btrim(serving_unit)) between 1 and 40),
  serving_grams numeric(10,3) check (serving_grams > 0),
  calories numeric(10,2) not null check (calories >= 0),
  protein_grams numeric(10,2) not null default 0 check (protein_grams >= 0),
  carbohydrate_grams numeric(10,2) not null default 0 check (carbohydrate_grams >= 0),
  fat_grams numeric(10,2) not null default 0 check (fat_grams >= 0),
  fiber_grams numeric(10,2) check (fiber_grams >= 0),
  last_logged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index saved_foods_user_recent_idx
  on public.saved_foods (user_id, last_logged_at desc nulls last, created_at desc);

create trigger saved_foods_set_updated_at
before update on public.saved_foods
for each row execute function private.set_updated_at();

alter table public.saved_foods enable row level security;

create policy saved_foods_select_own
on public.saved_foods for select
to authenticated
using ((select auth.uid()) = user_id);

create policy saved_foods_insert_own
on public.saved_foods for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy saved_foods_update_own
on public.saved_foods for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy saved_foods_delete_own
on public.saved_foods for delete
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.saved_foods from public, anon;
grant select, insert, update, delete on public.saved_foods to authenticated;

create function public.log_saved_food(
  target_saved_food_id uuid,
  target_logged_date date,
  target_meal_type public.meal_type
)
returns public.food_logs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_food public.saved_foods;
  food_log public.food_logs;
begin
  select *
  into saved_food
  from public.saved_foods
  where id = target_saved_food_id
    and user_id = (select auth.uid());

  if saved_food.id is null then
    raise exception 'Saved food was not found' using errcode = 'P0001';
  end if;

  if target_logged_date is null or target_meal_type is null then
    raise exception 'A date and meal are required' using errcode = '22023';
  end if;

  insert into public.food_logs (user_id, logged_date, meal_type, name, source)
  values ((select auth.uid()), target_logged_date, target_meal_type, saved_food.name, 'quick_add')
  returning * into food_log;

  insert into public.food_log_items (
    food_log_id,
    name,
    quantity,
    unit,
    grams,
    calories,
    protein_grams,
    carbohydrate_grams,
    fat_grams,
    fiber_grams
  ) values (
    food_log.id,
    saved_food.name,
    saved_food.serving_quantity,
    saved_food.serving_unit,
    saved_food.serving_grams,
    saved_food.calories,
    saved_food.protein_grams,
    saved_food.carbohydrate_grams,
    saved_food.fat_grams,
    saved_food.fiber_grams
  );

  update public.saved_foods
  set last_logged_at = now()
  where id = saved_food.id;

  return food_log;
end;
$$;

revoke all on function public.log_saved_food(uuid, date, public.meal_type) from public, anon;
grant execute on function public.log_saved_food(uuid, date, public.meal_type) to authenticated;

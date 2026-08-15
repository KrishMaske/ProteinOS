-- Logging the same saved food again used to add another row, so four rotis read as four
-- separate entries. When an untouched quick-add for the same food already exists in that
-- meal today, its quantity and macros are increased instead, which shows as a count.
--
-- Only a log holding exactly one item is folded into: anything with more has been edited
-- or came from somewhere else, and adding to it would silently rewrite the user's own
-- correction.
create or replace function public.log_saved_food(
  target_saved_food_id uuid,
  target_logged_date date,
  target_meal_type public.meal_type
)
returns public.food_logs
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  saved_food public.saved_foods;
  food_log public.food_logs;
  existing_id uuid;
begin
  select * into saved_food
  from public.saved_foods
  where id = target_saved_food_id and user_id = (select auth.uid());

  if saved_food.id is null then
    raise exception 'Saved food was not found' using errcode = 'P0001';
  end if;
  if target_logged_date is null or target_meal_type is null then
    raise exception 'A date and meal are required' using errcode = '22023';
  end if;

  select l.id into existing_id
  from public.food_logs l
  where l.user_id = (select auth.uid())
    and l.logged_date = target_logged_date
    and l.meal_type = target_meal_type
    and l.source = 'quick_add'
    and l.name = saved_food.name
    and (select count(*) from public.food_log_items i where i.food_log_id = l.id) = 1
  order by l.created_at desc
  limit 1;

  if existing_id is not null then
    update public.food_log_items i set
      -- A null serving quantity still counts as one, so the tally keeps rising.
      quantity = coalesce(i.quantity, 1) + coalesce(saved_food.serving_quantity, 1),
      grams = case
        when i.grams is null and saved_food.serving_grams is null then null
        else coalesce(i.grams, 0) + coalesce(saved_food.serving_grams, 0)
      end,
      calories = i.calories + saved_food.calories,
      protein_grams = i.protein_grams + saved_food.protein_grams,
      carbohydrate_grams = i.carbohydrate_grams + saved_food.carbohydrate_grams,
      fat_grams = i.fat_grams + saved_food.fat_grams,
      fiber_grams = case
        when i.fiber_grams is null and saved_food.fiber_grams is null then null
        else coalesce(i.fiber_grams, 0) + coalesce(saved_food.fiber_grams, 0)
      end
    where i.food_log_id = existing_id;

    update public.saved_foods set last_logged_at = now() where id = saved_food.id;
    select * into food_log from public.food_logs where id = existing_id;
    return food_log;
  end if;

  insert into public.food_logs (user_id, logged_date, meal_type, name, source)
  values ((select auth.uid()), target_logged_date, target_meal_type, saved_food.name, 'quick_add')
  returning * into food_log;

  insert into public.food_log_items (
    food_log_id, name, quantity, unit, grams,
    calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams
  ) values (
    food_log.id, saved_food.name, coalesce(saved_food.serving_quantity, 1), saved_food.serving_unit,
    saved_food.serving_grams, saved_food.calories, saved_food.protein_grams,
    saved_food.carbohydrate_grams, saved_food.fat_grams, saved_food.fiber_grams
  );

  update public.saved_foods set last_logged_at = now() where id = saved_food.id;
  return food_log;
end;
$function$;

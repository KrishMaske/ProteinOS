-- Logging a recipe copies its ingredients into food_log_items scaled by the fraction of
-- the recipe eaten, so a logged meal is ordinary food data. Editing or deleting the
-- recipe later cannot rewrite history that has already been logged.
create or replace function public.log_recipe(
  target_recipe_id uuid,
  target_logged_date date,
  target_meal_type public.meal_type,
  target_servings numeric default 1
)
returns public.food_logs
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  recipe public.recipes;
  food_log public.food_logs;
  scale numeric;
begin
  select * into recipe
  from public.recipes
  where id = target_recipe_id and user_id = (select auth.uid());

  if recipe.id is null then
    raise exception 'Recipe was not found' using errcode = 'P0001';
  end if;
  if target_logged_date is null or target_meal_type is null then
    raise exception 'A date and meal are required' using errcode = '22023';
  end if;
  if target_servings is null or target_servings <= 0 then
    raise exception 'Servings must be greater than zero' using errcode = '22023';
  end if;

  scale := target_servings / recipe.servings;

  insert into public.food_logs (user_id, logged_date, meal_type, name, source)
  values ((select auth.uid()), target_logged_date, target_meal_type, recipe.name, 'quick_add')
  returning * into food_log;

  insert into public.food_log_items (
    food_log_id, name, quantity, unit, grams,
    calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams
  )
  select
    food_log.id,
    i.name,
    case when i.quantity is null then null else round(i.quantity * scale, 2) end,
    i.unit,
    case when i.grams is null then null else round(i.grams * scale, 2) end,
    round(i.calories * scale, 2),
    round(i.protein_grams * scale, 2),
    round(i.carbohydrate_grams * scale, 2),
    round(i.fat_grams * scale, 2),
    case when i.fiber_grams is null then null else round(i.fiber_grams * scale, 2) end
  from public.recipe_ingredients i
  where i.recipe_id = recipe.id
  order by i.position;

  return food_log;
end;
$function$;

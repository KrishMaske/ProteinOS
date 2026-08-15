-- Same folding for recipes: logging a second serving raises the servings already recorded
-- rather than adding a parallel entry. Every ingredient row is topped up by the new
-- share, so the totals stay the sum of the parts.
--
-- Only folded into when the existing log still has exactly the recipe's ingredient rows,
-- so an edited log is never rewritten underneath the user.
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
  existing_id uuid;
  ingredient_count integer;
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

  select count(*) into ingredient_count
  from public.recipe_ingredients where recipe_id = recipe.id;

  select l.id into existing_id
  from public.food_logs l
  where l.user_id = (select auth.uid())
    and l.logged_date = target_logged_date
    and l.meal_type = target_meal_type
    and l.source = 'quick_add'
    and l.name = recipe.name
    and (select count(*) from public.food_log_items i where i.food_log_id = l.id) = ingredient_count
  order by l.created_at desc
  limit 1;

  if existing_id is not null then
    update public.food_log_items i set
      quantity = case when i.quantity is null then null else i.quantity + round(r.quantity * scale, 2) end,
      grams = case when i.grams is null then null else i.grams + round(coalesce(r.grams, 0) * scale, 2) end,
      calories = i.calories + round(r.calories * scale, 2),
      protein_grams = i.protein_grams + round(r.protein_grams * scale, 2),
      carbohydrate_grams = i.carbohydrate_grams + round(r.carbohydrate_grams * scale, 2),
      fat_grams = i.fat_grams + round(r.fat_grams * scale, 2),
      fiber_grams = case when i.fiber_grams is null then null else i.fiber_grams + round(coalesce(r.fiber_grams, 0) * scale, 2) end
    from public.recipe_ingredients r
    where i.food_log_id = existing_id and r.recipe_id = recipe.id and i.name = r.name;

    select * into food_log from public.food_logs where id = existing_id;
    return food_log;
  end if;

  insert into public.food_logs (user_id, logged_date, meal_type, name, source)
  values ((select auth.uid()), target_logged_date, target_meal_type, recipe.name, 'quick_add')
  returning * into food_log;

  insert into public.food_log_items (
    food_log_id, name, quantity, unit, grams,
    calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams
  )
  select
    food_log.id, i.name,
    case when i.quantity is null then null else round(i.quantity * scale, 2) end,
    i.unit,
    case when i.grams is null then null else round(i.grams * scale, 2) end,
    round(i.calories * scale, 2), round(i.protein_grams * scale, 2),
    round(i.carbohydrate_grams * scale, 2), round(i.fat_grams * scale, 2),
    case when i.fiber_grams is null then null else round(i.fiber_grams * scale, 2) end
  from public.recipe_ingredients i
  where i.recipe_id = recipe.id
  order by i.position;

  return food_log;
end;
$function$;

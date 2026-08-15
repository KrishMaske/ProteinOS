-- Adjusting a count has to move the macros with it, so this scales every stored figure by
-- the ratio between the new and old quantity in a single statement. Doing the arithmetic
-- here rather than in the client keeps the row internally consistent even if two devices
-- change it at once.
create or replace function public.set_food_log_item_quantity(
  target_item_id uuid,
  target_quantity numeric
)
returns public.food_log_items
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  item public.food_log_items;
  ratio numeric;
  result public.food_log_items;
begin
  select i.* into item
  from public.food_log_items i
  join public.food_logs l on l.id = i.food_log_id
  where i.id = target_item_id and l.user_id = (select auth.uid());

  if item.id is null then
    raise exception 'That food entry was not found' using errcode = 'P0001';
  end if;
  if target_quantity is null or target_quantity <= 0 then
    raise exception 'Count must be greater than zero' using errcode = '22023';
  end if;
  if coalesce(item.quantity, 0) <= 0 then
    raise exception 'That entry has no count to adjust' using errcode = 'P0001';
  end if;

  ratio := target_quantity / item.quantity;

  update public.food_log_items i set
    quantity = target_quantity,
    grams = case when i.grams is null then null else round(i.grams * ratio, 2) end,
    calories = round(i.calories * ratio, 2),
    protein_grams = round(i.protein_grams * ratio, 2),
    carbohydrate_grams = round(i.carbohydrate_grams * ratio, 2),
    fat_grams = round(i.fat_grams * ratio, 2),
    fiber_grams = case when i.fiber_grams is null then null else round(i.fiber_grams * ratio, 2) end
  where i.id = target_item_id
  returning * into result;

  return result;
end;
$function$;

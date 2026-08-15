-- Recipes mirror food_logs/food_log_items: a header plus ingredient rows carrying the
-- macros. Totals are never stored, they are summed from ingredients, so a recipe cannot
-- drift out of step with its own contents the way a cached total would.
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  description text check (description is null or length(description) <= 2000),
  instructions text check (instructions is null or length(instructions) <= 8000),
  servings numeric(6,2) not null default 1 check (servings > 0 and servings <= 100),
  image_path text,
  source text not null default 'manual' check (source in ('manual', 'coach')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 160),
  quantity numeric(10,2),
  unit text,
  grams numeric(10,2),
  calories numeric(10,2) not null default 0 check (calories >= 0),
  protein_grams numeric(10,2) not null default 0 check (protein_grams >= 0),
  carbohydrate_grams numeric(10,2) not null default 0 check (carbohydrate_grams >= 0),
  fat_grams numeric(10,2) not null default 0 check (fat_grams >= 0),
  fiber_grams numeric(10,2) check (fiber_grams is null or fiber_grams >= 0),
  position integer not null default 0
);

create index recipes_user_updated_idx on public.recipes (user_id, updated_at desc);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

create policy "Users manage own recipes" on public.recipes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Ingredients inherit ownership through their recipe rather than carrying a duplicate
-- user_id that could disagree with it.
create policy "Users manage own recipe ingredients" on public.recipe_ingredients
  for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = (select auth.uid())));

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function private.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Users read own recipe images" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload own recipe images" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete own recipe images" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

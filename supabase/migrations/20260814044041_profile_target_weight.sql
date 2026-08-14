-- Goal weight lives on the profile rather than fitness_goals because set_fitness_goal
-- replaces the active goal row, which would silently drop the target on every goal change.
alter table public.profiles
  add column target_weight_kg numeric(6, 2)
  check (target_weight_kg is null or (target_weight_kg > 0 and target_weight_kg <= 700));

comment on column public.profiles.target_weight_kg is
  'Optional goal bodyweight in kilograms, used for progress tracking against the active goal.';

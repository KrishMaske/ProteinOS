-- A goal body-fat band rather than a single number: body fat estimates carry a few
-- points of error, so a target range is the honest unit and matches how the healthy
-- reference bands are expressed.
alter table public.profiles
  add column goal_body_fat_min numeric(4,1),
  add column goal_body_fat_max numeric(4,1);

alter table public.profiles
  add constraint profiles_goal_body_fat_valid check (
    (goal_body_fat_min is null and goal_body_fat_max is null)
    or (
      goal_body_fat_min is not null
      and goal_body_fat_max is not null
      and goal_body_fat_min >= 3
      and goal_body_fat_max <= 60
      and goal_body_fat_min <= goal_body_fat_max
    )
  );

comment on column public.profiles.goal_body_fat_min is
  'Lower bound of the target body-fat band. Set together with goal_body_fat_max or both null.';

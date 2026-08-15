-- Training frequency and daily lifestyle activity are different things. Folding gym
-- sessions into the classic Harris-Benedict multipliers treats someone who lifts six
-- times a week as if they were also on their feet all day, which overstates maintenance
-- by several hundred calories. This column captures life outside training so the two can
-- be added rather than conflated.
create type public.daily_activity_level as enum ('sedentary', 'light', 'moderate', 'very_active');

alter table public.profiles
  add column daily_activity_level public.daily_activity_level not null default 'light';

comment on column public.profiles.daily_activity_level is
  'Activity outside deliberate training: desk job through manual labour. Training is costed separately from session length and frequency.';

create extension if not exists pgcrypto;

create type public.goal_type as enum ('recomp', 'fat_loss', 'muscle_gain', 'maintenance', 'strength');
create type public.training_experience as enum ('beginner', 'intermediate', 'advanced');
create type public.routine_status as enum ('draft', 'active', 'archived');
create type public.workout_status as enum ('in_progress', 'completed', 'discarded');
create type public.workout_set_type as enum ('warmup', 'working', 'failure', 'drop');
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snacks', 'other');
create type public.food_source as enum ('manual', 'quick_add', 'photo_estimate');
create type public.ai_run_status as enum ('started', 'completed', 'failed', 'refused');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  birth_date date,
  height_cm numeric(6,2) check (height_cm > 0),
  preferred_units text not null default 'metric' check (preferred_units in ('metric', 'imperial')),
  training_experience public.training_experience,
  training_days_per_week smallint check (training_days_per_week between 1 and 7),
  preferred_session_minutes smallint check (preferred_session_minutes between 15 and 240),
  available_equipment text[] not null default '{}',
  exercises_to_avoid text[] not null default '{}',
  diet_preference text,
  delete_food_photo_after_analysis boolean not null default true,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fitness_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_type public.goal_type not null,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index fitness_goals_one_active_idx on public.fitness_goals (user_id) where is_active;
create index fitness_goals_user_id_idx on public.fitness_goals (user_id);

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  calories numeric(8,2) not null check (calories >= 0),
  protein_grams numeric(8,2) not null check (protein_grams >= 0),
  carbohydrate_grams numeric(8,2) not null check (carbohydrate_grams >= 0),
  fat_grams numeric(8,2) not null check (fat_grams >= 0),
  fiber_grams numeric(8,2) check (fiber_grams >= 0),
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, effective_from)
);
create index nutrition_targets_user_effective_idx on public.nutrition_targets (user_id, effective_from desc);

create table public.exercise_catalog (
  id text primary key,
  name text not null,
  category text,
  body_part text,
  equipment text,
  target text,
  muscle_group text,
  secondary_muscles text[] not null default '{}',
  instructions text,
  instruction_steps text[] not null default '{}',
  image_source text,
  gif_source text,
  media_id text,
  attribution jsonb not null default '{}',
  source_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exercise_catalog_name_search_idx on public.exercise_catalog using gin (to_tsvector('simple', name));
create index exercise_catalog_body_part_idx on public.exercise_catalog (body_part);
create index exercise_catalog_target_idx on public.exercise_catalog (target);
create index exercise_catalog_equipment_idx on public.exercise_catalog (equipment);

create table public.workout_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status public.routine_status not null default 'draft',
  description text,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workout_routines_user_status_idx on public.workout_routines (user_id, status);
create unique index workout_routines_one_active_idx on public.workout_routines (user_id) where status = 'active';

create table public.routine_days (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.workout_routines (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  day_index smallint not null check (day_index >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routine_id, day_index)
);
create index routine_days_routine_id_idx on public.routine_days (routine_id);

create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_day_id uuid not null references public.routine_days (id) on delete cascade,
  exercise_id text not null references public.exercise_catalog (id) on delete restrict,
  exercise_index smallint not null check (exercise_index >= 0),
  target_sets smallint not null default 3 check (target_sets between 1 and 20),
  rep_min smallint check (rep_min > 0),
  rep_max smallint check (rep_max > 0),
  rest_seconds smallint not null default 90 check (rest_seconds between 0 and 3600),
  target_rpe numeric(3,1) check (target_rpe between 1 and 10),
  target_rir numeric(3,1) check (target_rir between 0 and 10),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rep_max is null or rep_min is null or rep_max >= rep_min),
  unique (routine_day_id, exercise_index)
);
create index routine_exercises_day_id_idx on public.routine_exercises (routine_day_id);
create index routine_exercises_exercise_id_idx on public.routine_exercises (exercise_id);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  routine_id uuid references public.workout_routines (id) on delete set null,
  routine_day_id uuid references public.routine_days (id) on delete set null,
  name text not null,
  status public.workout_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_seconds integer check (duration_seconds >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed' and completed_at is not null) or status <> 'completed')
);
create index workout_sessions_user_started_idx on public.workout_sessions (user_id, started_at desc);
create index workout_sessions_routine_id_idx on public.workout_sessions (routine_id);
create index workout_sessions_routine_day_id_idx on public.workout_sessions (routine_day_id);

create table public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_id text not null references public.exercise_catalog (id) on delete restrict,
  exercise_index smallint not null check (exercise_index >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_session_id, exercise_index)
);
create index workout_session_exercises_session_idx on public.workout_session_exercises (workout_session_id);
create index workout_session_exercises_exercise_idx on public.workout_session_exercises (exercise_id);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_session_exercise_id uuid not null references public.workout_session_exercises (id) on delete cascade,
  set_index smallint not null check (set_index >= 0),
  set_type public.workout_set_type not null default 'working',
  weight_kg numeric(8,3) check (weight_kg >= 0),
  reps smallint check (reps >= 0),
  duration_seconds integer check (duration_seconds >= 0),
  rpe numeric(3,1) check (rpe between 1 and 10),
  rir numeric(3,1) check (rir between 0 and 10),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_session_exercise_id, set_index)
);
create index workout_sets_session_exercise_idx on public.workout_sets (workout_session_exercise_id);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  logged_date date not null default current_date,
  meal_type public.meal_type not null,
  name text,
  source public.food_source not null default 'manual',
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index food_logs_user_date_idx on public.food_logs (user_id, logged_date desc);

create table public.food_log_items (
  id uuid primary key default gen_random_uuid(),
  food_log_id uuid not null references public.food_logs (id) on delete cascade,
  name text not null,
  quantity numeric(10,3) check (quantity >= 0),
  unit text,
  grams numeric(10,3) check (grams >= 0),
  calories numeric(10,2) not null check (calories >= 0),
  protein_grams numeric(10,2) not null default 0 check (protein_grams >= 0),
  carbohydrate_grams numeric(10,2) not null default 0 check (carbohydrate_grams >= 0),
  fat_grams numeric(10,2) not null default 0 check (fat_grams >= 0),
  fiber_grams numeric(10,2) check (fiber_grams >= 0),
  confidence numeric(4,3) check (confidence between 0 and 1),
  estimate_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index food_log_items_log_id_idx on public.food_log_items (food_log_id);

create table public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_at timestamptz not null default now(),
  weight_kg numeric(7,3) check (weight_kg > 0),
  waist_cm numeric(7,2) check (waist_cm > 0),
  body_fat_percent numeric(5,2) check (body_fat_percent between 0 and 100),
  chest_cm numeric(7,2) check (chest_cm > 0),
  arm_cm numeric(7,2) check (arm_cm > 0),
  thigh_cm numeric(7,2) check (thigh_cm > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(weight_kg, waist_cm, body_fat_percent, chest_cm, arm_cm, thigh_cm) > 0)
);
create index body_metrics_user_measured_idx on public.body_metrics (user_id, measured_at desc);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  captured_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create index progress_photos_user_captured_idx on public.progress_photos (user_id, captured_at desc);

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_updated_idx on public.ai_conversations (user_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  ui_action jsonb,
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_created_idx on public.ai_messages (conversation_id, created_at);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  run_type text not null check (run_type in ('coach', 'food_analysis')),
  status public.ai_run_status not null default 'started',
  model text not null,
  input_metadata jsonb not null default '{}',
  output_metadata jsonb not null default '{}',
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_runs_user_created_idx on public.ai_runs (user_id, created_at desc);
create index ai_runs_conversation_id_idx on public.ai_runs (conversation_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'fitness_goals', 'nutrition_targets', 'exercise_catalog', 'workout_routines',
    'routine_days', 'routine_exercises', 'workout_sessions', 'workout_session_exercises',
    'workout_sets', 'food_logs', 'food_log_items', 'body_metrics', 'ai_conversations'
  ] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create function public.activate_routine(target_routine_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare affected integer;
begin
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
revoke all on function public.activate_routine(uuid) from public, anon;
grant execute on function public.activate_routine(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.fitness_goals enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.exercise_catalog enable row level security;
alter table public.workout_routines enable row level security;
alter table public.routine_days enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.food_logs enable row level security;
alter table public.food_log_items enable row level security;
alter table public.body_metrics enable row level security;
alter table public.progress_photos enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_runs enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy fitness_goals_select_own on public.fitness_goals for select to authenticated using ((select auth.uid()) = user_id);
create policy fitness_goals_insert_own on public.fitness_goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy fitness_goals_update_own on public.fitness_goals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy fitness_goals_delete_own on public.fitness_goals for delete to authenticated using ((select auth.uid()) = user_id);

create policy nutrition_targets_select_own on public.nutrition_targets for select to authenticated using ((select auth.uid()) = user_id);
create policy nutrition_targets_insert_own on public.nutrition_targets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy nutrition_targets_update_own on public.nutrition_targets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy nutrition_targets_delete_own on public.nutrition_targets for delete to authenticated using ((select auth.uid()) = user_id);

create policy exercise_catalog_authenticated_read on public.exercise_catalog for select to authenticated using (true);

create policy workout_routines_select_own on public.workout_routines for select to authenticated using ((select auth.uid()) = user_id);
create policy workout_routines_insert_own on public.workout_routines for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workout_routines_update_own on public.workout_routines for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_routines_delete_own on public.workout_routines for delete to authenticated using ((select auth.uid()) = user_id);

create policy routine_days_select_own on public.routine_days for select to authenticated using (exists (select 1 from public.workout_routines r where r.id = routine_id and r.user_id = (select auth.uid())));
create policy routine_days_insert_own on public.routine_days for insert to authenticated with check (exists (select 1 from public.workout_routines r where r.id = routine_id and r.user_id = (select auth.uid())));
create policy routine_days_update_own on public.routine_days for update to authenticated using (exists (select 1 from public.workout_routines r where r.id = routine_id and r.user_id = (select auth.uid()))) with check (exists (select 1 from public.workout_routines r where r.id = routine_id and r.user_id = (select auth.uid())));
create policy routine_days_delete_own on public.routine_days for delete to authenticated using (exists (select 1 from public.workout_routines r where r.id = routine_id and r.user_id = (select auth.uid())));

create policy routine_exercises_select_own on public.routine_exercises for select to authenticated using (exists (select 1 from public.routine_days d join public.workout_routines r on r.id = d.routine_id where d.id = routine_day_id and r.user_id = (select auth.uid())));
create policy routine_exercises_insert_own on public.routine_exercises for insert to authenticated with check (exists (select 1 from public.routine_days d join public.workout_routines r on r.id = d.routine_id where d.id = routine_day_id and r.user_id = (select auth.uid())));
create policy routine_exercises_update_own on public.routine_exercises for update to authenticated using (exists (select 1 from public.routine_days d join public.workout_routines r on r.id = d.routine_id where d.id = routine_day_id and r.user_id = (select auth.uid()))) with check (exists (select 1 from public.routine_days d join public.workout_routines r on r.id = d.routine_id where d.id = routine_day_id and r.user_id = (select auth.uid())));
create policy routine_exercises_delete_own on public.routine_exercises for delete to authenticated using (exists (select 1 from public.routine_days d join public.workout_routines r on r.id = d.routine_id where d.id = routine_day_id and r.user_id = (select auth.uid())));

create policy workout_sessions_select_own on public.workout_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy workout_sessions_insert_own on public.workout_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workout_sessions_update_own on public.workout_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_sessions_delete_own on public.workout_sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy workout_session_exercises_select_own on public.workout_session_exercises for select to authenticated using (exists (select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid())));
create policy workout_session_exercises_insert_own on public.workout_session_exercises for insert to authenticated with check (exists (select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid())));
create policy workout_session_exercises_update_own on public.workout_session_exercises for update to authenticated using (exists (select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid()))) with check (exists (select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid())));
create policy workout_session_exercises_delete_own on public.workout_session_exercises for delete to authenticated using (exists (select 1 from public.workout_sessions s where s.id = workout_session_id and s.user_id = (select auth.uid())));

create policy workout_sets_select_own on public.workout_sets for select to authenticated using (exists (select 1 from public.workout_session_exercises e join public.workout_sessions s on s.id = e.workout_session_id where e.id = workout_session_exercise_id and s.user_id = (select auth.uid())));
create policy workout_sets_insert_own on public.workout_sets for insert to authenticated with check (exists (select 1 from public.workout_session_exercises e join public.workout_sessions s on s.id = e.workout_session_id where e.id = workout_session_exercise_id and s.user_id = (select auth.uid())));
create policy workout_sets_update_own on public.workout_sets for update to authenticated using (exists (select 1 from public.workout_session_exercises e join public.workout_sessions s on s.id = e.workout_session_id where e.id = workout_session_exercise_id and s.user_id = (select auth.uid()))) with check (exists (select 1 from public.workout_session_exercises e join public.workout_sessions s on s.id = e.workout_session_id where e.id = workout_session_exercise_id and s.user_id = (select auth.uid())));
create policy workout_sets_delete_own on public.workout_sets for delete to authenticated using (exists (select 1 from public.workout_session_exercises e join public.workout_sessions s on s.id = e.workout_session_id where e.id = workout_session_exercise_id and s.user_id = (select auth.uid())));

create policy food_logs_select_own on public.food_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy food_logs_insert_own on public.food_logs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy food_logs_update_own on public.food_logs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy food_logs_delete_own on public.food_logs for delete to authenticated using ((select auth.uid()) = user_id);

create policy food_log_items_select_own on public.food_log_items for select to authenticated using (exists (select 1 from public.food_logs l where l.id = food_log_id and l.user_id = (select auth.uid())));
create policy food_log_items_insert_own on public.food_log_items for insert to authenticated with check (exists (select 1 from public.food_logs l where l.id = food_log_id and l.user_id = (select auth.uid())));
create policy food_log_items_update_own on public.food_log_items for update to authenticated using (exists (select 1 from public.food_logs l where l.id = food_log_id and l.user_id = (select auth.uid()))) with check (exists (select 1 from public.food_logs l where l.id = food_log_id and l.user_id = (select auth.uid())));
create policy food_log_items_delete_own on public.food_log_items for delete to authenticated using (exists (select 1 from public.food_logs l where l.id = food_log_id and l.user_id = (select auth.uid())));

create policy body_metrics_select_own on public.body_metrics for select to authenticated using ((select auth.uid()) = user_id);
create policy body_metrics_insert_own on public.body_metrics for insert to authenticated with check ((select auth.uid()) = user_id);
create policy body_metrics_update_own on public.body_metrics for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy body_metrics_delete_own on public.body_metrics for delete to authenticated using ((select auth.uid()) = user_id);

create policy progress_photos_select_own on public.progress_photos for select to authenticated using ((select auth.uid()) = user_id);
create policy progress_photos_insert_own on public.progress_photos for insert to authenticated with check ((select auth.uid()) = user_id);
create policy progress_photos_update_own on public.progress_photos for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy progress_photos_delete_own on public.progress_photos for delete to authenticated using ((select auth.uid()) = user_id);

create policy ai_conversations_select_own on public.ai_conversations for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_conversations_insert_own on public.ai_conversations for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ai_conversations_update_own on public.ai_conversations for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_conversations_delete_own on public.ai_conversations for delete to authenticated using ((select auth.uid()) = user_id);

create policy ai_messages_select_own on public.ai_messages for select to authenticated using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy ai_messages_insert_own on public.ai_messages for insert to authenticated with check (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));
create policy ai_messages_delete_own on public.ai_messages for delete to authenticated using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = (select auth.uid())));

create policy ai_runs_select_own on public.ai_runs for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_runs_insert_own on public.ai_runs for insert to authenticated with check ((select auth.uid()) = user_id);

create view public.daily_nutrition_totals with (security_invoker = true) as
select l.user_id, l.logged_date,
  coalesce(sum(i.calories), 0)::numeric(12,2) as calories,
  coalesce(sum(i.protein_grams), 0)::numeric(12,2) as protein_grams,
  coalesce(sum(i.carbohydrate_grams), 0)::numeric(12,2) as carbohydrate_grams,
  coalesce(sum(i.fat_grams), 0)::numeric(12,2) as fat_grams,
  coalesce(sum(i.fiber_grams), 0)::numeric(12,2) as fiber_grams
from public.food_logs l join public.food_log_items i on i.food_log_id = l.id
group by l.user_id, l.logged_date;

create view public.exercise_history with (security_invoker = true) as
select s.user_id, e.exercise_id, s.id as workout_session_id, s.started_at,
  ws.weight_kg, ws.reps, ws.rpe, ws.rir, ws.set_type, ws.completed_at
from public.workout_sessions s
join public.workout_session_exercises e on e.workout_session_id = s.id
join public.workout_sets ws on ws.workout_session_exercise_id = e.id
where s.status = 'completed' and ws.completed_at is not null;

create view public.personal_bests with (security_invoker = true) as
select s.user_id, e.exercise_id,
  max(ws.weight_kg) as max_weight_kg,
  max(ws.weight_kg * (1 + ws.reps::numeric / 30)) filter (where ws.reps > 0) as estimated_one_rep_max,
  max(ws.reps) as max_reps
from public.workout_sessions s
join public.workout_session_exercises e on e.workout_session_id = s.id
join public.workout_sets ws on ws.workout_session_exercise_id = e.id
where s.status = 'completed' and ws.completed_at is not null and ws.set_type <> 'warmup'
group by s.user_id, e.exercise_id;

create view public.weekly_workout_summary with (security_invoker = true) as
select s.user_id, date_trunc('week', s.started_at)::date as week_start,
  count(distinct s.id) as workouts,
  count(ws.id) filter (where ws.set_type <> 'warmup' and ws.completed_at is not null) as working_sets,
  coalesce(sum(ws.weight_kg * ws.reps) filter (where ws.completed_at is not null), 0)::numeric(14,2) as total_volume_kg
from public.workout_sessions s
left join public.workout_session_exercises e on e.workout_session_id = s.id
left join public.workout_sets ws on ws.workout_session_exercise_id = e.id
where s.status = 'completed'
group by s.user_id, date_trunc('week', s.started_at);

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.fitness_goals, public.nutrition_targets, public.workout_routines,
  public.routine_days, public.routine_exercises, public.workout_sessions, public.workout_session_exercises,
  public.workout_sets, public.food_logs, public.food_log_items, public.body_metrics, public.progress_photos,
  public.ai_conversations, public.ai_messages to authenticated;
grant select, insert on public.ai_runs to authenticated;
grant select on public.exercise_catalog, public.daily_nutrition_totals, public.exercise_history,
  public.personal_bests, public.weekly_workout_summary to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('food-photos', 'food-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy food_photos_read_own on storage.objects for select to authenticated
using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy food_photos_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy food_photos_update_own on storage.objects for update to authenticated
using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy food_photos_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy progress_photos_storage_read_own on storage.objects for select to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy progress_photos_storage_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy progress_photos_storage_update_own on storage.objects for update to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy progress_photos_storage_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);


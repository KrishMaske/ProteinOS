-- Private, user-owned exercises and review-first workout imports.
-- Imported exercise data never enters the global exercise_catalog.

create table public.routine_imports (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ai_run_id uuid references public.ai_runs (id) on delete set null,
  source_storage_path text not null check (char_length(source_storage_path) between 3 and 1024),
  source_file_name text not null check (char_length(source_file_name) between 1 and 255),
  source_mime_type text not null check (char_length(source_mime_type) between 1 and 127),
  status text not null default 'review'
    check (status in ('processing', 'review', 'confirmed', 'failed', 'expired')),
  extraction jsonb not null check (jsonb_typeof(extraction) = 'object'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  expires_at timestamptz not null,
  routine_id uuid unique references public.workout_routines (id) on delete set null,
  confirmed_at timestamptz,
  cleanup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (
    (status = 'confirmed' and confirmed_at is not null)
    or (status <> 'confirmed' and routine_id is null and confirmed_at is null)
  )
);

create unique index routine_imports_ai_run_idx
  on public.routine_imports (ai_run_id)
  where ai_run_id is not null;
create index routine_imports_user_status_expires_idx
  on public.routine_imports (user_id, status, expires_at);

create table public.routine_import_exercises (
  import_id uuid not null references public.routine_imports (id) on delete cascade,
  exercise_key text not null
    check (exercise_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  source_title text not null check (char_length(source_title) between 1 and 255),
  source_details text,
  page_number integer check (page_number > 0),
  source_bbox jsonb check (source_bbox is null or jsonb_typeof(source_bbox) = 'object'),
  staged_image_path text check (
    staged_image_path is null or char_length(staged_image_path) between 3 and 1024
  ),
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  suggested_resolution jsonb not null check (jsonb_typeof(suggested_resolution) = 'object'),
  custom_exercise jsonb not null check (jsonb_typeof(custom_exercise) = 'object'),
  created_at timestamptz not null default now(),
  primary key (import_id, exercise_key)
);

create table public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  description text,
  category text,
  body_part text,
  equipment text,
  target text,
  muscle_group text,
  secondary_muscles text[] not null default '{}',
  instructions text,
  instruction_steps text[] not null default '{}',
  media_path text,
  source_import_id uuid,
  source_exercise_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_import_id, user_id)
    references public.routine_imports (id, user_id) on delete restrict,
  check (
    (source_import_id is null and source_exercise_key is null)
    or (
      source_import_id is not null
      and source_exercise_key ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
    )
  ),
  check (
    media_path is null
    or (
      char_length(media_path) between 3 and 1024
      and media_path ~ ('^' || user_id::text || '/[^/].*')
      and position('..' in media_path) = 0
      and (
        source_import_id is null
        or media_path = user_id::text || '/staged/' || source_import_id::text || '/'
          || source_exercise_key || '.jpg'
      )
    )
  )
);

create unique index custom_exercises_import_key_idx
  on public.custom_exercises (source_import_id, source_exercise_key)
  where source_import_id is not null;
create index custom_exercises_user_name_idx
  on public.custom_exercises (user_id, lower(name));

create function private.guard_routine_import_rpc_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('app.routine_import_stage_allowed', true) = 'true'
    or pg_catalog.current_setting('app.routine_import_confirm_allowed', true) = 'true'
    or pg_catalog.current_setting('app.routine_import_cleanup_allowed', true) = 'true' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'Routine import state can only be changed through its RPCs'
    using errcode = '42501';
end;
$$;

revoke all on function private.guard_routine_import_rpc_writes() from public, anon, authenticated;

create trigger routine_imports_guard_rpc_writes
before insert or update or delete on public.routine_imports
for each row execute function private.guard_routine_import_rpc_writes();

create trigger routine_import_exercises_guard_rpc_writes
before insert or update or delete on public.routine_import_exercises
for each row execute function private.guard_routine_import_rpc_writes();

create trigger routine_imports_set_updated_at
before update on public.routine_imports
for each row execute function private.set_updated_at();

create trigger custom_exercises_set_updated_at
before update on public.custom_exercises
for each row execute function private.set_updated_at();

alter table public.routine_exercises
  alter column exercise_id drop not null,
  add column custom_exercise_id uuid references public.custom_exercises (id) on delete restrict,
  add constraint routine_exercises_exactly_one_exercise_check
    check (num_nonnulls(exercise_id, custom_exercise_id) = 1);

alter table public.workout_session_exercises
  alter column exercise_id drop not null,
  add column custom_exercise_id uuid references public.custom_exercises (id) on delete restrict,
  add constraint workout_session_exercises_exactly_one_exercise_check
    check (num_nonnulls(exercise_id, custom_exercise_id) = 1);

create index routine_exercises_custom_exercise_idx
  on public.routine_exercises (custom_exercise_id)
  where custom_exercise_id is not null;
create index workout_session_exercises_custom_exercise_idx
  on public.workout_session_exercises (custom_exercise_id)
  where custom_exercise_id is not null;

alter table public.routine_imports enable row level security;
alter table public.routine_import_exercises enable row level security;
alter table public.custom_exercises enable row level security;

create policy routine_imports_select_own
on public.routine_imports for select to authenticated
using ((select auth.uid()) = user_id);

create policy routine_imports_insert_own
on public.routine_imports for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy routine_imports_update_own
on public.routine_imports for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy routine_imports_delete_unconfirmed_own
on public.routine_imports for delete to authenticated
using ((select auth.uid()) = user_id and status <> 'confirmed');

create policy routine_import_exercises_select_own
on public.routine_import_exercises for select to authenticated
using (
  exists (
    select 1 from public.routine_imports i
    where i.id = import_id and i.user_id = (select auth.uid())
  )
);

create policy routine_import_exercises_insert_own
on public.routine_import_exercises for insert to authenticated
with check (
  exists (
    select 1 from public.routine_imports i
    where i.id = import_id and i.user_id = (select auth.uid())
  )
);

create policy routine_import_exercises_update_own
on public.routine_import_exercises for update to authenticated
using (
  exists (
    select 1 from public.routine_imports i
    where i.id = import_id and i.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.routine_imports i
    where i.id = import_id and i.user_id = (select auth.uid())
  )
);

create policy routine_import_exercises_delete_own
on public.routine_import_exercises for delete to authenticated
using (
  exists (
    select 1 from public.routine_imports i
    where i.id = import_id and i.user_id = (select auth.uid())
  )
);

create policy custom_exercises_select_own
on public.custom_exercises for select to authenticated
using ((select auth.uid()) = user_id);

create policy custom_exercises_insert_own
on public.custom_exercises for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy custom_exercises_update_own
on public.custom_exercises for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy custom_exercises_delete_own
on public.custom_exercises for delete to authenticated
using ((select auth.uid()) = user_id);

-- The existing parent-ownership policies protect routine/session rows. These
-- restrictive policies additionally prevent a caller who guesses another
-- user's custom exercise UUID from attaching it to an owned row.
create policy routine_exercises_custom_exercise_own
on public.routine_exercises as restrictive for all to authenticated
using (
  custom_exercise_id is null
  or exists (
    select 1 from public.custom_exercises c
    where c.id = custom_exercise_id and c.user_id = (select auth.uid())
  )
)
with check (
  custom_exercise_id is null
  or exists (
    select 1 from public.custom_exercises c
    where c.id = custom_exercise_id and c.user_id = (select auth.uid())
  )
);

create policy workout_session_exercises_custom_exercise_own
on public.workout_session_exercises as restrictive for all to authenticated
using (
  custom_exercise_id is null
  or exists (
    select 1 from public.custom_exercises c
    where c.id = custom_exercise_id and c.user_id = (select auth.uid())
  )
)
with check (
  custom_exercise_id is null
  or exists (
    select 1 from public.custom_exercises c
    where c.id = custom_exercise_id and c.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'custom-exercise-media',
  'custom-exercise-media',
  false,
  5242880,
  array['image/jpeg']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy custom_exercise_media_read_own
on storage.objects for select to authenticated
using (
  bucket_id = 'custom-exercise-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy custom_exercise_media_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'custom-exercise-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy custom_exercise_media_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'custom-exercise-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create function public.stage_routine_import_review(
  target_import_id uuid,
  target_ai_run_id uuid,
  target_source_storage_path text,
  target_source_file_name text,
  target_source_mime_type text,
  target_extraction jsonb,
  target_exercises jsonb,
  target_warnings jsonb,
  target_expires_at timestamptz
)
returns public.routine_imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  existing_import public.routine_imports;
  result public.routine_imports;
  day_item jsonb;
  exercise_item jsonb;
  review_item jsonb;
  custom_item jsonb;
  candidate_item jsonb;
  warning_item jsonb;
  string_item jsonb;
  training_day_count integer := 0;
  extracted_key_count integer;
  review_key_count integer;
  review_unique_key_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('routine-import:' || caller_id::text || ':' || target_import_id::text, 0)
  );

  if target_import_id is null then
    raise exception 'Import ID is required' using errcode = '22023';
  end if;

  select i.* into existing_import
  from public.routine_imports i
  where i.id = target_import_id and i.user_id = caller_id
  for update;

  if existing_import.status = 'confirmed' then
    return existing_import;
  end if;
  if existing_import.id is not null and existing_import.status not in ('processing', 'review') then
    raise exception 'Import review cannot be staged in its current state' using errcode = 'P0001';
  end if;
  if target_source_storage_path is null
    or target_source_storage_path !~ (
      '^' || caller_id::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
      || '\.(pdf|doc|docx|rtf|txt|md|csv|tsv|json|xls|xlsx)$'
    )
    or pg_catalog.strpos(target_source_storage_path, '..') > 0
    or pg_catalog.char_length(target_source_storage_path) > 1024 then
    raise exception 'Source file must use the authenticated user storage prefix' using errcode = '22023';
  end if;
  if target_source_file_name is null
    or pg_catalog.char_length(pg_catalog.btrim(target_source_file_name)) not between 1 and 255 then
    raise exception 'Source file name is required' using errcode = '22023';
  end if;
  if target_source_mime_type not in (
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/json',
    'text/markdown',
    'application/pdf',
    'application/rtf',
    'text/plain',
    'text/tab-separated-values',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) then
    raise exception 'Unsupported source file type' using errcode = '22023';
  end if;
  if pg_catalog.lower(pg_catalog.split_part(target_source_file_name, '.', -1))
      <> pg_catalog.lower(pg_catalog.split_part(target_source_storage_path, '.', -1))
    or target_source_mime_type <> (case pg_catalog.lower(
      pg_catalog.split_part(target_source_storage_path, '.', -1)
    )
    when 'csv' then 'text/csv'
    when 'doc' then 'application/msword'
    when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when 'json' then 'application/json'
    when 'md' then 'text/markdown'
    when 'pdf' then 'application/pdf'
    when 'rtf' then 'application/rtf'
    when 'txt' then 'text/plain'
    when 'tsv' then 'text/tab-separated-values'
    when 'xls' then 'application/vnd.ms-excel'
    when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    else null
  end) then
    raise exception 'Source MIME type does not match its storage extension' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'gym-files' and o.name = target_source_storage_path
  ) then
    raise exception 'The uploaded workout source file is missing' using errcode = 'P0001';
  end if;
  if target_expires_at is null
    or target_expires_at <= pg_catalog.now()
    or target_expires_at > pg_catalog.now() + interval '7 days' then
    raise exception 'Import expiry must be within the next seven days' using errcode = '22023';
  end if;
  if target_extraction is null or pg_catalog.jsonb_typeof(target_extraction) <> 'object'
    or not (target_extraction ?& array['routineName', 'description', 'days'])
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(target_extraction) k(value)
      where k.value not in ('routineName', 'description', 'days')
    )
    or pg_catalog.jsonb_typeof(target_extraction -> 'days') <> 'array'
    or pg_catalog.jsonb_array_length(target_extraction -> 'days') not between 1 and 21
    or pg_catalog.char_length(pg_catalog.btrim(target_extraction ->> 'routineName')) not between 1 and 120 then
    raise exception 'Extraction must contain a routine name and one to twenty-one days' using errcode = '22023';
  end if;
  if target_extraction -> 'description' <> 'null'::jsonb
    and pg_catalog.jsonb_typeof(target_extraction -> 'description') <> 'string' then
    raise exception 'Routine description must be text or null' using errcode = '22023';
  end if;
  if pg_catalog.char_length(target_extraction ->> 'description') > 2000 then
    raise exception 'Routine description cannot exceed 2000 characters' using errcode = '22023';
  end if;
  if target_exercises is null
    or pg_catalog.jsonb_typeof(target_exercises) <> 'array'
    or pg_catalog.jsonb_array_length(target_exercises) not between 1 and 200 then
    raise exception 'Review exercises must be a non-empty array of at most 200 items' using errcode = '22023';
  end if;
  if target_warnings is null
    or pg_catalog.jsonb_typeof(target_warnings) <> 'array'
    or pg_catalog.jsonb_array_length(target_warnings) > 30
    or pg_catalog.pg_column_size(target_warnings) > 30000 then
    raise exception 'Warnings must contain at most 30 bounded items' using errcode = '22023';
  end if;
  for warning_item in select w.value from pg_catalog.jsonb_array_elements(target_warnings) w(value)
  loop
    if pg_catalog.jsonb_typeof(warning_item) <> 'string'
      or pg_catalog.char_length(warning_item #>> '{}') > 500 then
      raise exception 'Each warning must be at most 500 characters' using errcode = '22023';
    end if;
  end loop;
  if pg_catalog.pg_column_size(target_extraction) > 500000
    or pg_catalog.pg_column_size(target_exercises) > 1000000 then
    raise exception 'Import review payload is too large' using errcode = '22023';
  end if;

  if target_ai_run_id is not null and not exists (
    select 1 from public.ai_runs a
    where a.id = target_ai_run_id
      and a.user_id = caller_id
      and a.run_type = 'routine_import'
  ) then
    raise exception 'AI run was not found' using errcode = 'P0001';
  end if;

  if (
    select pg_catalog.count(distinct d.value ->> 'dayKey')
    from pg_catalog.jsonb_array_elements(target_extraction -> 'days') d(value)
  ) <> pg_catalog.jsonb_array_length(target_extraction -> 'days') then
    raise exception 'Every cycle day must have a unique dayKey' using errcode = '22023';
  end if;

  for day_item in
    select d.value from pg_catalog.jsonb_array_elements(target_extraction -> 'days') d(value)
  loop
    if pg_catalog.jsonb_typeof(day_item) <> 'object'
      or not (day_item ?& array['dayKey', 'name', 'notes', 'isRestDay', 'exercises'])
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(day_item) k(value)
        where k.value not in ('dayKey', 'name', 'notes', 'isRestDay', 'exercises')
      )
      or coalesce(day_item ->> 'dayKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
      or pg_catalog.char_length(pg_catalog.btrim(day_item ->> 'name')) not between 1 and 120
      or pg_catalog.jsonb_typeof(day_item -> 'isRestDay') <> 'boolean'
      or pg_catalog.jsonb_typeof(day_item -> 'exercises') <> 'array'
      or pg_catalog.jsonb_array_length(day_item -> 'exercises') > 50 then
      raise exception 'Each cycle day must contain valid day metadata and at most 50 exercises'
        using errcode = '22023';
    end if;
    if day_item -> 'notes' <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(day_item -> 'notes') <> 'string' then
      raise exception 'Day notes must be text or null' using errcode = '22023';
    end if;
    if pg_catalog.char_length(day_item ->> 'notes') > 2000 then
      raise exception 'Day notes cannot exceed 2000 characters' using errcode = '22023';
    end if;

    if (day_item ->> 'isRestDay')::boolean then
      if pg_catalog.jsonb_array_length(day_item -> 'exercises') <> 0 then
        raise exception 'Rest days cannot contain exercises' using errcode = '22023';
      end if;
    else
      training_day_count := training_day_count + 1;
      if pg_catalog.jsonb_array_length(day_item -> 'exercises') = 0 then
        raise exception 'Training days must contain at least one exercise' using errcode = '22023';
      end if;
    end if;

    for exercise_item in
      select e.value from pg_catalog.jsonb_array_elements(day_item -> 'exercises') e(value)
    loop
      if pg_catalog.jsonb_typeof(exercise_item) <> 'object'
        or not (exercise_item ?& array[
          'exerciseKey', 'targetSets', 'repMin', 'repMax', 'restSeconds',
          'targetRpe', 'targetRir', 'notes'
        ])
        or exists (
          select 1 from pg_catalog.jsonb_object_keys(exercise_item) k(value)
          where k.value not in (
            'exerciseKey', 'targetSets', 'repMin', 'repMax', 'restSeconds',
            'targetRpe', 'targetRir', 'notes'
          )
        )
        or coalesce(exercise_item ->> 'exerciseKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
        or pg_catalog.jsonb_typeof(exercise_item -> 'targetSets') <> 'number'
        or (exercise_item ->> 'targetSets')::numeric
          <> pg_catalog.trunc((exercise_item ->> 'targetSets')::numeric)
        or (exercise_item ->> 'targetSets')::numeric not between 1 and 20
        or pg_catalog.jsonb_typeof(exercise_item -> 'restSeconds') <> 'number'
        or (exercise_item ->> 'restSeconds')::numeric
          <> pg_catalog.trunc((exercise_item ->> 'restSeconds')::numeric)
        or (exercise_item ->> 'restSeconds')::numeric not between 0 and 3600 then
        raise exception 'Exercise prescriptions contain invalid values' using errcode = '22023';
      end if;
      if exercise_item -> 'repMin' <> 'null'::jsonb and (
        pg_catalog.jsonb_typeof(exercise_item -> 'repMin') <> 'number'
        or (exercise_item ->> 'repMin')::numeric
          <> pg_catalog.trunc((exercise_item ->> 'repMin')::numeric)
        or (exercise_item ->> 'repMin')::numeric not between 1 and 100
      ) then
        raise exception 'repMin must be positive or null' using errcode = '22023';
      end if;
      if exercise_item -> 'repMax' <> 'null'::jsonb and (
        pg_catalog.jsonb_typeof(exercise_item -> 'repMax') <> 'number'
        or (exercise_item ->> 'repMax')::numeric
          <> pg_catalog.trunc((exercise_item ->> 'repMax')::numeric)
        or (exercise_item ->> 'repMax')::numeric not between 1 and 100
      ) then
        raise exception 'repMax must be positive or null' using errcode = '22023';
      end if;
      if exercise_item -> 'repMin' <> 'null'::jsonb
        and exercise_item -> 'repMax' <> 'null'::jsonb
        and (exercise_item ->> 'repMax')::smallint < (exercise_item ->> 'repMin')::smallint then
        raise exception 'repMax cannot be lower than repMin' using errcode = '22023';
      end if;
      if exercise_item -> 'targetRpe' <> 'null'::jsonb and (
        pg_catalog.jsonb_typeof(exercise_item -> 'targetRpe') <> 'number'
        or (exercise_item ->> 'targetRpe')::numeric not between 1 and 10
      ) then
        raise exception 'targetRpe must be between one and ten or null' using errcode = '22023';
      end if;
      if exercise_item -> 'targetRir' <> 'null'::jsonb and (
        pg_catalog.jsonb_typeof(exercise_item -> 'targetRir') <> 'number'
        or (exercise_item ->> 'targetRir')::numeric not between 0 and 10
      ) then
        raise exception 'targetRir must be between zero and ten or null' using errcode = '22023';
      end if;
      if exercise_item -> 'notes' <> 'null'::jsonb
        and pg_catalog.jsonb_typeof(exercise_item -> 'notes') <> 'string' then
        raise exception 'Exercise notes must be text or null' using errcode = '22023';
      end if;
      if pg_catalog.char_length(exercise_item ->> 'notes') > 2000 then
        raise exception 'Exercise notes cannot exceed 2000 characters' using errcode = '22023';
      end if;
    end loop;
  end loop;

  if training_day_count = 0 then
    raise exception 'An imported routine must include a training day' using errcode = '22023';
  end if;

  select pg_catalog.count(distinct e.value ->> 'exerciseKey')
  into extracted_key_count
  from pg_catalog.jsonb_array_elements(target_extraction -> 'days') d(value)
  cross join lateral pg_catalog.jsonb_array_elements(d.value -> 'exercises') e(value);

  select pg_catalog.count(*), pg_catalog.count(distinct r.value ->> 'exerciseKey')
  into review_key_count, review_unique_key_count
  from pg_catalog.jsonb_array_elements(target_exercises) r(value);

  if review_key_count <> review_unique_key_count or review_key_count <> extracted_key_count then
    raise exception 'Review exercises must contain each unique extracted exerciseKey exactly once'
      using errcode = '22023';
  end if;

  for review_item in
    select r.value from pg_catalog.jsonb_array_elements(target_exercises) r(value)
  loop
    if pg_catalog.jsonb_typeof(review_item) <> 'object'
      or not (review_item ?& array[
        'exerciseKey', 'sourceTitle', 'sourceDetails', 'pageNumber', 'sourceBbox',
        'stagedImagePath', 'candidates', 'suggestedResolution', 'customExercise'
      ])
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(review_item) k(value)
        where k.value not in (
          'exerciseKey', 'sourceTitle', 'sourceDetails', 'pageNumber', 'sourceBbox',
          'stagedImagePath', 'candidates', 'suggestedResolution', 'customExercise'
        )
      )
      or coalesce(review_item ->> 'exerciseKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
      or pg_catalog.char_length(pg_catalog.btrim(review_item ->> 'sourceTitle')) not between 1 and 200
      or pg_catalog.jsonb_typeof(review_item -> 'candidates') <> 'array'
      or pg_catalog.jsonb_array_length(review_item -> 'candidates') > 8
      or pg_catalog.jsonb_typeof(review_item -> 'suggestedResolution') <> 'object'
      or pg_catalog.jsonb_typeof(review_item -> 'customExercise') <> 'object' then
      raise exception 'Review exercise metadata is invalid' using errcode = '22023';
    end if;
    if review_item -> 'sourceDetails' <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(review_item -> 'sourceDetails') <> 'string' then
      raise exception 'sourceDetails must be text or null' using errcode = '22023';
    end if;
    if pg_catalog.char_length(review_item ->> 'sourceDetails') > 2000 then
      raise exception 'sourceDetails cannot exceed 2000 characters' using errcode = '22023';
    end if;
    if review_item -> 'pageNumber' <> 'null'::jsonb and (
      pg_catalog.jsonb_typeof(review_item -> 'pageNumber') <> 'number'
      or (review_item ->> 'pageNumber')::numeric
        <> pg_catalog.trunc((review_item ->> 'pageNumber')::numeric)
      or (review_item ->> 'pageNumber')::numeric not between 1 and 10000
    ) then
      raise exception 'pageNumber must be positive or null' using errcode = '22023';
    end if;
    if review_item -> 'sourceBbox' <> 'null'::jsonb
      and pg_catalog.jsonb_typeof(review_item -> 'sourceBbox') <> 'object' then
      raise exception 'sourceBbox must be an object or null' using errcode = '22023';
    end if;
    if review_item -> 'sourceBbox' <> 'null'::jsonb and (
      not ((review_item -> 'sourceBbox') ?& array['x', 'y', 'width', 'height'])
      or exists (
        select 1 from pg_catalog.jsonb_each(review_item -> 'sourceBbox') b(key, value)
        where b.key not in ('x', 'y', 'width', 'height')
          or pg_catalog.jsonb_typeof(b.value) <> 'number'
      )
      or (review_item #>> '{sourceBbox,x}')::numeric < 0
      or (review_item #>> '{sourceBbox,y}')::numeric < 0
      or (review_item #>> '{sourceBbox,width}')::numeric <= 0
      or (review_item #>> '{sourceBbox,height}')::numeric <= 0
      or (review_item #>> '{sourceBbox,x}')::numeric
        + (review_item #>> '{sourceBbox,width}')::numeric > 1
      or (review_item #>> '{sourceBbox,y}')::numeric
        + (review_item #>> '{sourceBbox,height}')::numeric > 1
    ) then
      raise exception 'sourceBbox must contain normalized x, y, width, and height values'
        using errcode = '22023';
    end if;
    if (review_item -> 'pageNumber' = 'null'::jsonb)
      <> (review_item -> 'sourceBbox' = 'null'::jsonb) then
      raise exception 'pageNumber and sourceBbox must both be set or both be null'
        using errcode = '22023';
    end if;

    for candidate_item in
      select c.value from pg_catalog.jsonb_array_elements(review_item -> 'candidates') c(value)
    loop
      if pg_catalog.jsonb_typeof(candidate_item) <> 'object'
        or not (candidate_item ?& array['exerciseId', 'name', 'score', 'matchReason'])
        or exists (
          select 1 from pg_catalog.jsonb_object_keys(candidate_item) k(value)
          where k.value not in ('exerciseId', 'name', 'score', 'matchReason')
        )
        or pg_catalog.jsonb_typeof(candidate_item -> 'exerciseId') <> 'string'
        or pg_catalog.jsonb_typeof(candidate_item -> 'name') <> 'string'
        or pg_catalog.jsonb_typeof(candidate_item -> 'matchReason') <> 'string'
        or pg_catalog.char_length(candidate_item ->> 'exerciseId') not between 1 and 255
        or pg_catalog.char_length(pg_catalog.btrim(candidate_item ->> 'name')) not between 1 and 200
        or pg_catalog.jsonb_typeof(candidate_item -> 'score') <> 'number'
        or (candidate_item ->> 'score')::numeric not between 0 and 1
        or pg_catalog.char_length(pg_catalog.btrim(candidate_item ->> 'matchReason')) not between 1 and 500
        or not exists (
          select 1 from public.exercise_catalog c
          where c.id = candidate_item ->> 'exerciseId'
        ) then
        raise exception 'Candidate exercises must be valid bounded catalog matches'
          using errcode = '22023';
      end if;
    end loop;

    if not ((review_item -> 'suggestedResolution') ?& array['type', 'confidence', 'reason'])
      or review_item #>> '{suggestedResolution,type}' not in ('catalog', 'custom')
      or pg_catalog.jsonb_typeof(review_item #> '{suggestedResolution,confidence}') <> 'number'
      or (review_item #>> '{suggestedResolution,confidence}')::numeric not between 0 and 1
      or pg_catalog.jsonb_typeof(review_item #> '{suggestedResolution,reason}') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(review_item #>> '{suggestedResolution,reason}'))
        not between 1 and 500
      or (
        review_item #>> '{suggestedResolution,type}' = 'catalog'
        and (
          exists (
            select 1
            from pg_catalog.jsonb_object_keys(review_item -> 'suggestedResolution') k(value)
            where k.value not in ('type', 'exerciseId', 'confidence', 'reason')
          )
          or
          coalesce(review_item #>> '{suggestedResolution,exerciseId}', '') = ''
          or not exists (
            select 1
            from pg_catalog.jsonb_array_elements(review_item -> 'candidates') c(value)
            where c.value ->> 'exerciseId' = review_item #>> '{suggestedResolution,exerciseId}'
          )
        )
      )
      or (
        review_item #>> '{suggestedResolution,type}' = 'custom'
        and (
          exists (
            select 1
            from pg_catalog.jsonb_object_keys(review_item -> 'suggestedResolution') k(value)
            where k.value not in ('type', 'name', 'confidence', 'reason')
          )
          or pg_catalog.char_length(pg_catalog.btrim(
            review_item #>> '{suggestedResolution,name}'
          )) not between 1 and 200
        )
      ) then
      raise exception 'suggestedResolution must reference a candidate or bounded custom name'
        using errcode = '22023';
    end if;

    custom_item := review_item -> 'customExercise';
    if not (custom_item ?& array[
      'category', 'bodyPart', 'equipment', 'target', 'muscleGroup',
      'secondaryMuscles', 'instructions', 'instructionSteps'
    ])
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(custom_item) k(value)
        where k.value not in (
          'category', 'bodyPart', 'equipment', 'target', 'muscleGroup',
          'secondaryMuscles', 'instructions', 'instructionSteps'
        )
      )
      or pg_catalog.jsonb_typeof(custom_item -> 'secondaryMuscles') <> 'array'
      or pg_catalog.jsonb_array_length(custom_item -> 'secondaryMuscles') > 20
      or pg_catalog.jsonb_typeof(custom_item -> 'instructionSteps') <> 'array' then
      raise exception 'Custom exercise metadata is invalid' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(custom_item -> 'instructionSteps') > 30 then
      raise exception 'Custom instructions cannot exceed 30 steps' using errcode = '22023';
    end if;
    foreach string_item in array array[
      custom_item -> 'category', custom_item -> 'bodyPart', custom_item -> 'equipment',
      custom_item -> 'target', custom_item -> 'muscleGroup'
    ] loop
      if string_item <> 'null'::jsonb and (
        pg_catalog.jsonb_typeof(string_item) <> 'string'
        or pg_catalog.char_length(pg_catalog.btrim(string_item #>> '{}')) not between 1 and 120
      ) then
        raise exception 'Custom exercise text fields must be bounded text or null' using errcode = '22023';
      end if;
    end loop;
    if custom_item -> 'instructions' <> 'null'::jsonb and (
      pg_catalog.jsonb_typeof(custom_item -> 'instructions') <> 'string'
      or pg_catalog.char_length(pg_catalog.btrim(custom_item ->> 'instructions'))
        not between 1 and 2000
    ) then
      raise exception 'Custom instructions must be bounded text or null' using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(custom_item -> 'secondaryMuscles') x(value)
      where pg_catalog.jsonb_typeof(x.value) <> 'string'
        or pg_catalog.char_length(pg_catalog.btrim(x.value #>> '{}')) not between 1 and 120
    ) or exists (
      select 1 from pg_catalog.jsonb_array_elements(custom_item -> 'instructionSteps') x(value)
      where pg_catalog.jsonb_typeof(x.value) <> 'string'
        or pg_catalog.char_length(pg_catalog.btrim(x.value #>> '{}')) not between 1 and 500
    ) then
      raise exception 'Custom exercise arrays contain invalid text' using errcode = '22023';
    end if;

    if review_item -> 'stagedImagePath' <> 'null'::jsonb then
      if review_item ->> 'stagedImagePath' <>
        caller_id::text || '/staged/' || target_import_id::text || '/'
          || (review_item ->> 'exerciseKey') || '.jpg' then
        raise exception 'Staged images must use the import-specific owner prefix' using errcode = '22023';
      end if;
      if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'custom-exercise-media'
          and o.name = review_item ->> 'stagedImagePath'
      ) then
        raise exception 'A staged exercise image is missing' using errcode = 'P0001';
      end if;
    end if;

    if not exists (
      select 1
      from pg_catalog.jsonb_array_elements(target_extraction -> 'days') d(value)
      cross join lateral pg_catalog.jsonb_array_elements(d.value -> 'exercises') e(value)
      where e.value ->> 'exerciseKey' = review_item ->> 'exerciseKey'
    ) then
      raise exception 'Review contains an exerciseKey not present in the extraction' using errcode = '22023';
    end if;
  end loop;

  perform pg_catalog.set_config('app.routine_import_stage_allowed', 'true', true);

  if existing_import.id is null then
    insert into public.routine_imports (
      id, user_id, ai_run_id, source_storage_path, source_file_name,
      source_mime_type, status, extraction, warnings, expires_at
    ) values (
      target_import_id, caller_id, target_ai_run_id, target_source_storage_path,
      pg_catalog.btrim(target_source_file_name), target_source_mime_type, 'review',
      target_extraction, target_warnings, target_expires_at
    )
    returning * into result;
  else
    delete from public.routine_import_exercises e where e.import_id = target_import_id;
    update public.routine_imports
    set ai_run_id = target_ai_run_id,
        source_storage_path = target_source_storage_path,
        source_file_name = pg_catalog.btrim(target_source_file_name),
        source_mime_type = target_source_mime_type,
        status = 'review',
        extraction = target_extraction,
        warnings = target_warnings,
        expires_at = target_expires_at,
        cleanup_completed_at = null
    where id = target_import_id and user_id = caller_id
    returning * into result;
  end if;

  insert into public.routine_import_exercises (
    import_id, exercise_key, source_title, source_details, page_number,
    source_bbox, staged_image_path, candidates, suggested_resolution, custom_exercise
  )
  select
    target_import_id,
    r.value ->> 'exerciseKey',
    pg_catalog.btrim(r.value ->> 'sourceTitle'),
    nullif(pg_catalog.btrim(r.value ->> 'sourceDetails'), ''),
    (r.value ->> 'pageNumber')::integer,
    case when r.value -> 'sourceBbox' = 'null'::jsonb then null else r.value -> 'sourceBbox' end,
    nullif(r.value ->> 'stagedImagePath', ''),
    r.value -> 'candidates',
    r.value -> 'suggestedResolution',
    r.value -> 'customExercise'
  from pg_catalog.jsonb_array_elements(target_exercises) r(value);

  return result;
end;
$$;

create function public.confirm_routine_import(
  target_import_id uuid,
  target_resolutions jsonb
)
returns public.workout_routines
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_import public.routine_imports;
  created_routine public.workout_routines;
  created_day_id uuid;
  day_item jsonb;
  prescription jsonb;
  resolution jsonb;
  review_exercise public.routine_import_exercises;
  custom_metadata jsonb;
  custom_id uuid;
  catalog_id text;
  expected_count integer;
  resolution_count integer;
  unique_resolution_count integer;
  day_position integer := 0;
  exercise_position integer;
  custom_name text;
  keep_image boolean;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_import_id is null then
    raise exception 'Import ID is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('routine-import:' || caller_id::text || ':' || target_import_id::text, 0)
  );

  select i.* into target_import
  from public.routine_imports i
  where i.id = target_import_id and i.user_id = caller_id
  for update;

  if target_import.id is null then
    raise exception 'Import review was not found' using errcode = 'P0001';
  end if;
  if target_import.status = 'confirmed' then
    select r.* into created_routine
    from public.workout_routines r
    where r.id = target_import.routine_id and r.user_id = caller_id;
    if created_routine.id is null then
      raise exception 'Confirmed import is missing its routine' using errcode = 'P0001';
    end if;
    return created_routine;
  end if;
  if target_import.status <> 'review' or target_import.expires_at <= pg_catalog.now() then
    raise exception 'Import review has expired' using errcode = 'P0001';
  end if;
  if target_resolutions is null or pg_catalog.jsonb_typeof(target_resolutions) <> 'array' then
    raise exception 'Resolutions must be an array' using errcode = '22023';
  end if;

  select pg_catalog.count(*) into expected_count
  from public.routine_import_exercises e where e.import_id = target_import_id;
  select pg_catalog.count(*), pg_catalog.count(distinct r.value ->> 'exerciseKey')
  into resolution_count, unique_resolution_count
  from pg_catalog.jsonb_array_elements(target_resolutions) r(value);

  if expected_count = 0
    or resolution_count <> expected_count
    or unique_resolution_count <> resolution_count then
    raise exception 'Provide exactly one resolution for every imported exercise'
      using errcode = '22023';
  end if;

  for resolution in
    select r.value from pg_catalog.jsonb_array_elements(target_resolutions) r(value)
  loop
    if pg_catalog.jsonb_typeof(resolution) <> 'object'
      or not (resolution ?& array[
        'exerciseKey', 'type', 'exerciseId', 'customName', 'useStagedImage'
      ])
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(resolution) k(value)
        where k.value not in (
          'exerciseKey', 'type', 'exerciseId', 'customName', 'useStagedImage'
        )
      )
      or coalesce(resolution ->> 'exerciseKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
      or coalesce(resolution ->> 'type', '') not in ('catalog', 'custom')
      or pg_catalog.jsonb_typeof(resolution -> 'useStagedImage') <> 'boolean' then
      raise exception 'Resolution metadata is invalid' using errcode = '22023';
    end if;

    select e.* into review_exercise
    from public.routine_import_exercises e
    where e.import_id = target_import_id
      and e.exercise_key = resolution ->> 'exerciseKey';
    if review_exercise.import_id is null then
      raise exception 'Resolution contains an unknown exerciseKey' using errcode = '22023';
    end if;

    if resolution ->> 'type' = 'catalog' then
      if pg_catalog.jsonb_typeof(resolution -> 'exerciseId') <> 'string'
        or resolution -> 'customName' <> 'null'::jsonb
        or (resolution ->> 'useStagedImage')::boolean then
        raise exception 'Catalog resolutions require only an exerciseId' using errcode = '22023';
      end if;
      if not exists (
        select 1 from public.exercise_catalog c where c.id = resolution ->> 'exerciseId'
      ) then
        raise exception 'A selected catalog exercise does not exist' using errcode = 'P0001';
      end if;
      if not exists (
        select 1
        from pg_catalog.jsonb_array_elements(review_exercise.candidates) c(value)
        where c.value ->> 'exerciseId' = resolution ->> 'exerciseId'
      ) then
        raise exception 'The selected catalog exercise was not offered in this review'
          using errcode = '22023';
      end if;
    else
      if resolution -> 'exerciseId' <> 'null'::jsonb
        or pg_catalog.jsonb_typeof(resolution -> 'customName') <> 'string'
        or pg_catalog.char_length(pg_catalog.btrim(resolution ->> 'customName')) not between 1 and 200 then
        raise exception 'Custom resolutions require a custom name' using errcode = '22023';
      end if;
      if (resolution ->> 'useStagedImage')::boolean then
        if review_exercise.staged_image_path is null or not exists (
          select 1 from storage.objects o
          where o.bucket_id = 'custom-exercise-media'
            and o.name = review_exercise.staged_image_path
        ) then
          raise exception 'The selected custom exercise image is missing' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end loop;

  perform pg_catalog.set_config('app.routine_import_confirm_allowed', 'true', true);

  insert into public.workout_routines (
    user_id, name, status, description, source, current_cycle_index
  ) values (
    caller_id,
    pg_catalog.btrim(target_import.extraction ->> 'routineName'),
    'draft',
    nullif(pg_catalog.btrim(target_import.extraction ->> 'description'), ''),
    'import',
    0
  )
  returning * into created_routine;

  for resolution in
    select r.value from pg_catalog.jsonb_array_elements(target_resolutions) r(value)
  loop
    if resolution ->> 'type' = 'custom' then
      select e.* into review_exercise
      from public.routine_import_exercises e
      where e.import_id = target_import_id
        and e.exercise_key = resolution ->> 'exerciseKey';
      custom_metadata := review_exercise.custom_exercise;
      custom_name := pg_catalog.btrim(resolution ->> 'customName');
      keep_image := (resolution ->> 'useStagedImage')::boolean;

      insert into public.custom_exercises (
        user_id, name, description, category, body_part, equipment, target,
        muscle_group, secondary_muscles, instructions, instruction_steps,
        media_path, source_import_id, source_exercise_key
      ) values (
        caller_id,
        custom_name,
        nullif(pg_catalog.btrim(review_exercise.source_details), ''),
        nullif(pg_catalog.btrim(custom_metadata ->> 'category'), ''),
        nullif(pg_catalog.btrim(custom_metadata ->> 'bodyPart'), ''),
        nullif(pg_catalog.btrim(custom_metadata ->> 'equipment'), ''),
        nullif(pg_catalog.btrim(custom_metadata ->> 'target'), ''),
        nullif(pg_catalog.btrim(custom_metadata ->> 'muscleGroup'), ''),
        coalesce(
          array(
            select pg_catalog.jsonb_array_elements_text(custom_metadata -> 'secondaryMuscles')
          ), '{}'
        ),
        nullif(pg_catalog.btrim(custom_metadata ->> 'instructions'), ''),
        coalesce(
          array(
            select pg_catalog.jsonb_array_elements_text(custom_metadata -> 'instructionSteps')
          ), '{}'
        ),
        case when keep_image then review_exercise.staged_image_path else null end,
        target_import_id,
        review_exercise.exercise_key
      )
      returning id into custom_id;
    end if;
  end loop;

  for day_item in
    select d.value
    from pg_catalog.jsonb_array_elements(target_import.extraction -> 'days') d(value)
  loop
    insert into public.routine_days (
      routine_id, name, day_index, notes, is_rest_day
    ) values (
      created_routine.id,
      pg_catalog.btrim(day_item ->> 'name'),
      day_position,
      nullif(pg_catalog.btrim(day_item ->> 'notes'), ''),
      (day_item ->> 'isRestDay')::boolean
    ) returning id into created_day_id;

    exercise_position := 0;
    for prescription in
      select e.value from pg_catalog.jsonb_array_elements(day_item -> 'exercises') e(value)
    loop
      select r.value into resolution
      from pg_catalog.jsonb_array_elements(target_resolutions) r(value)
      where r.value ->> 'exerciseKey' = prescription ->> 'exerciseKey';

      catalog_id := null;
      custom_id := null;
      if resolution ->> 'type' = 'catalog' then
        catalog_id := resolution ->> 'exerciseId';
      else
        select c.id into custom_id
        from public.custom_exercises c
        where c.user_id = caller_id
          and c.source_import_id = target_import_id
          and c.source_exercise_key = prescription ->> 'exerciseKey';
        if custom_id is null then
          raise exception 'A resolved custom exercise is missing' using errcode = 'P0001';
        end if;
      end if;

      insert into public.routine_exercises (
        routine_day_id, exercise_id, custom_exercise_id, exercise_index,
        target_sets, rep_min, rep_max, rest_seconds, target_rpe, target_rir, notes
      ) values (
        created_day_id,
        catalog_id,
        custom_id,
        exercise_position,
        (prescription ->> 'targetSets')::smallint,
        (prescription ->> 'repMin')::smallint,
        (prescription ->> 'repMax')::smallint,
        (prescription ->> 'restSeconds')::smallint,
        (prescription ->> 'targetRpe')::numeric,
        (prescription ->> 'targetRir')::numeric,
        nullif(pg_catalog.btrim(prescription ->> 'notes'), '')
      );
      exercise_position := exercise_position + 1;
    end loop;
    day_position := day_position + 1;
  end loop;

  update public.routine_imports
  set status = 'confirmed', routine_id = created_routine.id, confirmed_at = pg_catalog.now()
  where id = target_import_id and user_id = caller_id;

  return created_routine;
end;
$$;

create function public.cancel_routine_import(target_import_id uuid)
returns public.routine_imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_import public.routine_imports;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('routine-import:' || caller_id::text || ':' || target_import_id::text, 0)
  );
  select i.* into target_import from public.routine_imports i
  where i.id = target_import_id and i.user_id = caller_id for update;
  if target_import.id is null then
    raise exception 'Import review was not found' using errcode = 'P0001';
  end if;
  if target_import.status = 'confirmed' then
    raise exception 'A confirmed import cannot be cancelled' using errcode = 'P0001';
  end if;
  if target_import.status = 'expired' then
    return target_import;
  end if;
  perform pg_catalog.set_config('app.routine_import_cleanup_allowed', 'true', true);
  update public.routine_imports set status = 'expired'
  where id = target_import_id and user_id = caller_id
  returning * into target_import;
  return target_import;
end;
$$;

create function public.list_expired_routine_import_cleanup_ids(target_limit integer default 10)
returns table(import_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id
  from public.routine_imports i
  where i.user_id = (select auth.uid())
    and i.cleanup_completed_at is null
    and (
      i.status = 'confirmed'
      or i.status = 'expired'
      or (i.status = 'review' and i.expires_at <= pg_catalog.now())
    )
  order by i.expires_at, i.id
  limit greatest(1, least(coalesce(target_limit, 10), 50));
$$;

create function public.get_routine_import_cleanup_manifest(target_import_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_import public.routine_imports;
  staged_paths jsonb;
  retained_paths jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select i.* into target_import from public.routine_imports i
  where i.id = target_import_id and i.user_id = caller_id;
  if target_import.id is null then
    raise exception 'Import review was not found' using errcode = 'P0001';
  end if;
  if target_import.status <> 'confirmed'
    and target_import.status <> 'expired'
    and not (target_import.status = 'review' and target_import.expires_at <= pg_catalog.now()) then
    raise exception 'Import is not ready for cleanup' using errcode = 'P0001';
  end if;
  select coalesce(pg_catalog.jsonb_agg(e.staged_image_path order by e.staged_image_path), '[]'::jsonb)
  into staged_paths
  from public.routine_import_exercises e
  where e.import_id = target_import_id and e.staged_image_path is not null;
  select coalesce(pg_catalog.jsonb_agg(c.media_path order by c.media_path), '[]'::jsonb)
  into retained_paths
  from public.custom_exercises c
  where c.source_import_id = target_import_id and c.media_path is not null;
  return pg_catalog.jsonb_build_object(
    'importId', target_import.id,
    'sourceStoragePath', target_import.source_storage_path,
    'stagedImagePaths', staged_paths,
    'retainedImagePaths', retained_paths,
    'cleanupCompleted', target_import.cleanup_completed_at is not null
  );
end;
$$;

create function public.mark_routine_import_cleanup_complete(target_import_id uuid)
returns public.routine_imports
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_import public.routine_imports;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('routine-import:' || caller_id::text || ':' || target_import_id::text, 0)
  );
  select i.* into target_import from public.routine_imports i
  where i.id = target_import_id and i.user_id = caller_id for update;
  if target_import.id is null then
    raise exception 'Import review was not found' using errcode = 'P0001';
  end if;
  if target_import.status <> 'confirmed'
    and target_import.status <> 'expired'
    and not (target_import.status = 'review' and target_import.expires_at <= pg_catalog.now()) then
    raise exception 'Import is not ready for cleanup' using errcode = 'P0001';
  end if;
  perform pg_catalog.set_config('app.routine_import_cleanup_allowed', 'true', true);
  update public.routine_imports
  set status = case when status = 'review' then 'expired' else status end,
      cleanup_completed_at = coalesce(cleanup_completed_at, pg_catalog.now())
  where id = target_import_id and user_id = caller_id
  returning * into target_import;
  return target_import;
end;
$$;

-- Copy either exercise reference into the workout snapshot. The active-session
-- uniqueness index and advisory lock make this safe under concurrent starts.
create or replace function public.start_or_resume_workout(target_day_id uuid)
returns public.workout_sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_session public.workout_sessions;
  selected_routine public.workout_routines;
  selected_day public.routine_days;
  created_session public.workout_sessions;
  exercise_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('workout:' || (select auth.uid())::text, 0)
  );

  select s.* into existing_session
  from public.workout_sessions s
  where s.user_id = (select auth.uid()) and s.status = 'in_progress'
  order by s.started_at desc, s.id
  limit 1
  for update;

  if existing_session.id is not null then
    return existing_session;
  end if;

  select r.* into selected_routine
  from public.workout_routines r
  join public.routine_days d on d.routine_id = r.id
  where d.id = target_day_id
    and not d.is_rest_day
    and r.user_id = (select auth.uid())
    and r.status = 'active'
  for update of r;

  if selected_routine.id is null then
    raise exception 'Choose a training day from your active routine' using errcode = 'P0001';
  end if;

  select d.* into selected_day
  from public.routine_days d
  where d.id = target_day_id and d.routine_id = selected_routine.id;

  select pg_catalog.count(*) into exercise_count
  from public.routine_exercises e where e.routine_day_id = selected_day.id;
  if exercise_count = 0 then
    raise exception 'Add exercises before starting this workout' using errcode = 'P0001';
  end if;

  insert into public.workout_sessions (user_id, routine_id, routine_day_id, name, status)
  values (
    (select auth.uid()), selected_routine.id, selected_day.id,
    selected_routine.name || ' · ' || selected_day.name, 'in_progress'
  ) returning * into created_session;

  insert into public.workout_session_exercises (
    workout_session_id, exercise_id, custom_exercise_id, exercise_index, notes
  )
  select created_session.id, e.exercise_id, e.custom_exercise_id, e.exercise_index, e.notes
  from public.routine_exercises e
  where e.routine_day_id = selected_day.id
  order by e.exercise_index;

  insert into public.workout_sets (
    workout_session_exercise_id, set_index, set_type
  )
  select session_exercise.id, generated_set.number - 1, 'working'
  from public.workout_session_exercises session_exercise
  join public.routine_exercises routine_exercise
    on routine_exercise.routine_day_id = selected_day.id
    and routine_exercise.exercise_index = session_exercise.exercise_index
  cross join lateral pg_catalog.generate_series(1, routine_exercise.target_sets)
    as generated_set(number)
  where session_exercise.workout_session_id = created_session.id;

  return created_session;
end;
$$;

create view public.exercise_library with (security_invoker = true) as
select
  'catalog:' || c.id as exercise_key,
  'catalog'::text as source_kind,
  c.id as catalog_exercise_id,
  null::uuid as custom_exercise_id,
  null::uuid as user_id,
  c.name,
  null::text as description,
  c.category,
  c.body_part,
  c.equipment,
  c.target,
  c.muscle_group,
  c.secondary_muscles,
  c.instructions,
  c.instruction_steps,
  c.image_source,
  c.gif_source,
  c.media_id,
  null::text as media_path,
  c.attribution,
  c.source_version,
  c.created_at,
  c.updated_at
from public.exercise_catalog c
union all
select
  'custom:' || c.id::text,
  'custom'::text,
  null::text,
  c.id,
  c.user_id,
  c.name,
  c.description,
  c.category,
  c.body_part,
  c.equipment,
  c.target,
  c.muscle_group,
  c.secondary_muscles,
  c.instructions,
  c.instruction_steps,
  null::text,
  null::text,
  null::text,
  c.media_path,
  pg_catalog.jsonb_build_object('source', 'user_import'),
  'user'::text,
  c.created_at,
  c.updated_at
from public.custom_exercises c;

drop view public.exercise_history;
create view public.exercise_history with (security_invoker = true) as
select
  s.user_id,
  case
    when e.exercise_id is not null then 'catalog:' || e.exercise_id
    else 'custom:' || e.custom_exercise_id::text
  end as exercise_key,
  e.exercise_id,
  e.custom_exercise_id,
  coalesce(catalog.name, custom.name) as exercise_name,
  s.id as workout_session_id,
  s.started_at,
  ws.weight_kg,
  ws.reps,
  ws.rpe,
  ws.rir,
  ws.set_type,
  ws.completed_at
from public.workout_sessions s
join public.workout_session_exercises e on e.workout_session_id = s.id
left join public.exercise_catalog catalog on catalog.id = e.exercise_id
left join public.custom_exercises custom on custom.id = e.custom_exercise_id
join public.workout_sets ws on ws.workout_session_exercise_id = e.id
where s.status = 'completed' and ws.completed_at is not null;

drop view public.personal_bests;
create view public.personal_bests with (security_invoker = true) as
select
  s.user_id,
  case
    when e.exercise_id is not null then 'catalog:' || e.exercise_id
    else 'custom:' || e.custom_exercise_id::text
  end as exercise_key,
  e.exercise_id,
  e.custom_exercise_id,
  coalesce(catalog.name, custom.name) as exercise_name,
  max(ws.weight_kg) as max_weight_kg,
  max(ws.weight_kg * (1 + ws.reps::numeric / 30))
    filter (where ws.reps > 0) as estimated_one_rep_max,
  max(ws.reps) as max_reps
from public.workout_sessions s
join public.workout_session_exercises e on e.workout_session_id = s.id
left join public.exercise_catalog catalog on catalog.id = e.exercise_id
left join public.custom_exercises custom on custom.id = e.custom_exercise_id
join public.workout_sets ws on ws.workout_session_exercise_id = e.id
where s.status = 'completed'
  and ws.completed_at is not null
  and ws.set_type <> 'warmup'
group by
  s.user_id, e.exercise_id, e.custom_exercise_id,
  coalesce(catalog.name, custom.name);

grant select on public.routine_imports, public.routine_import_exercises to authenticated;
grant select, insert, update, delete on public.custom_exercises to authenticated;
grant select on public.exercise_library, public.exercise_history, public.personal_bests to authenticated;

revoke all on function public.stage_routine_import_review(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, timestamptz
) from public, anon;
revoke all on function public.confirm_routine_import(uuid, jsonb) from public, anon;
revoke all on function public.cancel_routine_import(uuid) from public, anon;
revoke all on function public.list_expired_routine_import_cleanup_ids(integer) from public, anon;
revoke all on function public.get_routine_import_cleanup_manifest(uuid) from public, anon;
revoke all on function public.mark_routine_import_cleanup_complete(uuid) from public, anon;
revoke all on function public.start_or_resume_workout(uuid) from public, anon;

grant execute on function public.stage_routine_import_review(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, timestamptz
) to authenticated;
grant execute on function public.confirm_routine_import(uuid, jsonb) to authenticated;
grant execute on function public.cancel_routine_import(uuid) to authenticated;
grant execute on function public.list_expired_routine_import_cleanup_ids(integer) to authenticated;
grant execute on function public.get_routine_import_cleanup_manifest(uuid) to authenticated;
grant execute on function public.mark_routine_import_cleanup_complete(uuid) to authenticated;
grant execute on function public.start_or_resume_workout(uuid) to authenticated;

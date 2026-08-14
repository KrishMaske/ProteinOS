-- Private, short-lived source files for AI-assisted workout imports.
alter table public.ai_runs
  drop constraint ai_runs_run_type_check;

alter table public.ai_runs
  add constraint ai_runs_run_type_check
  check (run_type in ('coach', 'food_analysis', 'routine_import'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gym-files',
  'gym-files',
  false,
  6291456,
  array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/tab-separated-values',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy gym_files_read_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'gym-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy gym_files_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'gym-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy gym_files_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'gym-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

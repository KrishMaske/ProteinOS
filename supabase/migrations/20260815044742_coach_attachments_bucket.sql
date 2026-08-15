-- Private bucket for images the user sends Coach. Same shape as food-photos: the object
-- key is prefixed with the owner's id and policies check that prefix, so one user can
-- never read another's attachment even with a guessed path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'coach-attachments',
  'coach-attachments',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Users read own coach attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'coach-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users upload own coach attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'coach-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users delete own coach attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'coach-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Attachment paths are recorded on the message so a conversation can be replayed with
-- its images intact rather than losing them after the first turn.
alter table public.ai_messages
  add column attachments jsonb not null default '[]'::jsonb;

comment on column public.ai_messages.attachments is
  'Array of storage paths in coach-attachments belonging to this message.';

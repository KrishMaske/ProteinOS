-- Tighten the review-first custom exercise import surface after deployment.
-- Existing project-wide default grants include privileges that these tables do
-- not need; keep only the operations used by the authenticated app client.

revoke all on table public.routine_imports from authenticated;
revoke all on table public.routine_import_exercises from authenticated;
revoke all on table public.custom_exercises from authenticated;

grant select on table public.routine_imports to authenticated;
grant select on table public.routine_import_exercises to authenticated;
grant select, insert, update, delete on table public.custom_exercises to authenticated;

-- Cover the composite ownership foreign key used during import confirmation.
create index custom_exercises_source_import_user_idx
  on public.custom_exercises (source_import_id, user_id)
  where source_import_id is not null;

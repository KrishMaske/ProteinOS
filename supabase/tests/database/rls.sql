begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'one@example.test', '', now(), 'authenticated', 'authenticated', '{}', '{}'),
  ('22222222-2222-4222-8222-222222222222', 'two@example.test', '', now(), 'authenticated', 'authenticated', '{}', '{}');

insert into public.profiles (id, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'User one'),
  ('22222222-2222-4222-8222-222222222222', 'User two');

insert into public.fitness_goals (id, user_id, goal_type, is_active) values
  ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'recomp', true),
  ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 'strength', true);

insert into public.ai_conversations (id, user_id, title) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', 'Goal test'),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', '22222222-2222-4222-8222-222222222222', 'Other goal test');

insert into public.ai_messages (id, conversation_id, role, content, ui_action) values
  ('55555555-5555-4555-8555-555555555555', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'assistant', 'Confirm goal', '{"type":"confirm_goal_update","currentGoalId":"33333333-3333-4333-8333-333333333333","currentGoalType":"recomp","goalType":"muscle_gain","notes":"Updated through confirmation","label":"Update goal"}'),
  ('66666666-6666-4666-8666-666666666666', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'assistant', 'Stale goal', '{"type":"confirm_goal_update","currentGoalId":"33333333-3333-4333-8333-333333333333","currentGoalType":"recomp","goalType":"strength","notes":null,"label":"Update goal"}'),
  ('77777777-7777-4777-8777-777777777777', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'assistant', 'Other user goal', '{"type":"confirm_goal_update","currentGoalId":"44444444-4444-4444-8444-444444444444","currentGoalType":"strength","goalType":"maintenance","notes":null,"label":"Update goal"}');

insert into public.saved_foods (
  id, user_id, name, serving_quantity, serving_unit, serving_grams,
  calories, protein_grams, carbohydrate_grams, fat_grams, fiber_grams
) values
  ('18181818-1818-4818-8818-181818181818', '11111111-1111-4111-8111-111111111111', 'Greek yogurt', 1, 'cup', 225, 160, 23, 9, 0, 0),
  ('19191919-1919-4919-8919-191919191919', '22222222-2222-4222-8222-222222222222', 'Private oats', 1, 'bowl', 80, 300, 10, 54, 6, 8);

insert into public.exercise_catalog (id, name, source_version)
values ('test-exercise', 'Test press', 'test');

insert into public.custom_exercises (
  id, user_id, name, body_part, target, source_exercise_key
) values
  ('14141414-1414-4414-8414-141414141414', '11111111-1111-4111-8111-111111111111', 'User one custom press', 'chest', 'pectorals', null),
  ('15151515-1515-4515-8515-151515151515', '22222222-2222-4222-8222-222222222222', 'User two private lift', 'back', 'lats', null);

insert into public.workout_routines (id, user_id, name, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'One plan', 'draft'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Two plan', 'draft');

insert into public.routine_days (id, routine_id, name, day_index, is_rest_day) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Training A', 0, false),
  ('99999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Rest', 1, true),
  ('88888888-8888-4888-8888-888888888888', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Training B', 2, false),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Two day', 0, false);

insert into public.routine_exercises (
  id, routine_day_id, exercise_id, exercise_index, target_sets, rep_min, rep_max, rest_seconds
) values
  ('12121212-1212-4212-8212-121212121212', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'test-exercise', 0, 2, 8, 12, 90),
  ('13131313-1313-4313-8313-131313131313', '88888888-8888-4888-8888-888888888888', 'test-exercise', 0, 1, 6, 10, 120);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((select count(*) from public.profiles), 1::bigint, 'profiles are isolated by user');
select is((select display_name from public.profiles), 'User one', 'own profile is visible');
select is((select count(*) from public.workout_routines), 1::bigint, 'routines are isolated by user');
select is((select count(*) from public.routine_days), 3::bigint, 'nested routine days inherit ownership');
select is((select count(*) from public.exercise_catalog where id = 'test-exercise'), 1::bigint, 'authenticated users can read catalog');
select is((select count(*) from public.custom_exercises), 1::bigint, 'custom exercises are private to their owner');
select is((select count(*) from public.saved_foods), 1::bigint, 'saved foods are private to their owner');
select is((select count(*) from public.exercise_library where source_kind = 'custom'), 1::bigint, 'exercise library applies custom exercise RLS');
select is((select exercise_key from public.exercise_library where custom_exercise_id = '14141414-1414-4414-8414-141414141414'), 'custom:14141414-1414-4414-8414-141414141414', 'custom exercise library keys are stable');

select lives_ok(
  $$update public.profiles set display_name = 'stolen' where id = '22222222-2222-4222-8222-222222222222'$$,
  'an update against an invisible row safely affects nothing'
);
reset role;
select is(
  (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'User two',
  'another user profile remains unchanged'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.routine_days (routine_id, name, day_index) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Injected', 2)$$,
  '42501',
  'new row violates row-level security policy for table "routine_days"',
  'nested rows cannot be inserted under another user parent'
);

select throws_ok(
  $$insert into public.saved_foods (user_id, name, calories) values ('22222222-2222-4222-8222-222222222222', 'Injected food', 100)$$,
  '42501',
  'new row violates row-level security policy for table "saved_foods"',
  'saved foods cannot be inserted for another user'
);

select lives_ok(
  $$select public.log_saved_food('18181818-1818-4818-8818-181818181818', current_date, 'lunch')$$,
  'an owned saved food can be quick logged'
);
select is((select source::text from public.food_logs where name = 'Greek yogurt'), 'quick_add', 'quick logging records its source');
select is((select calories from public.food_log_items where name = 'Greek yogurt'), 160::numeric, 'quick logging copies saved nutrition facts');
select isnt((select last_logged_at from public.saved_foods where id = '18181818-1818-4818-8818-181818181818'), null::timestamptz, 'quick logging updates recent usage');
select throws_ok(
  $$select public.log_saved_food('19191919-1919-4919-8919-191919191919', current_date, 'lunch')$$,
  'P0001',
  'Saved food was not found',
  'another user saved food cannot be quick logged'
);

select throws_ok(
  $$insert into public.routine_exercises (routine_day_id, custom_exercise_id, exercise_index) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '15151515-1515-4515-8515-151515151515', 10)$$,
  '42501',
  'new row violates row-level security policy "routine_exercises_custom_exercise_own" for table "routine_exercises"',
  'an owned routine cannot reference another user custom exercise'
);

select throws_ok(
  $$insert into public.routine_exercises (routine_day_id, exercise_id, custom_exercise_id, exercise_index) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'test-exercise', '14141414-1414-4414-8414-141414141414', 10)$$,
  '23514',
  null,
  'routine exercise references enforce exactly one source'
);

select throws_ok(
  $$insert into public.routine_imports (id,user_id,source_storage_path,source_file_name,source_mime_type,extraction,warnings,expires_at) values ('16161616-1616-4616-8616-161616161616','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111/test.pdf','test.pdf','application/pdf','{}','[]',now() + interval '1 day')$$,
  '42501',
  null,
  'authenticated callers cannot directly insert import review state'
);

select throws_ok(
  $$update public.workout_routines set status = 'active' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'P0001',
  'Activate routines through activate_routine() after explicit user approval',
  'draft cannot be activated with a generic update'
);

select lives_ok(
  $$select public.activate_routine('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  'explicit activation RPC accepts an owned draft'
);
select is((select status::text from public.workout_routines where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'active', 'explicit activation changes status');
select is((select current_cycle_index from public.workout_routines where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::smallint, 'activation resets the cycle cursor');

select lives_ok(
  $$select public.start_or_resume_workout('cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$,
  'the current training day starts atomically'
);
select is((select count(*) from public.workout_sessions where status = 'in_progress'), 1::bigint, 'one active workout session is created');
select is((select count(*) from public.workout_session_exercises), 1::bigint, 'starting copies the routine exercise');
select is((select count(*) from public.workout_sets), 2::bigint, 'starting creates the prescribed sets');

select lives_ok(
  $$select public.start_or_resume_workout('88888888-8888-4888-8888-888888888888')$$,
  'a second start request resumes the active workout'
);
select is((select count(*) from public.workout_sessions where status = 'in_progress'), 1::bigint, 'resume does not create a second active workout');

select lives_ok(
  format(
    'select public.log_active_workout_set(%L, null, 10::smallint)',
    (select ws.id from public.workout_sets ws order by ws.set_index limit 1)
  ),
  'a bodyweight set can be logged without weight'
);
select is((select reps from public.workout_sets order by set_index limit 1), 10::smallint, 'quick logging stores positive reps');
select is((select weight_kg from public.workout_sets order by set_index limit 1), null::numeric, 'quick logging preserves a null bodyweight load');
select throws_ok(
  format(
    'select public.log_active_workout_set(%L, null, 0::smallint)',
    (select ws.id from public.workout_sets ws order by ws.set_index limit 1)
  ),
  '22023',
  'Reps must be greater than zero',
  'quick logging rejects zero reps'
);
select throws_ok(
  format(
    'select public.log_active_workout_set(%L, -1, 10::smallint)',
    (select ws.id from public.workout_sets ws order by ws.set_index limit 1)
  ),
  '22023',
  'Weight must be null or zero or greater',
  'quick logging rejects negative weight'
);

select lives_ok(
  format(
    'select public.complete_workout(%L)',
    (select s.id from public.workout_sessions s where s.status = 'in_progress')
  ),
  'the active workout completes atomically'
);
select is((select current_cycle_index from public.workout_routines where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1::smallint, 'completing the current workout advances to rest');
select lives_ok(
  format(
    'select public.complete_workout(%L)',
    (select s.id from public.workout_sessions s where s.status = 'completed' limit 1)
  ),
  'completing an already completed workout is idempotent'
);
select is((select current_cycle_index from public.workout_routines where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1::smallint, 'idempotent completion does not advance twice');

select lives_ok(
  $$select public.complete_rest_day('99999999-9999-4999-8999-999999999999')$$,
  'the current rest day can be completed'
);
select is((select current_cycle_index from public.workout_routines where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 2::smallint, 'completing rest advances to the next training day');

select lives_ok(
  $$select public.reorder_routine_days(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    array[
      '88888888-8888-4888-8888-888888888888',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '99999999-9999-4999-8999-999999999999'
    ]::uuid[]
  )$$,
  'an active cycle can be reordered transactionally'
);
select is((select current_cycle_index from public.workout_routines where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::smallint, 'reordering preserves the current day by identity');

select lives_ok(
  $$select public.create_routine_draft_from_json(
    'Imported rotation',
    'A training and rest cycle',
    'import',
    '[
      {"name":"Imported A","notes":null,"isRestDay":false,"exercises":[{"exerciseId":"test-exercise","targetSets":3,"repMin":8,"repMax":12,"restSeconds":90,"targetRpe":null,"targetRir":2,"notes":null}]},
      {"name":"Imported Rest","notes":null,"isRestDay":true,"exercises":[]}
    ]'::jsonb
  )$$,
  'validated JSON creates an import draft transactionally'
);
select is((select count(*) from public.workout_routines where source = 'import' and status = 'draft'), 1::bigint, 'the imported routine remains a draft');
select is((select count(*) from public.routine_days d join public.workout_routines r on r.id = d.routine_id where r.source = 'import'), 2::bigint, 'the imported routine preserves ordered cycle slots');
select is((select count(*) from public.routine_days d join public.workout_routines r on r.id = d.routine_id where r.source = 'import' and d.is_rest_day), 1::bigint, 'the imported rotation preserves its rest slot');

select throws_ok(
  $$select public.complete_rest_day('dddddddd-dddd-4ddd-8ddd-dddddddddddd')$$,
  'P0001',
  'Rest day was not found in your active routine',
  'a user cannot advance another user routine'
);

select lives_ok(
  $$select public.confirm_coach_goal_update('55555555-5555-4555-8555-555555555555', 'muscle_gain', 'Updated through confirmation', '33333333-3333-4333-8333-333333333333')$$,
  'Coach confirmation accepts a matching owned proposal'
);
select is((select goal_type::text from public.fitness_goals where is_active), 'muscle_gain', 'Coach confirmation changes the active goal');
select is((select count(*) from public.fitness_goals where is_active), 1::bigint, 'Coach confirmation preserves one active goal');
select is((select count(*) from public.fitness_goals), 2::bigint, 'goal changes retain the prior goal as history');
select is((select ui_action->>'resolution' from public.ai_messages where id = '55555555-5555-4555-8555-555555555555'), 'applied', 'the applied confirmation is persisted');
select throws_ok(
  $$select public.confirm_coach_goal_update('66666666-6666-4666-8666-666666666666', 'strength', null, '33333333-3333-4333-8333-333333333333')$$,
  'P0001',
  'Your goal changed since this proposal. Ask Coach for a new update.',
  'a stale confirmation cannot overwrite a newer goal'
);
select lives_ok(
  $$select public.dismiss_coach_goal_update('66666666-6666-4666-8666-666666666666')$$,
  'an owned confirmation can be dismissed'
);
select is((select ui_action->>'resolution' from public.ai_messages where id = '66666666-6666-4666-8666-666666666666'), 'dismissed', 'the dismissed confirmation is persisted');

select lives_ok(
  $$update public.workout_routines set status = 'draft' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and status = 'active'$$,
  'an owned active routine can be deactivated without deleting it'
);
select is(
  (select status::text from public.workout_routines where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'draft',
  'deactivation preserves the routine as a draft'
);

reset role;
select is((select goal_type::text from public.fitness_goals where user_id = '22222222-2222-4222-8222-222222222222' and is_active), 'strength', 'goal RPC does not change another user goal');
select is((select count(*) from storage.buckets where id = 'food-photos' and not public), 1::bigint, 'food photo bucket is private');
select is((select count(*) from storage.buckets where id = 'progress-photos' and not public), 1::bigint, 'progress photo bucket is private');
select is((select count(*) from storage.buckets where id = 'custom-exercise-media' and not public and file_size_limit = 5242880), 1::bigint, 'custom exercise media bucket is private and bounded');
select is((select allowed_mime_types from storage.buckets where id = 'custom-exercise-media'), array['image/jpeg', 'image/png']::text[], 'custom exercise media accepts only JPEG and PNG');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('custom_exercise_media_read_own','custom_exercise_media_insert_own','custom_exercise_media_delete_own')), 3::bigint, 'custom exercise media has owner read insert and delete policies');
select is((select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name in ('routine_imports','routine_import_exercises') and privilege_type in ('INSERT','UPDATE','DELETE')), 0::bigint, 'internal import review tables expose no direct writes');
select is((select count(*) from information_schema.role_table_grants where grantee = 'authenticated' and table_schema = 'public' and table_name = 'saved_foods' and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')), 4::bigint, 'saved foods expose only required authenticated table operations');
select is((select relrowsecurity from pg_class where oid = 'public.saved_foods'::regclass), true, 'saved foods enforce row-level security');

select * from finish();
rollback;

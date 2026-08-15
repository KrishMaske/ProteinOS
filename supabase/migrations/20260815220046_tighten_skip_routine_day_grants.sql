-- skip_routine_day was left executable by PUBLIC and anon, unlike every other workout
-- function. It refuses without a session so an anonymous call could not do anything, but
-- the surface should match complete_rest_day rather than rely on that check.
revoke execute on function public.skip_routine_day(uuid) from public;
revoke execute on function public.skip_routine_day(uuid) from anon;

-- gym_id is appended rather than slotted in beside the other session columns, because
-- create or replace view can only add columns at the end. Existing consumers select
-- explicit columns, so ordering carries no meaning for them.
create or replace view public.exercise_history
with (security_invoker = true) as
select
  s.user_id,
  case
    when e.exercise_id is not null then 'catalog:'::text || e.exercise_id
    else 'custom:'::text || e.custom_exercise_id::text
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
  ws.completed_at,
  s.gym_id
from public.workout_sessions s
join public.workout_session_exercises e on e.workout_session_id = s.id
left join public.exercise_catalog catalog on catalog.id = e.exercise_id
left join public.custom_exercises custom on custom.id = e.custom_exercise_id
join public.workout_sets ws on ws.workout_session_exercise_id = e.id
where s.status = 'completed' and ws.completed_at is not null;

-- One row per exercise per gym: the shape the question "does this feel heavier here"
-- actually needs, and the shape a model would train on later.
--
-- Working sets only, since warmups say nothing about capacity, and an estimated one-rep
-- max by Epley so sets at different rep counts stay comparable across gyms.
create or replace view public.gym_exercise_performance
with (security_invoker = true) as
select
  h.user_id,
  h.gym_id,
  g.name as gym_name,
  h.exercise_key,
  h.exercise_name,
  count(*) as completed_sets,
  count(distinct h.workout_session_id) as sessions,
  min(h.started_at) as first_logged_at,
  max(h.started_at) as last_logged_at,
  round(avg(h.weight_kg), 2) as average_weight_kg,
  max(h.weight_kg) as best_weight_kg,
  round(avg(h.reps), 2) as average_reps,
  round(avg(h.weight_kg * (1 + h.reps / 30.0)), 2) as average_estimated_1rm_kg,
  round(max(h.weight_kg * (1 + h.reps / 30.0)), 2) as best_estimated_1rm_kg,
  round(avg(h.rir), 2) as average_rir
from public.exercise_history h
left join public.gyms g on g.id = h.gym_id
where h.set_type = 'working' and h.weight_kg is not null and h.reps is not null and h.reps > 0
group by h.user_id, h.gym_id, g.name, h.exercise_key, h.exercise_name;

grant select on public.gym_exercise_performance to authenticated;

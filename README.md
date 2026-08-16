# ProteinOS

A training and nutrition tracker built as an Expo app on Supabase, with an AI coach that can
read and change everything the user can.

The app is opinionated about one thing: **a number shown to the user has to be defensible.**
Calorie targets are derived from published equations rather than a flat default, body-fat
estimates state their method and error band, and figures that cannot be computed honestly are
left blank rather than filled with a guess.

---

## Stack

| | |
|---|---|
| Expo SDK | 57.0.13 |
| expo-router | 57.0.13 (file-based routing, typed routes) |
| React Native | 0.86.2 |
| React | 19.2.3 (React Compiler enabled) |
| Backend | Supabase — Postgres, Auth, Storage, Edge Functions |
| Server state | TanStack Query 5 |
| Client state | Zustand 5 (active workout only) |
| Forms | react-hook-form + Zod 4 |
| Types | TypeScript 6 |
| Tests | Vitest 4 — 219 tests |

**Scale:** 36 routes · 25 tables · 6 views · 21 database functions · 85 RLS policies ·
6 storage buckets · 5 edge functions · 29 migrations

---

## Architecture

### Layering

```
src/app/            expo-router routes; screens only
src/features/*/     one folder per domain
  api/              Supabase calls, no React
  hooks/            TanStack Query wrappers
  services/         pure functions, no I/O — where the tested logic lives
  components/       shared feature UI
src/components/ui   the design system (Screen, Card, Field, Button…)
src/providers/      auth, theme, query client
src/store/          Zustand, active workout only
```

The rule that matters: **domain logic lives in `services/` as pure functions.** They take
numbers and return numbers, touch no network, and carry the test suite. Anything involving
Supabase lives in `api/`, and screens compose hooks. This is why 219 tests run in ~4 seconds
with no mocking of the database.

### Server state vs client state

TanStack Query owns everything persisted. Zustand holds exactly one thing — the active workout
session id and rest timer — because that is genuinely local, ephemeral UI state that should
survive navigation but never be written to the server.

### Why so much logic is in Postgres

Multi-step writes that must not half-apply are RPCs, not client sequences:

- `start_or_resume_workout` — returns an existing session or creates one, copies the
  prescription, pre-creates sets, and applies per-gym substitutions, under a per-user advisory
  lock so a double tap cannot create two sessions.
- `complete_workout` / `complete_rest_day` / `skip_routine_day` — advance the rotation, but
  only when the day being completed *is* the current cycle day.
- `log_saved_food` / `log_recipe` — fold a repeat log into the existing entry, raising its
  count and scaling macros, rather than adding a duplicate row.
- `set_food_log_item_quantity` — scales grams and all four macros by one ratio in a single
  statement, so a row can never hold a count that disagrees with its own calories.

Every table has RLS enabled. Views are `security_invoker` so they inherit it rather than
bypassing it.

---

## Domain logic

### Calorie targets

Targets are derived, never defaulted. The chain is in
`src/features/nutrition/services/nutrition-targets.ts`:

```
BMR         Mifflin-St Jeor (10·kg + 6.25·cm − 5·age + sex constant)
TDEE        BMR × lifestyle multiplier + training burn
goal        ±% applied to TDEE, tapered as the goal is approached
macros      protein from bodyweight, fat as a share, carbs take the remainder
```

Two decisions worth calling out:

**Training is costed separately from lifestyle.** The classic Harris-Benedict multipliers
describe *total daily activity* — "very active" means hard exercise *and* being on your feet
all day. Mapping gym frequency straight onto them treats someone who lifts six times a week as
a labourer and overstates maintenance by several hundred calories. Instead a lifestyle
multiplier covers life outside the gym, and training is added on at 4 net METs × bodyweight ×
hours, which values an hour of lifting at roughly 250 kcal rather than 900.

**Carbs absorb the remainder.** Protein is set from bodyweight and fat from a share of
calories; carbohydrates take whatever energy is left. This guarantees the macros always sum
back to the calorie target — an earlier version computed all three independently and produced
splits that missed the target by 4%.

Guards: the target never drops below BMR or 1200 kcal, fat holds a 0.6 g/kg floor, and protein
is capped at 40% of calories so heavy cutters keep a workable split.

If enough weight and intake history exists, observed maintenance (average intake minus the
energy implied by the weight trend) replaces the formula estimate, clamped to ±20% of it.

### Body composition

`src/features/progress/services/body-composition.ts`

BMI is exact arithmetic. Body fat is an **estimate**, and the code says so — it reports which
method produced the number and its error band:

1. A logged measurement, if one exists
2. **Relative Fat Mass** — `64 − 20 × (height/waist)`, women `76 − …` (Woolcott & Bergman 2018)
3. **Deurenberg** from BMI and age, when no waist is recorded

RFM is used over the more common US Navy method because the app collects waist but not neck or
hip, and RFM validates better against DXA anyway. Healthy ranges come from Gallagher et al.
(2000) Table 4, stratified by age and sex — body fat rises with age at constant health risk, so
a single band would mislabel older adults.

An unstated biological sex takes the **midpoint** of the male and female constants rather than
assuming one. Same convention in BMR, RFM and Deurenberg.

Everything is computed from **weekly averages**, not the latest reading, so a heavy morning
cannot move the number.

### Workout rotation

Routines are **cycles, not calendars.** `workout_routines.current_cycle_index` is a cursor into
the ordered days. Nothing is date-based: miss three days and the same day is still waiting.

The cursor advances only on completion, and only when the completed day *is* the current one —
so an out-of-order session logs normally without derailing the rotation. Rest days occupy a
slot and advance only when explicitly completed.

Sets have three states, not two: pending, completed, and **skipped**. Without the third,
passing on a set means either logging it as done — corrupting history and the overload
suggestion — or leaving it pending forever. Skipped sets fall out of volume, records and
history automatically, because `exercise_history` filters on `completed_at IS NOT NULL`.

### Gyms

The same lift feels different across gyms: plate calibration, machine brands, cable friction.
Sessions are stamped with a gym so that becomes measurable.

- The default gym is stamped at session start — asking every time would be answered carelessly,
  and a field filled in wrongly is worse than one left null.
- `gym_exercise_substitutions` records "at this gym use B instead of A", applied when the
  session starts, so a gym missing a machine does not force the same manual swap every visit.
- `gym_exercise_performance` groups by `(gym, exercise)` and compares estimated 1RM (Epley), so
  sets at different rep counts stay comparable. Two different lifts are never averaged into one
  number.

---

## AI

### Model routing

Three workloads, three variables, three defaults — set per workload rather than globally:

| Function | Variable | Default | Why |
|---|---|---|---|
| ai-coach | `OPENAI_MODEL` | `gpt-5.6-luna` | conversational, behind human review |
| import-workout-file | `OPENAI_IMPORT_MODEL` | `gpt-5.6-luna` | every match is user-approved |
| analyze-food | `OPENAI_VISION_MODEL` | `gpt-5.6-terra` | see below |

Food analysis stays on the stronger tier deliberately. A misidentified meal looks plausible, is
accepted without question, and then propagates into daily totals, weekly averages, body
composition and recalculated targets. The lookup order is *explicit variable → per-workload
default → generic `OPENAI_MODEL`* — the generic value is consulted **last** so setting it cannot
silently drag vision onto a cheaper model.

### Coach tools

36 tools — 18 read, 18 write — covering every capability the app itself exposes.

Editing is consolidated per entity behind an `action` enum (`manage_food_log`,
`manage_routine`, `manage_workout_set`, …) rather than one tool per operation. Forty narrow
tools would degrade the model's ability to pick correctly.

One deliberate exception: **`propose_goal_update` does not change the goal.** It creates a
confirmation card the user must accept, because the primary goal drives every calorie target
and should not move on a misread.

Each tool passes through three layers — a JSON schema shown to the model, a Zod schema
validating the response, and a handler. A tool missing the middle layer is silent at build time
and only surfaces as the coach saying it cannot do the thing. `tests/coach-tool-wiring.test.ts`
asserts all three stay in step; it was written after exactly that bug shipped.

### Food photos

Two-step by design: the photo uploads, then the user adds an optional note, then both go to the
model. The note materially improves accuracy — naming the dish beats guessing from pixels — and
asking after the photo is the only point where the user knows what the photo actually shows.

---

## Database

**Tables** — `profiles`, `fitness_goals`, `nutrition_targets`, `body_metrics`,
`progress_photos`, `food_logs`, `food_log_items`, `saved_foods`, `recipes`,
`recipe_ingredients`, `workout_routines`, `routine_days`, `routine_exercises`,
`workout_sessions`, `workout_session_exercises`, `workout_sets`, `exercise_catalog`,
`custom_exercises`, `gyms`, `gym_exercise_substitutions`, `routine_imports`,
`routine_import_exercises`, `ai_conversations`, `ai_messages`, `ai_runs`

**Views** — `daily_nutrition_totals`, `exercise_history`, `exercise_library`,
`gym_exercise_performance`, `personal_bests`, `weekly_workout_summary`

**Buckets** (all private, user-id-prefixed paths) — `food-photos`, `progress-photos`,
`recipe-images`, `coach-attachments`, `custom-exercise-media`, `gym-files`

Totals are never stored where they can be derived. Recipe macros sum from ingredients; daily
nutrition sums from log items. A cached total is a total that can disagree with its own parts.

---

## Testing

```bash
npm test          # vitest, 219 tests
npm run typecheck # tsc --noEmit
npm run lint      # expo lint
```

Tests cover the `services/` layer — the arithmetic that would be silently wrong. Reference
values are computed by hand from the source equations, not captured from the implementation, so
a test failing means the maths changed rather than the output moved.

Screens are not tested. The tradeoff is deliberate: the domain logic is where a bug produces a
wrong number the user trusts.

---

## Setup

```bash
npm install
cp .env.example .env    # fill in the two EXPO_PUBLIC_ values
npx expo start
```

`src/lib/env.ts` validates both variables at launch and renders a configuration screen instead
of the app if either is missing, rather than failing at the first query.

Server-only secrets are set with `supabase secrets set` and never prefixed `EXPO_PUBLIC_` —
anything so prefixed is embedded in the client bundle.

### Deployment

```bash
supabase functions deploy <name> --project-ref <ref>
```

Deploy from the CLI rather than pasting sources: it reads bytes from disk, which rules out
transcription drift between the repo and production.

iOS builds run from `.github/workflows/build-ipa.yml` on `macos-26` — Expo SDK 57 ships Swift
packages requiring `swift-tools-version 6.2`, which only Xcode 26 provides. The workflow
prebuilds, installs pods, builds unsigned, and publishes the IPA as a GitHub Release for
sideloading.

---

## Notable decisions

**Nothing derived is stored.** Recipe and daily totals sum from their parts; BMI and body fat
compute on read. Storing them invites disagreement between a cached number and its source.

**Weekly averages over latest readings.** Composition and trends run off calendar-week means, so
one heavy morning cannot move a target.

**Three-state sets.** Skipping is distinct from completing and from pending, so passing on work
never corrupts history.

**Null means unrecorded.** A session with no gym, a profile with no biological sex, a week with
no weigh-in — these stay null and are handled explicitly, rather than being filled with a
plausible default that later reads as fact.

**The keyboard is measured, not inferred.** `Screen` reads the keyboard's own frame and the
container's position rather than trusting `KeyboardAvoidingView`, which infers padding from its
own frame and fails silently when an ancestor offsets it.

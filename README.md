# ProteinOS

ProteinOS is an Expo/React Native personal fitness and nutrition tracker backed directly by Supabase. The core loop works without AI: onboard, build a routine, log a workout, record food, and track progress. OpenAI-powered coaching and food-photo estimates are isolated in authenticated Supabase Edge Functions.

The phone UI uses four focused tabs—Today, Train, Nutrition, and Progress. Coach is available contextually from Today and plan creation instead of occupying a permanent tab.

## Stack

- Expo SDK 54, React Native, TypeScript, and Expo Router (temporarily pinned for physical-device Expo Go testing)
- Supabase Auth, Postgres, Storage, and Edge Functions
- TanStack Query for server state
- Persisted Zustand state for active-workout recovery, pending edits, and the rest timer
- Zod and React Hook Form for validation
- OpenAI Responses API through server-side Edge Functions only

Normal CRUD flows directly between the mobile client and Supabase under Row Level Security. There is no custom application server.

## Prerequisites

- Node.js 20 or newer
- npm
- Docker Desktop for the local Supabase stack
- A Supabase project and Supabase CLI login
- An OpenAI API key for the optional AI features

## Configure the client

```powershell
Copy-Item .env.example .env
```

Fill in only the public client values:

```text
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never place `OPENAI_API_KEY`, a Supabase service-role key, or any other server secret in an `EXPO_PUBLIC_` variable. `.env` is ignored by Git.

## Local development

Install dependencies and start Supabase:

```powershell
npm install
npx supabase start
npx supabase db reset
```

Create `supabase/.env.local` from `supabase/.env.example`, then serve the Edge Functions:

```powershell
npx supabase functions serve --env-file supabase/.env.local
```

In another terminal, start Expo:

```powershell
npm start
```

The current mobile environment points to the connected hosted project. To use the local stack, replace the two public Supabase values in `.env` with the values printed by `npx supabase status`.

### Temporary Expo Go compatibility

The native dependency layer is currently pinned to Expo SDK 54 because the App Store Expo Go client on physical iPhones supports SDK 54. Before producing an IPA, upgrade Expo one SDK at a time and run Expo's compatibility resolver after each step:

```powershell
npm install expo@^55.0.0
npx expo install --fix
npx expo-doctor
```

Repeat for SDK 56 and then SDK 57, reviewing each SDK's release notes and running the validation commands below after every upgrade.

## Apply changes to a hosted project

Link the CLI and push migrations:

```powershell
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

Configure Edge Function secrets without committing them:

```powershell
npx supabase secrets set --env-file supabase/.env.local
npx supabase functions deploy analyze-food
npx supabase functions deploy ai-coach
npx supabase functions deploy import-workout-file
```

`OPENAI_MODEL` and `OPENAI_VISION_MODEL` default to `gpt-5.6-terra`. Set them explicitly when you want controlled model rollouts.

## Exercise catalog import

The trusted import script downloads the JSON source at an exact Git commit, validates and normalizes every row, preserves source IDs and attribution, and upserts idempotently. The normal app never downloads the repository.

Validate without writing:

```powershell
npm run sync:exercises -- --dry-run
```

Import into a local or hosted project from a trusted terminal:

```powershell
$env:SUPABASE_URL='https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='your-service-role-key'
npm run sync:exercises
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```

The service-role key is required only for this trusted administrative import. Never add it to Expo or commit it. See [EXERCISE_DATA_NOTICE.md](./EXERCISE_DATA_NOTICE.md) before distributing exercise media.

## Validation

```powershell
npm run typecheck
npm test
npm run lint
npx expo-doctor
```

Database/RLS tests live at `supabase/tests/database/rls.sql`. With the local stack running:

```powershell
npx supabase test db
```

Unit tests do not call the live OpenAI API. They cover unit conversion, macro aggregation, workout volume, progressive overload, routine validation, strict food output validation, moving averages, recomposition summaries, unknown AI exercise IDs, and safe goal-update proposals.

## Security and privacy

- Every private table has RLS; nested records prove ownership through their parent.
- `exercise_catalog` is read-only for authenticated app users.
- Food, progress-photo, and temporary gym-file buckets are private and use user-owned paths.
- Progress photos display through one-hour signed URLs; public URLs are never generated.
- Food source photos are deleted after confirmation by default and can be retained privately in Settings.
- All AI functions require a valid user JWT and use that user’s Supabase client, so RLS remains the authorization boundary.
- The coach exposes bounded domain tools, never arbitrary SQL. AI-created routines are always drafts and require explicit activation through the app.
- OpenAI requests use `store: false`, a hashed safety identifier, strict schemas, and bounded timeouts. Hidden reasoning is not stored.

## Project layout

```text
src/app/                 Expo Router screens
src/features/            Feature APIs, hooks, services, and components
src/lib/supabase/        Typed Supabase client
src/lib/openai-types/    Shared AI response validation
src/store/               Persisted transient workout state
src/types/               Generated database types and domain aliases
scripts/                 Trusted exercise synchronization
supabase/migrations/     Versioned schema, RLS, views, and RPCs
supabase/functions/      Authenticated AI Edge Functions
supabase/tests/          Database and RLS assertions
```

## AI behavior

`ai-coach` uses exact, strict tools for user profile, exercise search/details, active routine, training history, exercise history, nutrition summary, body metrics, training aggregates, goal proposals, and draft creation. It retrieves context only when needed and caps tool iterations. Routine creation verifies every exercise ID before any routine row is written. Goal changes require an explicit confirmation card; confirmations are persisted, reject stale proposals, and retain prior goals as history.

`analyze-food` downloads only an authenticated user-owned private image and requests strict structured food estimates. The client shows confidence, warnings, editable portions/macros, and requires confirmation before saving. Photo estimates are always labeled as estimates.

`import-workout-file` accepts a private workout PDF, Word document, text file, CSV, or spreadsheet up to 6 MB. It extracts the complete ordered split—including rest slots and A/B alternation—matches exercises to the trusted catalog, creates only a reviewable draft, and deletes the temporary upload after processing.

## Current hosted setup

The connected Supabase project has all migrations applied, 1,324 normalized exercise records imported from source commit `6f3031b3b2b2934890b6f26376d7e22bfc308d6a`, and all three Edge Functions deployed with JWT verification. AI calls require the project’s `OPENAI_API_KEY` secret to be configured by the project owner.

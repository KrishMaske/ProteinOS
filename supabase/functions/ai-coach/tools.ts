import { z } from 'npm:zod@4.4.3';

type SupabaseClient = any;

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };
const goalTypes = ['recomp', 'fat_loss', 'muscle_gain', 'maintenance', 'strength'] as const;

function strictObject(properties: Record<string, unknown>, required = Object.keys(properties)) {
  return { type: 'object', additionalProperties: false, properties, required };
}

const routineExercise = strictObject({
  exerciseId: { type: 'string', minLength: 1 },
  targetSets: { type: 'integer', minimum: 1, maximum: 20 },
  repMin: { ...nullableNumber, minimum: 1, maximum: 100 },
  repMax: { ...nullableNumber, minimum: 1, maximum: 100 },
  restSeconds: { type: 'integer', minimum: 0, maximum: 3600 },
  targetRpe: { ...nullableNumber, minimum: 1, maximum: 10 },
  targetRir: { ...nullableNumber, minimum: 0, maximum: 10 },
  notes: nullableString,
});

export const coachTools = [
  {
    type: 'function', name: 'get_user_profile', strict: true,
    description: 'Get the signed-in user profile, active goal, and current nutrition target.',
    parameters: strictObject({ includeNutritionTarget: { type: 'boolean' } }),
  },
  {
    type: 'function', name: 'propose_goal_update', strict: true,
    description: 'Prepare a primary fitness-goal change for explicit user confirmation. This does not write any data.',
    parameters: strictObject({
      goalType: { type: 'string', enum: goalTypes },
      notes: { type: ['string', 'null'], maxLength: 500 },
    }),
  },
  {
    type: 'function', name: 'get_training_history', strict: true,
    description: 'Get recent completed workout sessions, exercises, and logged sets.',
    parameters: strictObject({ limit: { type: 'integer', minimum: 1, maximum: 12 } }),
  },
  {
    type: 'function', name: 'get_nutrition_summary', strict: true,
    description: 'Get recent daily nutrition totals and food logs for the requested number of days.',
    parameters: strictObject({ days: { type: 'integer', minimum: 1, maximum: 30 } }),
  },
  {
    type: 'function', name: 'get_body_metrics', strict: true,
    description: 'Get recent user body measurements.',
    parameters: strictObject({ limit: { type: 'integer', minimum: 1, maximum: 24 } }),
  },
  {
    type: 'function', name: 'get_active_routine', strict: true,
    description: 'Get the active routine and its ordered days and exercises.',
    parameters: strictObject({ includeExercises: { type: 'boolean' } }),
  },
  {
    type: 'function', name: 'search_exercises', strict: true,
    description: 'Search the trusted exercise catalog. Use returned IDs before creating a routine draft.',
    parameters: strictObject({
      query: { type: 'string' },
      bodyPart: nullableString,
      target: nullableString,
      equipment: nullableString,
      limit: { type: 'integer', minimum: 1, maximum: 20 },
    }),
  },
  {
    type: 'function', name: 'get_exercise_details', strict: true,
    description: 'Get canonical details for a short list of trusted exercise IDs.',
    parameters: strictObject({ exerciseIds: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string', minLength: 1 } } }),
  },
  {
    type: 'function', name: 'get_exercise_history', strict: true,
    description: 'Get the user’s completed set history for one exercise key returned by training history, an active routine, or exercise search. Keys start with catalog: or custom:.',
    parameters: strictObject({ exerciseKey: { type: 'string', pattern: '^(catalog|custom):.+$' }, limit: { type: 'integer', minimum: 1, maximum: 40 } }),
  },
  {
    type: 'function', name: 'get_training_summary', strict: true,
    description: 'Get weekly workout count, working sets, and volume for a recent date window.',
    parameters: strictObject({ days: { type: 'integer', minimum: 7, maximum: 180 } }),
  },
  {
    type: 'function', name: 'create_routine_draft', strict: true,
    description: 'Create a reviewable ordered workout cycle using only verified exercise IDs. Include explicit rest slots and expand alternating A/B patterns into their full repeating cycle. Never activates it.',
    parameters: strictObject({
      name: { type: 'string', minLength: 1, maxLength: 120 },
      description: nullableString,
      days: {
        type: 'array', minItems: 1, maxItems: 21,
        items: strictObject({
          name: { type: 'string', minLength: 1, maxLength: 120 },
          notes: nullableString,
          isRestDay: { type: 'boolean' },
          exercises: { type: 'array', minItems: 0, maxItems: 30, items: routineExercise },
        }),
      },
    }),
  },
] as const;

const nullableText = z.string().nullable();
const routineExerciseInput = z.object({
  exerciseId: z.string().min(1), targetSets: z.number().int().min(1).max(20), repMin: z.number().min(1).max(100).nullable(), repMax: z.number().min(1).max(100).nullable(), restSeconds: z.number().int().min(0).max(3600), targetRpe: z.number().min(1).max(10).nullable(), targetRir: z.number().min(0).max(10).nullable(), notes: nullableText,
}).strict().refine((value) => value.repMin === null || value.repMax === null || value.repMax >= value.repMin, { path: ['repMax'], message: 'repMax must be greater than or equal to repMin' });

const toolInputSchemas: Record<string, z.ZodType> = {
  get_user_profile: z.object({ includeNutritionTarget: z.boolean() }).strict(),
  propose_goal_update: z.object({ goalType: z.enum(goalTypes), notes: z.string().trim().max(500).nullable() }).strict(),
  get_training_history: z.object({ limit: z.number().int().min(1).max(12) }).strict(),
  get_nutrition_summary: z.object({ days: z.number().int().min(1).max(30) }).strict(),
  get_body_metrics: z.object({ limit: z.number().int().min(1).max(24) }).strict(),
  get_active_routine: z.object({ includeExercises: z.boolean() }).strict(),
  search_exercises: z.object({ query: z.string(), bodyPart: nullableText, target: nullableText, equipment: nullableText, limit: z.number().int().min(1).max(20) }).strict(),
  get_exercise_details: z.object({ exerciseIds: z.array(z.string().min(1)).min(1).max(20) }).strict(),
  get_exercise_history: z.object({ exerciseKey: z.string().regex(/^(catalog|custom):.+$/), limit: z.number().int().min(1).max(40) }).strict(),
  get_training_summary: z.object({ days: z.number().int().min(7).max(180) }).strict(),
  create_routine_draft: z.object({
    name: z.string().trim().min(1).max(120), description: nullableText,
    days: z.array(z.object({ name: z.string().trim().min(1).max(120), notes: nullableText, isRestDay: z.boolean(), exercises: z.array(routineExerciseInput).max(30) }).strict()).min(1).max(21),
  }).strict().superRefine((value, context) => {
    if (!value.days.some((day) => !day.isRestDay)) context.addIssue({ code: 'custom', path: ['days'], message: 'A routine needs at least one training day' });
    value.days.forEach((day, index) => {
      if (day.isRestDay && day.exercises.length) context.addIssue({ code: 'custom', path: ['days', index, 'exercises'], message: 'Rest days cannot contain exercises' });
      if (!day.isRestDay && !day.exercises.length) context.addIssue({ code: 'custom', path: ['days', index, 'exercises'], message: 'Training days need at least one exercise' });
    });
  }),
};

export function validateToolArguments(name: string, input: unknown) {
  const schema = toolInputSchemas[name];
  if (!schema) throw new Error(`Unsupported tool: ${name}`);
  return schema.parse(input);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function dataOrThrow({ data, error }: { data: any; error: any }): any {
  if (error) throw error;
  return data;
}

function relatedExercise(value: any) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function withExerciseIdentity(exercise: any) {
  if (!exercise) return exercise;
  const details = relatedExercise(exercise.exercise_catalog) ?? relatedExercise(exercise.custom_exercises);
  return {
    ...exercise,
    exercise_key: exercise.exercise_id
      ? `catalog:${exercise.exercise_id}`
      : exercise.custom_exercise_id
        ? `custom:${exercise.custom_exercise_id}`
        : null,
    exercise_name: details?.name ?? null,
  };
}

function withTrainingExerciseIdentity(sessions: any) {
  if (!Array.isArray(sessions)) return sessions;
  return sessions.map((session) => ({
    ...session,
    workout_session_exercises: Array.isArray(session.workout_session_exercises)
      ? session.workout_session_exercises.map(withExerciseIdentity)
      : session.workout_session_exercises,
  }));
}

function withRoutineExerciseIdentity(routine: any) {
  if (!routine || !Array.isArray(routine.routine_days)) return routine;
  return {
    ...routine,
    routine_days: routine.routine_days.map((day: any) => ({
      ...day,
      routine_exercises: Array.isArray(day.routine_exercises)
        ? day.routine_exercises.map(withExerciseIdentity)
        : day.routine_exercises,
    })),
  };
}

async function createRoutineDraft(client: SupabaseClient, userId: string, args: any) {
  const exerciseIds = [...new Set(args.days.flatMap((day: any) => day.exercises.map((exercise: any) => exercise.exerciseId)))] as string[];
  const catalog = dataOrThrow(await client.from('exercise_catalog').select('id').in('id', exerciseIds));
  const found = new Set((catalog ?? []).map((row: any) => row.id));
  const unknownExerciseIds = exerciseIds.filter((id) => !found.has(id));
  if (unknownExerciseIds.length) {
    return { ok: false, error: 'unknown_exercise_ids', unknownExerciseIds };
  }

  const createdRoutine = dataOrThrow(await client.rpc('create_routine_draft_from_json', {
    target_name: args.name,
    target_description: args.description,
    target_source: 'ai',
    target_days: args.days,
  }));
  const routineId = typeof createdRoutine === 'string' ? createdRoutine : createdRoutine?.id;
  if (!routineId) throw new Error('Routine draft creation returned no ID');
  return { ok: true, routineId, name: args.name, status: 'draft', requiresUserActivation: true };
}

export async function executeCoachTool(client: SupabaseClient, userId: string, name: string, args: any) {
  switch (name) {
    case 'get_user_profile': {
      const [profile, goal, target, metrics] = await Promise.all([
        client.from('profiles').select('*').eq('id', userId).maybeSingle(),
        client.from('fitness_goals').select('*').eq('is_active', true).maybeSingle(),
        args.includeNutritionTarget ? client.from('nutrition_targets').select('*').order('effective_from', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
        // The profile carries goal_body_fat_min/max; without the latest readings the model
        // can see the target but not the gap to it.
        client.from('body_metrics').select('measured_at,weight_kg,waist_cm,body_fat_percent')
          .eq('user_id', userId).order('measured_at', { ascending: false }).limit(5),
      ]);
      return {
        profile: dataOrThrow(profile),
        activeGoal: dataOrThrow(goal),
        nutritionTarget: dataOrThrow(target),
        recentBodyMetrics: dataOrThrow(metrics),
      };
    }
    case 'propose_goal_update': {
      const current = dataOrThrow(await client.from('fitness_goals')
        .select('id,goal_type,notes')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle());
      return {
        ok: true,
        currentGoalId: current?.id ?? null,
        currentGoalType: current?.goal_type ?? null,
        proposedGoalType: args.goalType,
        notes: args.notes,
        requiresConfirmation: true,
      };
    }
    case 'get_training_history': {
      const sessions = dataOrThrow(await client.from('workout_sessions')
        .select('id,name,started_at,completed_at,duration_seconds,workout_session_exercises(exercise_id,custom_exercise_id,exercise_catalog(name,body_part,target,equipment),custom_exercises(name,body_part,target,equipment),workout_sets(set_index,set_type,weight_kg,reps,rpe,rir,completed_at))')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(args.limit));
      return withTrainingExerciseIdentity(sessions);
    }
    case 'get_nutrition_summary': {
      const since = daysAgo(args.days - 1);
      const [totals, logs] = await Promise.all([
        client.from('daily_nutrition_totals').select('*').gte('logged_date', since).order('logged_date', { ascending: false }),
        client.from('food_logs').select('logged_date,meal_type,name,source,food_log_items(name,calories,protein_grams,carbohydrate_grams,fat_grams)').gte('logged_date', since).order('logged_date', { ascending: false }),
      ]);
      return { totals: dataOrThrow(totals), logs: dataOrThrow(logs) };
    }
    case 'get_body_metrics':
      return dataOrThrow(await client.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(args.limit));
    case 'get_active_routine': {
      const routine = dataOrThrow(await client.from('workout_routines')
        .select(args.includeExercises
          ? '*,routine_days(*,routine_exercises(*,exercise_catalog(name,body_part,target,equipment),custom_exercises(name,body_part,target,equipment)))'
          : '*,routine_days(*)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle());
      return args.includeExercises ? withRoutineExerciseIdentity(routine) : routine;
    }
    case 'search_exercises': {
      let query = client.from('exercise_catalog').select('id,name,body_part,target,equipment,instruction_steps').order('name').limit(args.limit);
      if (args.query) query = query.ilike('name', `%${args.query.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
      if (args.bodyPart) query = query.eq('body_part', args.bodyPart);
      if (args.target) query = query.eq('target', args.target);
      if (args.equipment) query = query.eq('equipment', args.equipment);
      return dataOrThrow(await query);
    }
    case 'get_exercise_details':
      return dataOrThrow(await client.from('exercise_catalog').select('id,name,category,body_part,equipment,target,muscle_group,secondary_muscles,instruction_steps').in('id', args.exerciseIds));
    case 'get_exercise_history': {
      // exerciseId is accepted here only for direct legacy callers. The published
      // tool contract uses an explicit key so custom and catalog IDs cannot collide.
      const exerciseKey = args.exerciseKey ?? (args.exerciseId ? `catalog:${args.exerciseId}` : null);
      if (!exerciseKey || !/^(catalog|custom):.+$/.test(exerciseKey)) throw new Error('A valid exercise key is required');
      return dataOrThrow(await client.from('exercise_history')
        .select('exercise_key,exercise_id,custom_exercise_id,exercise_name,workout_session_id,started_at,weight_kg,reps,rpe,rir,set_type,completed_at')
        .eq('user_id', userId)
        .eq('exercise_key', exerciseKey)
        .order('started_at', { ascending: false })
        .limit(args.limit));
    }
    case 'get_training_summary':
      return dataOrThrow(await client.from('weekly_workout_summary').select('*').gte('week_start', daysAgo(args.days)).order('week_start', { ascending: false }));
    case 'create_routine_draft':
      return createRoutineDraft(client, userId, args);
    default:
      throw new Error(`Unsupported tool: ${name}`);
  }
}

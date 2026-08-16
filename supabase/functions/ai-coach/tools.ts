import { z } from 'npm:zod@4.4.3';
import {
  bodyMassIndex,
  estimateBodyFat,
  healthyBodyFatRange,
  healthyWeightRangeKg,
  weekStartKey,
  HEALTHY_BMI,
} from '../_shared/body-composition.ts';

type SupabaseClient = any;

const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };
const goalTypes = ['recomp', 'fat_loss', 'muscle_gain', 'maintenance', 'strength'] as const;
const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks', 'other'] as const;
/** Strict mode makes the model send every field, so the date arrives as null when unset. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const loggedFoodItem = strictObject({
  name: { type: 'string', minLength: 1, maxLength: 160 },
  quantity: nullableNumber,
  unit: nullableString,
  grams: nullableNumber,
  calories: { type: 'number', minimum: 0 },
  proteinGrams: { type: 'number', minimum: 0 },
  carbohydrateGrams: { type: 'number', minimum: 0 },
  fatGrams: { type: 'number', minimum: 0 },
  fiberGrams: nullableNumber,
});

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
    type: 'function', name: 'get_body_composition', strict: true,
    description: 'Get the user’s current BMI, body fat, lean and fat mass, the healthy ranges for their age and sex, and their goal body-fat band. Figures are averaged per calendar week, exactly as the Progress screen shows them, so quote these rather than deriving your own.',
    parameters: strictObject({ weeks: { type: 'integer', minimum: 1, maximum: 26 } }),
  },
  {
    type: 'function', name: 'get_nutrition_targets', strict: true,
    description: 'Get the current calorie and macro targets together with every input and step that produced them: BMR, lifestyle multiplier, training burn, maintenance, and the goal adjustment. Use this to explain why a target is what it is.',
    parameters: strictObject({}),
  },
  {
    type: 'function', name: 'get_saved_foods', strict: true,
    description: 'Get the user’s saved foods with their serving sizes and macros, for suggesting meals they already eat.',
    parameters: strictObject({ limit: { type: 'integer', minimum: 1, maximum: 100 } }),
  },
  {
    type: 'function', name: 'get_recipes', strict: true,
    description: 'List the user’s saved recipes with their per-serving macros and ingredient counts.',
    parameters: strictObject({ limit: { type: 'integer', minimum: 1, maximum: 50 } }),
  },
  {
    type: 'function', name: 'get_recipe', strict: true,
    description: 'Get one recipe in full: ingredients with macros, servings, and the method.',
    parameters: strictObject({ recipeId: { type: 'string', minLength: 1 } }),
  },
  {
    type: 'function', name: 'create_recipe', strict: true,
    description: 'Save a new recipe for the user. Give every ingredient its macros for the WHOLE recipe, not per serving, and set servings to how many portions it makes. Tell the user it was saved and that they can edit it on the Recipes screen.',
    parameters: strictObject({
      name: { type: 'string', minLength: 1, maxLength: 160 },
      description: nullableString,
      instructions: nullableString,
      servings: { type: 'number', minimum: 0.25, maximum: 100 },
      ingredients: {
        type: 'array', minItems: 1, maxItems: 40,
        items: strictObject({
          name: { type: 'string', minLength: 1, maxLength: 160 },
          quantity: nullableNumber,
          unit: nullableString,
          calories: { type: 'number', minimum: 0 },
          proteinGrams: { type: 'number', minimum: 0 },
          carbohydrateGrams: { type: 'number', minimum: 0 },
          fatGrams: { type: 'number', minimum: 0 },
        }),
      },
    }),
  },
  {
    type: 'function', name: 'log_food', strict: true,
    description: 'Log a meal the user says they ate, itemised with macros. Use get_saved_foods or get_recipes first: if the user already has that food or recipe saved, log_saved_food or log_recipe carries their own numbers instead of your estimate. State what was logged so it can be corrected. Only log what the user actually reports eating.',
    parameters: strictObject({
      mealType: { type: 'string', enum: mealTypes },
      name: { type: 'string', minLength: 1, maxLength: 160 },
      loggedDate: { ...nullableString, description: 'YYYY-MM-DD. Null means today.' },
      items: { type: 'array', minItems: 1, maxItems: 20, items: loggedFoodItem },
    }),
  },
  {
    type: 'function', name: 'log_saved_food', strict: true,
    description: 'Log a serving of a food the user has already saved, using their stored macros rather than an estimate. Get the id from get_saved_foods.',
    parameters: strictObject({
      savedFoodId: { type: 'string', minLength: 1 },
      mealType: { type: 'string', enum: mealTypes },
      loggedDate: { ...nullableString, description: 'YYYY-MM-DD. Null means today.' },
    }),
  },
  {
    type: 'function', name: 'log_recipe', strict: true,
    description: 'Log servings of one of the user’s recipes, scaled from its ingredients. Get the id from get_recipes.',
    parameters: strictObject({
      recipeId: { type: 'string', minLength: 1 },
      mealType: { type: 'string', enum: mealTypes },
      servings: { type: 'number', minimum: 0.1, maximum: 20 },
      loggedDate: { ...nullableString, description: 'YYYY-MM-DD. Null means today.' },
    }),
  },
  {
    type: 'function', name: 'create_saved_food', strict: true,
    description: 'Save a food so it can be logged again in one tap, with the macros for one serving. Use after logging something the user eats regularly, or when they ask to save it. Saving does not log it; call log_saved_food as well if they also ate it now.',
    parameters: strictObject({
      name: { type: 'string', minLength: 1, maxLength: 160 },
      servingQuantity: nullableNumber,
      servingUnit: nullableString,
      servingGrams: nullableNumber,
      calories: { type: 'number', minimum: 0 },
      proteinGrams: { type: 'number', minimum: 0 },
      carbohydrateGrams: { type: 'number', minimum: 0 },
      fatGrams: { type: 'number', minimum: 0 },
      fiberGrams: nullableNumber,
    }),
  },
  {
    type: 'function', name: 'log_body_metric', strict: true,
    description: 'Record a body measurement the user reports. Weight drives their calorie targets and body composition, so log it when they state one. Values are metric: convert from pounds or inches before calling.',
    parameters: strictObject({
      weightKg: nullableNumber,
      waistCm: nullableNumber,
      bodyFatPercent: nullableNumber,
      notes: nullableString,
    }),
  },
  {
    type: 'function', name: 'manage_food_log', strict: true,
    description: 'Correct or remove a meal already logged. update changes its name or meal; set_item_count changes how many of a single-item entry, scaling its macros; update_item rewrites one item’s macros; delete removes the whole entry. Get ids from get_nutrition_summary.',
    parameters: strictObject({
      action: { type: 'string', enum: ['update', 'delete', 'set_item_count', 'update_item'] },
      foodLogId: nullableString,
      itemId: nullableString,
      name: nullableString,
      mealType: { type: ['string', 'null'], enum: ['breakfast', 'lunch', 'dinner', 'snacks', 'other', null] },
      count: nullableNumber,
      calories: nullableNumber,
      proteinGrams: nullableNumber,
      carbohydrateGrams: nullableNumber,
      fatGrams: nullableNumber,
    }),
  },
  {
    type: 'function', name: 'manage_saved_food', strict: true,
    description: 'Update or delete a saved food. Deleting leaves meals already logged from it untouched. Get ids from get_saved_foods.',
    parameters: strictObject({
      action: { type: 'string', enum: ['update', 'delete'] },
      savedFoodId: { type: 'string', minLength: 1 },
      name: nullableString,
      servingQuantity: nullableNumber,
      servingUnit: nullableString,
      servingGrams: nullableNumber,
      calories: nullableNumber,
      proteinGrams: nullableNumber,
      carbohydrateGrams: nullableNumber,
      fatGrams: nullableNumber,
    }),
  },
  {
    type: 'function', name: 'manage_recipe', strict: true,
    description: 'Update or delete a recipe. Updating ingredients replaces the whole list, so send every ingredient, not only the changed ones. Get ids from get_recipes.',
    parameters: strictObject({
      action: { type: 'string', enum: ['update', 'delete'] },
      recipeId: { type: 'string', minLength: 1 },
      name: nullableString,
      description: nullableString,
      instructions: nullableString,
      servings: nullableNumber,
      ingredients: {
        type: ['array', 'null'],
        maxItems: 40,
        items: strictObject({
          name: { type: 'string', minLength: 1, maxLength: 160 },
          quantity: nullableNumber,
          unit: nullableString,
          calories: { type: 'number', minimum: 0 },
          proteinGrams: { type: 'number', minimum: 0 },
          carbohydrateGrams: { type: 'number', minimum: 0 },
          fatGrams: { type: 'number', minimum: 0 },
        }),
      },
    }),
  },
  {
    type: 'function', name: 'manage_body_metric', strict: true,
    description: 'Update or delete a recorded measurement. Get ids from get_body_metrics.',
    parameters: strictObject({
      action: { type: 'string', enum: ['update', 'delete'] },
      metricId: { type: 'string', minLength: 1 },
      weightKg: nullableNumber,
      waistCm: nullableNumber,
      bodyFatPercent: nullableNumber,
      notes: nullableString,
    }),
  },
  {
    type: 'function', name: 'manage_gym', strict: true,
    description: 'Create, rename, delete a gym, or make one the default that new workouts are tagged with. Deleting leaves past sessions logged but no longer attributed. Get ids from get_gym_comparison.',
    parameters: strictObject({
      action: { type: 'string', enum: ['create', 'update', 'delete', 'set_default'] },
      gymId: nullableString,
      name: nullableString,
      notes: nullableString,
    }),
  },
  {
    type: 'function', name: 'update_profile', strict: true,
    description: 'Change the settings that drive the calorie and macro targets. Send only the fields being changed; the rest as null. Height and weights are metric. These feed the calorie and macro targets, which are recalculated in the app rather than here, so tell the user to tap Recalculate targets in Settings for the change to take effect.',
    parameters: strictObject({
      displayName: nullableString,
      heightCm: nullableNumber,
      targetWeightKg: nullableNumber,
      goalBodyFatMin: nullableNumber,
      goalBodyFatMax: nullableNumber,
      trainingDaysPerWeek: nullableNumber,
      preferredSessionMinutes: nullableNumber,
      dailyActivityLevel: { type: ['string', 'null'], enum: ['sedentary', 'light', 'moderate', 'very_active', null] },
      preferredUnits: { type: ['string', 'null'], enum: ['metric', 'imperial', null] },
    }),
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
    type: 'function', name: 'get_gym_comparison', strict: true,
    description: 'Compare logged performance per gym for one exercise, or across all exercises. Weights can differ between gyms through plate calibration and machine brands, so use this before reading a load change as progress or regression.',
    parameters: strictObject({ exerciseKey: nullableString, limit: { type: 'integer', minimum: 1, maximum: 50 } }),
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
  get_body_composition: z.object({ weeks: z.number().int().min(1).max(26) }).strict(),
  get_nutrition_targets: z.object({}).strict(),
  get_saved_foods: z.object({ limit: z.number().int().min(1).max(100) }).strict(),
  get_recipes: z.object({ limit: z.number().int().min(1).max(50) }).strict(),
  get_recipe: z.object({ recipeId: z.string().min(1) }).strict(),
  create_recipe: z.object({
    name: z.string().trim().min(1).max(160),
    description: nullableText,
    instructions: nullableText,
    servings: z.number().min(0.25).max(100),
    ingredients: z.array(z.object({
      name: z.string().trim().min(1).max(160),
      quantity: z.number().min(0).nullable(),
      unit: nullableText,
      calories: z.number().min(0),
      proteinGrams: z.number().min(0),
      carbohydrateGrams: z.number().min(0),
      fatGrams: z.number().min(0),
    }).strict()).min(1).max(40),
  }).strict(),
  log_food: z.object({
    mealType: z.enum(mealTypes),
    name: z.string().trim().min(1).max(160),
    loggedDate: isoDate,
    items: z.array(z.object({
      name: z.string().trim().min(1).max(160),
      quantity: z.number().min(0).nullable(),
      unit: nullableText,
      grams: z.number().min(0).nullable(),
      calories: z.number().min(0),
      proteinGrams: z.number().min(0),
      carbohydrateGrams: z.number().min(0),
      fatGrams: z.number().min(0),
      fiberGrams: z.number().min(0).nullable(),
    }).strict()).min(1).max(20),
  }).strict(),
  log_saved_food: z.object({
    savedFoodId: z.string().min(1),
    mealType: z.enum(mealTypes),
    loggedDate: isoDate,
  }).strict(),
  log_recipe: z.object({
    recipeId: z.string().min(1),
    mealType: z.enum(mealTypes),
    servings: z.number().min(0.1).max(20),
    loggedDate: isoDate,
  }).strict(),
  get_gym_comparison: z.object({
    exerciseKey: nullableText,
    limit: z.number().int().min(1).max(50),
  }).strict(),
  create_saved_food: z.object({
    name: z.string().trim().min(1).max(160),
    servingQuantity: z.number().min(0).nullable(),
    servingUnit: nullableText,
    servingGrams: z.number().min(0).nullable(),
    calories: z.number().min(0),
    proteinGrams: z.number().min(0),
    carbohydrateGrams: z.number().min(0),
    fatGrams: z.number().min(0),
    fiberGrams: z.number().min(0).nullable(),
  }).strict(),
  log_body_metric: z.object({
    weightKg: z.number().min(20).max(500).nullable(),
    waistCm: z.number().min(30).max(300).nullable(),
    bodyFatPercent: z.number().min(1).max(75).nullable(),
    notes: nullableText,
  }).strict(),
  manage_food_log: z.object({
    action: z.enum(['update', 'delete', 'set_item_count', 'update_item']),
    foodLogId: z.string().min(1).nullable(),
    itemId: z.string().min(1).nullable(),
    name: nullableText,
    mealType: z.enum(mealTypes).nullable(),
    count: z.number().min(0.01).max(999).nullable(),
    calories: z.number().min(0).nullable(),
    proteinGrams: z.number().min(0).nullable(),
    carbohydrateGrams: z.number().min(0).nullable(),
    fatGrams: z.number().min(0).nullable(),
  }).strict(),
  manage_saved_food: z.object({
    action: z.enum(['update', 'delete']),
    savedFoodId: z.string().min(1),
    name: nullableText,
    servingQuantity: z.number().min(0).nullable(),
    servingUnit: nullableText,
    servingGrams: z.number().min(0).nullable(),
    calories: z.number().min(0).nullable(),
    proteinGrams: z.number().min(0).nullable(),
    carbohydrateGrams: z.number().min(0).nullable(),
    fatGrams: z.number().min(0).nullable(),
  }).strict(),
  manage_recipe: z.object({
    action: z.enum(['update', 'delete']),
    recipeId: z.string().min(1),
    name: nullableText,
    description: nullableText,
    instructions: nullableText,
    servings: z.number().min(0.25).max(100).nullable(),
    ingredients: z.array(z.object({
      name: z.string().trim().min(1).max(160),
      quantity: z.number().min(0).nullable(),
      unit: nullableText,
      calories: z.number().min(0),
      proteinGrams: z.number().min(0),
      carbohydrateGrams: z.number().min(0),
      fatGrams: z.number().min(0),
    }).strict()).max(40).nullable(),
  }).strict(),
  manage_body_metric: z.object({
    action: z.enum(['update', 'delete']),
    metricId: z.string().min(1),
    weightKg: z.number().min(20).max(500).nullable(),
    waistCm: z.number().min(30).max(300).nullable(),
    bodyFatPercent: z.number().min(1).max(75).nullable(),
    notes: nullableText,
  }).strict(),
  manage_gym: z.object({
    action: z.enum(['create', 'update', 'delete', 'set_default']),
    gymId: z.string().min(1).nullable(),
    name: nullableText,
    notes: nullableText,
  }).strict(),
  update_profile: z.object({
    displayName: nullableText,
    heightCm: z.number().min(80).max(260).nullable(),
    targetWeightKg: z.number().min(20).max(500).nullable(),
    goalBodyFatMin: z.number().min(2).max(75).nullable(),
    goalBodyFatMax: z.number().min(2).max(75).nullable(),
    trainingDaysPerWeek: z.number().int().min(0).max(7).nullable(),
    preferredSessionMinutes: z.number().int().min(15).max(240).nullable(),
    dailyActivityLevel: z.enum(['sedentary', 'light', 'moderate', 'very_active']).nullable(),
    preferredUnits: z.enum(['metric', 'imperial']).nullable(),
  }).strict(),
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

/** Whole years completed, matching how the app derives age from a birth date. */
function ageInYears(birthDate: string, today = new Date()) {
  const born = new Date(`${birthDate}T00:00:00`);
  let age = today.getFullYear() - born.getFullYear();
  const monthDelta = today.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < born.getDate())) age -= 1;
  return age;
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

export async function executeCoachTool(client: SupabaseClient, userId: string, name: string, args: any, today?: string) {
  // Falls back to the server date only when the client did not state its own.
  const callerToday = today ?? new Date().toISOString().slice(0, 10);
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
    case 'get_body_composition': {
      const since = daysAgo(args.weeks * 7);
      const [profile, metrics] = await Promise.all([
        client.from('profiles').select('height_cm,birth_date,biological_sex,goal_body_fat_min,goal_body_fat_max').eq('id', userId).maybeSingle(),
        client.from('body_metrics').select('measured_at,weight_kg,waist_cm,body_fat_percent')
          .eq('user_id', userId).gte('measured_at', since).order('measured_at', { ascending: false }),
      ]);
      const person = dataOrThrow(profile);
      const rows = dataOrThrow(metrics) ?? [];
      const heightCm = person?.height_cm === null || person?.height_cm === undefined ? null : Number(person.height_cm);
      const age = person?.birth_date ? ageInYears(person.birth_date) : null;
      if (!heightCm) {
        return { available: false, reason: 'No height on file, so BMI and body fat cannot be derived.' };
      }

      // Average per calendar week, each field independently, mirroring the app.
      const buckets = new Map<string, { weightKg: number[]; waistCm: number[]; bodyFat: number[] }>();
      for (const row of rows) {
        const key = weekStartKey(row.measured_at);
        const bucket = buckets.get(key) ?? { weightKg: [], waistCm: [], bodyFat: [] };
        if (row.weight_kg !== null) bucket.weightKg.push(Number(row.weight_kg));
        if (row.waist_cm !== null) bucket.waistCm.push(Number(row.waist_cm));
        if (row.body_fat_percent !== null) bucket.bodyFat.push(Number(row.body_fat_percent));
        buckets.set(key, bucket);
      }
      const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      const weeks = [...buckets.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStart, bucket]) => {
          const weightKg = mean(bucket.weightKg);
          const waistCm = mean(bucket.waistCm);
          const fat = estimateBodyFat({
            weightKg: weightKg ?? 0,
            heightCm,
            waistCm,
            age,
            biologicalSex: person?.biological_sex ?? null,
            measuredBodyFatPercent: mean(bucket.bodyFat),
          });
          return {
            weekStart,
            weightKg,
            waistCm,
            bmi: weightKg === null ? null : bodyMassIndex(weightKg, heightCm),
            bodyFatPercent: fat?.percent ?? null,
            bodyFatMethod: fat?.method ?? null,
            leanMassKg: fat?.leanMassKg ?? null,
            fatMassKg: fat?.fatMassKg ?? null,
          };
        });

      return {
        available: weeks.length > 0,
        current: weeks[weeks.length - 1] ?? null,
        previous: weeks.length > 1 ? weeks[weeks.length - 2] : null,
        weeklyHistory: weeks,
        age,
        healthyBmi: HEALTHY_BMI,
        healthyWeightRangeKg: healthyWeightRangeKg(heightCm),
        healthyBodyFatRange: healthyBodyFatRange(age, person?.biological_sex ?? null),
        goalBodyFat: person?.goal_body_fat_min === null || person?.goal_body_fat_max === null || person?.goal_body_fat_min === undefined
          ? null
          : { min: Number(person.goal_body_fat_min), max: Number(person.goal_body_fat_max) },
        note: 'Body fat from a tape measurement carries roughly 5 points of error against a DXA scan. Discuss direction over weeks, not single readings.',
      };
    }
    case 'get_nutrition_targets': {
      const [profile, goal, target] = await Promise.all([
        client.from('profiles').select('height_cm,birth_date,biological_sex,training_days_per_week,preferred_session_minutes,daily_activity_level,target_weight_kg,goal_body_fat_min,goal_body_fat_max,preferred_units').eq('id', userId).maybeSingle(),
        client.from('fitness_goals').select('goal_type').eq('user_id', userId).eq('is_active', true).maybeSingle(),
        client.from('nutrition_targets').select('*').eq('user_id', userId).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        storedTarget: dataOrThrow(target),
        goalType: dataOrThrow(goal)?.goal_type ?? null,
        inputs: dataOrThrow(profile),
        howItIsDerived: [
          'BMR uses Mifflin-St Jeor: 10*kg + 6.25*cm - 5*age + 5 for men, -161 for women.',
          'Maintenance is BMR * a lifestyle multiplier (sedentary 1.2, light 1.375, moderate 1.55, very active 1.725) PLUS training burn. Training is costed separately at 4 net METs, so kg * hours * 4, averaged over the week. Training frequency does not raise the lifestyle multiplier.',
          'The goal then shifts maintenance: fat loss -20%, recomp -5%, maintenance 0, strength +5%, muscle gain +10%.',
          'That shift eases off near a goal weight or inside a goal body-fat band, and stops entirely once inside the band.',
          'Protein is set per kg of bodyweight by goal, fat takes 25% of calories with a 0.6 g/kg floor, and carbohydrates take the remainder, so the macros always sum to the calorie target.',
          'With at least 14 days of weigh-ins and 10 logged days of intake, measured maintenance replaces the formula, clamped to within 20% of it.',
        ],
      };
    }
    case 'get_saved_foods': {
      const foods = dataOrThrow(await client.from('saved_foods')
        .select('name,serving_quantity,serving_unit,serving_grams,calories,protein_grams,carbohydrate_grams,fat_grams,fiber_grams,last_logged_at')
        .eq('user_id', userId)
        .order('last_logged_at', { ascending: false, nullsFirst: false })
        .limit(args.limit));
      return { foods };
    }
    case 'get_recipes': {
      const recipes = dataOrThrow(await client.from('recipes')
        .select('id,name,description,servings,updated_at,recipe_ingredients(name,calories,protein_grams,carbohydrate_grams,fat_grams)')
        .eq('user_id', userId).order('updated_at', { ascending: false }).limit(args.limit)) ?? [];
      return {
        recipes: recipes.map((recipe: any) => {
          const servings = Number(recipe.servings) || 1;
          const sum = (key: string) => recipe.recipe_ingredients.reduce((total: number, item: any) => total + Number(item[key] ?? 0), 0);
          return {
            id: recipe.id,
            name: recipe.name,
            description: recipe.description,
            servings,
            ingredientCount: recipe.recipe_ingredients.length,
            // Per serving, matching what the Recipes screen shows.
            perServing: {
              calories: Math.round(sum('calories') / servings),
              proteinGrams: Math.round(sum('protein_grams') / servings),
              carbohydrateGrams: Math.round(sum('carbohydrate_grams') / servings),
              fatGrams: Math.round(sum('fat_grams') / servings),
            },
          };
        }),
      };
    }
    case 'get_recipe': {
      const recipe = dataOrThrow(await client.from('recipes')
        .select('*, recipe_ingredients(*)')
        .eq('id', args.recipeId).eq('user_id', userId).maybeSingle());
      if (!recipe) throw new Error('Recipe was not found');
      return { recipe };
    }
    case 'log_food': {
      const loggedDate = args.loggedDate ?? callerToday;
      const { data: log, error } = await client.from('food_logs').insert({
        user_id: userId,
        logged_date: loggedDate,
        meal_type: args.mealType,
        name: args.name.trim(),
        source: 'quick_add',
      }).select('id').single();
      if (error) throw error;

      const { error: itemError } = await client.from('food_log_items').insert(
        args.items.map((item: any) => ({
          food_log_id: log.id,
          name: item.name.trim(),
          quantity: item.quantity,
          unit: item.unit,
          grams: item.grams,
          calories: item.calories,
          protein_grams: item.proteinGrams,
          carbohydrate_grams: item.carbohydrateGrams,
          fat_grams: item.fatGrams,
          fiber_grams: item.fiberGrams,
        })),
      );
      if (itemError) {
        // A log with no items contributes nothing but still shows as a meal, so it is
        // removed rather than left behind.
        await client.from('food_logs').delete().eq('id', log.id);
        throw itemError;
      }

      const totals = args.items.reduce((sum: any, item: any) => ({
        calories: sum.calories + item.calories,
        proteinGrams: sum.proteinGrams + item.proteinGrams,
        carbohydrateGrams: sum.carbohydrateGrams + item.carbohydrateGrams,
        fatGrams: sum.fatGrams + item.fatGrams,
      }), { calories: 0, proteinGrams: 0, carbohydrateGrams: 0, fatGrams: 0 });
      return { ok: true, foodLogId: log.id, loggedDate, mealType: args.mealType, name: args.name, totals };
    }
    case 'log_saved_food': {
      const loggedDate = args.loggedDate ?? callerToday;
      const { data, error } = await client.rpc('log_saved_food', {
        target_saved_food_id: args.savedFoodId,
        target_logged_date: loggedDate,
        target_meal_type: args.mealType,
      });
      if (error) throw error;
      return { ok: true, loggedDate, mealType: args.mealType, log: data };
    }
    case 'log_recipe': {
      const loggedDate = args.loggedDate ?? callerToday;
      const { data, error } = await client.rpc('log_recipe', {
        target_recipe_id: args.recipeId,
        target_logged_date: loggedDate,
        target_meal_type: args.mealType,
        target_servings: args.servings,
      });
      if (error) throw error;
      return { ok: true, loggedDate, mealType: args.mealType, servings: args.servings, log: data };
    }
    case 'create_saved_food': {
      const { data, error } = await client.from('saved_foods').insert({
        user_id: userId,
        name: args.name.trim(),
        serving_quantity: args.servingQuantity,
        serving_unit: args.servingUnit,
        serving_grams: args.servingGrams,
        calories: args.calories,
        protein_grams: args.proteinGrams,
        carbohydrate_grams: args.carbohydrateGrams,
        fat_grams: args.fatGrams,
        fiber_grams: args.fiberGrams,
      }).select('id,name').single();
      if (error) throw error;
      return { ok: true, savedFoodId: data.id, name: data.name };
    }
    case 'log_body_metric': {
      if (args.weightKg === null && args.waistCm === null && args.bodyFatPercent === null) {
        throw new Error('Give at least one measurement to record');
      }
      const { data, error } = await client.from('body_metrics').insert({
        user_id: userId,
        measured_at: new Date().toISOString(),
        weight_kg: args.weightKg,
        waist_cm: args.waistCm,
        body_fat_percent: args.bodyFatPercent,
        notes: args.notes,
      }).select('id,measured_at,weight_kg,waist_cm,body_fat_percent').single();
      if (error) throw error;
      return { ok: true, metric: data };
    }
    case 'manage_food_log': {
      if (args.action === 'delete') {
        if (!args.foodLogId) throw new Error('foodLogId is required to delete a meal');
        const { error } = await client.from('food_logs').delete().eq('id', args.foodLogId);
        if (error) throw error;
        return { ok: true, deleted: args.foodLogId };
      }
      if (args.action === 'update') {
        if (!args.foodLogId) throw new Error('foodLogId is required');
        // Only the stated fields move; the rest keep whatever the user already had.
        const patch: Record<string, unknown> = {};
        if (args.name !== null) patch.name = args.name.trim();
        if (args.mealType !== null) patch.meal_type = args.mealType;
        if (!Object.keys(patch).length) throw new Error('Give a name or meal to change');
        const { error } = await client.from('food_logs').update(patch).eq('id', args.foodLogId);
        if (error) throw error;
        return { ok: true, foodLogId: args.foodLogId, changed: Object.keys(patch) };
      }
      if (args.action === 'set_item_count') {
        if (!args.itemId || args.count === null) throw new Error('itemId and count are required');
        // Goes through the RPC so the macros scale with the count in one statement.
        const { data, error } = await client.rpc('set_food_log_item_quantity', {
          target_item_id: args.itemId, target_quantity: args.count,
        });
        if (error) throw error;
        return { ok: true, item: data };
      }
      if (!args.itemId) throw new Error('itemId is required');
      const itemPatch: Record<string, unknown> = {};
      if (args.name !== null) itemPatch.name = args.name.trim();
      if (args.calories !== null) itemPatch.calories = args.calories;
      if (args.proteinGrams !== null) itemPatch.protein_grams = args.proteinGrams;
      if (args.carbohydrateGrams !== null) itemPatch.carbohydrate_grams = args.carbohydrateGrams;
      if (args.fatGrams !== null) itemPatch.fat_grams = args.fatGrams;
      if (!Object.keys(itemPatch).length) throw new Error('Give at least one field to change');
      const { error: itemError } = await client.from('food_log_items').update(itemPatch).eq('id', args.itemId);
      if (itemError) throw itemError;
      return { ok: true, itemId: args.itemId, changed: Object.keys(itemPatch) };
    }
    case 'manage_saved_food': {
      if (args.action === 'delete') {
        const { error } = await client.from('saved_foods').delete().eq('id', args.savedFoodId);
        if (error) throw error;
        return { ok: true, deleted: args.savedFoodId };
      }
      const patch: Record<string, unknown> = {};
      if (args.name !== null) patch.name = args.name.trim();
      if (args.servingQuantity !== null) patch.serving_quantity = args.servingQuantity;
      if (args.servingUnit !== null) patch.serving_unit = args.servingUnit;
      if (args.servingGrams !== null) patch.serving_grams = args.servingGrams;
      if (args.calories !== null) patch.calories = args.calories;
      if (args.proteinGrams !== null) patch.protein_grams = args.proteinGrams;
      if (args.carbohydrateGrams !== null) patch.carbohydrate_grams = args.carbohydrateGrams;
      if (args.fatGrams !== null) patch.fat_grams = args.fatGrams;
      if (!Object.keys(patch).length) throw new Error('Give at least one field to change');
      const { error } = await client.from('saved_foods').update(patch).eq('id', args.savedFoodId);
      if (error) throw error;
      return { ok: true, savedFoodId: args.savedFoodId, changed: Object.keys(patch) };
    }
    case 'manage_recipe': {
      if (args.action === 'delete') {
        const { error } = await client.from('recipes').delete().eq('id', args.recipeId);
        if (error) throw error;
        return { ok: true, deleted: args.recipeId };
      }
      const patch: Record<string, unknown> = {};
      if (args.name !== null) patch.name = args.name.trim();
      if (args.description !== null) patch.description = args.description;
      if (args.instructions !== null) patch.instructions = args.instructions;
      if (args.servings !== null) patch.servings = args.servings;
      if (Object.keys(patch).length) {
        const { error } = await client.from('recipes').update(patch).eq('id', args.recipeId);
        if (error) throw error;
      }
      if (args.ingredients !== null) {
        // Replaced wholesale, matching the editor: a partial list would silently drop
        // whatever was left out.
        const { error: clearError } = await client.from('recipe_ingredients').delete().eq('recipe_id', args.recipeId);
        if (clearError) throw clearError;
        if (args.ingredients.length) {
          const { error } = await client.from('recipe_ingredients').insert(
            args.ingredients.map((item: any, index: number) => ({
              recipe_id: args.recipeId,
              name: item.name.trim(),
              quantity: item.quantity,
              unit: item.unit,
              calories: item.calories,
              protein_grams: item.proteinGrams,
              carbohydrate_grams: item.carbohydrateGrams,
              fat_grams: item.fatGrams,
              position: index,
            })),
          );
          if (error) throw error;
        }
      }
      return { ok: true, recipeId: args.recipeId, replacedIngredients: args.ingredients !== null };
    }
    case 'manage_body_metric': {
      if (args.action === 'delete') {
        const { error } = await client.from('body_metrics').delete().eq('id', args.metricId);
        if (error) throw error;
        return { ok: true, deleted: args.metricId };
      }
      const patch: Record<string, unknown> = {};
      if (args.weightKg !== null) patch.weight_kg = args.weightKg;
      if (args.waistCm !== null) patch.waist_cm = args.waistCm;
      if (args.bodyFatPercent !== null) patch.body_fat_percent = args.bodyFatPercent;
      if (args.notes !== null) patch.notes = args.notes;
      if (!Object.keys(patch).length) throw new Error('Give at least one measurement to change');
      const { error } = await client.from('body_metrics').update(patch).eq('id', args.metricId);
      if (error) throw error;
      return { ok: true, metricId: args.metricId, changed: Object.keys(patch) };
    }
    case 'manage_gym': {
      if (args.action === 'create') {
        if (!args.name) throw new Error('name is required to create a gym');
        const { count } = await client.from('gyms').select('id', { count: 'exact', head: true });
        const isDefault = (count ?? 0) === 0;
        const { data, error } = await client.from('gyms')
          .insert({ user_id: userId, name: args.name.trim(), notes: args.notes, is_default: isDefault })
          .select('id,name,is_default').single();
        if (error) throw error;
        return { ok: true, gym: data };
      }
      if (!args.gymId) throw new Error('gymId is required');
      if (args.action === 'delete') {
        const { error } = await client.from('gyms').delete().eq('id', args.gymId);
        if (error) throw error;
        return { ok: true, deleted: args.gymId };
      }
      if (args.action === 'set_default') {
        // Cleared first: a partial unique index allows only one default per user.
        const { error: clearError } = await client.from('gyms').update({ is_default: false }).eq('is_default', true);
        if (clearError) throw clearError;
        const { error } = await client.from('gyms').update({ is_default: true }).eq('id', args.gymId);
        if (error) throw error;
        return { ok: true, defaultGymId: args.gymId };
      }
      const patch: Record<string, unknown> = {};
      if (args.name !== null) patch.name = args.name.trim();
      if (args.notes !== null) patch.notes = args.notes;
      if (!Object.keys(patch).length) throw new Error('Give a name or notes to change');
      const { error } = await client.from('gyms').update(patch).eq('id', args.gymId);
      if (error) throw error;
      return { ok: true, gymId: args.gymId, changed: Object.keys(patch) };
    }
    case 'update_profile': {
      const patch: Record<string, unknown> = {};
      if (args.displayName !== null) patch.display_name = args.displayName.trim();
      if (args.heightCm !== null) patch.height_cm = args.heightCm;
      if (args.targetWeightKg !== null) patch.target_weight_kg = args.targetWeightKg;
      if (args.goalBodyFatMin !== null) patch.goal_body_fat_min = args.goalBodyFatMin;
      if (args.goalBodyFatMax !== null) patch.goal_body_fat_max = args.goalBodyFatMax;
      if (args.trainingDaysPerWeek !== null) patch.training_days_per_week = args.trainingDaysPerWeek;
      if (args.preferredSessionMinutes !== null) patch.preferred_session_minutes = args.preferredSessionMinutes;
      if (args.dailyActivityLevel !== null) patch.daily_activity_level = args.dailyActivityLevel;
      if (args.preferredUnits !== null) patch.preferred_units = args.preferredUnits;
      if (!Object.keys(patch).length) throw new Error('Give at least one setting to change');
      if (patch.goal_body_fat_min !== undefined && patch.goal_body_fat_max !== undefined
        && Number(patch.goal_body_fat_min) > Number(patch.goal_body_fat_max)) {
        throw new Error('The goal body fat minimum cannot exceed the maximum');
      }
      const { error } = await client.from('profiles').update(patch).eq('id', userId);
      if (error) throw error;
      // The target maths lives in the app, so a changed input leaves the stored target
      // stale until it is recalculated there. Flagged so Coach says so.
      const affectsTargets = ['height_cm', 'target_weight_kg', 'training_days_per_week',
        'preferred_session_minutes', 'daily_activity_level'].some((key) => key in patch);
      return { ok: true, changed: Object.keys(patch), targetsNeedRecalculating: affectsTargets };
    }
    case 'create_recipe': {
      const { data: created, error } = await client.from('recipes').insert({
        user_id: userId,
        name: args.name.trim(),
        description: args.description,
        instructions: args.instructions,
        servings: args.servings,
        source: 'coach',
      }).select('id').single();
      if (error) throw error;
      const { error: ingredientError } = await client.from('recipe_ingredients').insert(
        args.ingredients.map((item: any, index: number) => ({
          recipe_id: created.id,
          name: item.name.trim(),
          quantity: item.quantity,
          unit: item.unit,
          calories: item.calories,
          protein_grams: item.proteinGrams,
          carbohydrate_grams: item.carbohydrateGrams,
          fat_grams: item.fatGrams,
          position: index,
        })),
      );
      if (ingredientError) {
        // A recipe without ingredients has no macros, so it is worse than none at all.
        await client.from('recipes').delete().eq('id', created.id);
        throw ingredientError;
      }
      return { ok: true, recipeId: created.id, name: args.name, servings: args.servings, ingredientCount: args.ingredients.length };
    }
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
    case 'get_gym_comparison': {
      let query = client.from('gym_exercise_performance').select('*').order('last_logged_at', { ascending: false });
      if (args.exerciseKey) query = query.eq('exercise_key', args.exerciseKey);
      const { data, error } = await query.limit(Math.min(args.limit ?? 20, 50));
      if (error) throw error;
      return { comparison: data ?? [] };
    }
    case 'create_routine_draft':
      return createRoutineDraft(client, userId, args);
    default:
      throw new Error(`Unsupported tool: ${name}`);
  }
}

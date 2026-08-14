import { performance } from 'node:perf_hooks';

import type { CatalogExercise } from '../supabase/functions/import-workout-file/matching';
import {
  assignStableImportKeys,
  createCandidateSets,
  type WorkoutExtraction,
} from '../supabase/functions/import-workout-file/review';

const equipment = ['barbell', 'dumbbell', 'cable', 'machine', 'band', 'bodyweight'];
const movements = [
  'bench press',
  'incline press',
  'seated row',
  'lateral raise',
  'pulldown',
  'triceps extension',
  'biceps curl',
  'squat',
  'romanian deadlift',
  'leg curl',
  'calf raise',
  'chest fly',
  'rear delt fly',
  'shoulder press',
  'hip thrust',
];
const targets = ['chest', 'back', 'shoulders', 'quadriceps', 'hamstrings', 'glutes', 'arms'];

const catalog: CatalogExercise[] = Array.from({ length: 1_324 }, (_, index) => {
  const movement = movements[index % movements.length];
  const itemEquipment = equipment[Math.floor(index / movements.length) % equipment.length];
  const target = targets[Math.floor(index / (movements.length * equipment.length)) % targets.length];
  return {
    id: `catalog-${String(index).padStart(4, '0')}`,
    name: `${itemEquipment} ${movement} variation ${index + 1}`,
    equipment: itemEquipment,
    target,
    body_part: target,
    muscle_group: target,
    secondary_muscles: ['core', 'stabilizers'],
  };
});

const extractedExerciseCount = Math.max(1, Number.parseInt(process.argv[3] ?? '40', 10) || 40);

const extraction: WorkoutExtraction = {
  routineName: 'Benchmark routine',
  description: null,
  warnings: [],
  days: [{
    dayKey: 'day',
    name: 'Benchmark day',
    notes: null,
    isRestDay: false,
    exercises: Array.from({ length: extractedExerciseCount }, (_, index) => {
      const movement = movements[index % movements.length];
      const itemEquipment = equipment[index % equipment.length];
      const target = targets[index % targets.length];
      return {
        exerciseKey: `source-${index}`,
        sourceTitle: `${itemEquipment} ${movement}`,
        sourceDetails: `${target} exercise using ${itemEquipment} with a controlled range of motion`,
        pageNumber: null,
        imageCrop: null,
        customExercise: {
          category: 'strength',
          bodyPart: target,
          equipment: itemEquipment,
          target,
          muscleGroup: target,
          secondaryMuscles: [],
          instructions: null,
          instructionSteps: [],
        },
        targetSets: 3,
        repMin: 8,
        repMax: 12,
        restSeconds: 90,
        targetRpe: null,
        targetRir: 2,
        notes: null,
      };
    }),
  }],
};

const stableExtraction = assignStableImportKeys(extraction);
const runs = Math.max(1, Number.parseInt(process.argv[2] ?? '5', 10) || 5);
const durations: number[] = [];
let candidateCount = 0;

for (let run = 0; run < runs; run += 1) {
  const startedAt = performance.now();
  const candidateSets = createCandidateSets(stableExtraction, catalog);
  durations.push(performance.now() - startedAt);
  candidateCount = candidateSets.reduce((total, set) => total + set.candidates.length, 0);
}

const sorted = [...durations].sort((left, right) => left - right);
console.log(JSON.stringify({
  catalogExercises: catalog.length,
  extractedExercises: stableExtraction.days[0].exercises.length,
  shortlistedCandidates: candidateCount,
  runsMs: durations.map((duration) => Number(duration.toFixed(2))),
  medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
}, null, 2));

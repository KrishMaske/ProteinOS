export type VolumeSet = { weightKg: number | null; reps: number | null; completed: boolean; type?: 'warmup' | 'working' | 'failure' | 'drop' };
export function calculateWorkoutVolume(sets: VolumeSet[]) { return sets.reduce((total, set) => total + (set.completed && set.weightKg && set.reps ? set.weightKg * set.reps : 0), 0); }
export function countWorkingSets(sets: VolumeSet[]) { return sets.filter((set) => set.completed && set.type !== 'warmup').length; }
export function estimatedOneRepMax(weightKg: number, reps: number) { return reps <= 0 ? 0 : weightKg * (1 + reps / 30); }

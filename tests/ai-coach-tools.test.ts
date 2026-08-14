import { describe, expect, it, vi } from 'vitest';

import { executeCoachTool, validateToolArguments } from '../supabase/functions/ai-coach/tools';

describe('custom exercise read tools', () => {
  it('returns catalog and user-owned custom exercise identities in training history', async () => {
    const sessions = [{
      id: 'session-id',
      workout_session_exercises: [
        {
          exercise_id: 'catalog-id',
          custom_exercise_id: null,
          exercise_catalog: { name: 'Bench press' },
          custom_exercises: null,
          workout_sets: [],
        },
        {
          exercise_id: null,
          custom_exercise_id: '11111111-1111-4111-8111-111111111111',
          exercise_catalog: null,
          custom_exercises: { name: 'Cable press variation' },
          workout_sets: [],
        },
      ],
    }];
    const limit = vi.fn(async () => ({ data: sessions, error: null }));
    const order = vi.fn(() => ({ limit }));
    const statusEq = vi.fn(() => ({ order }));
    const userEq = vi.fn(() => ({ eq: statusEq }));
    const select = vi.fn(() => ({ eq: userEq }));
    const client = { from: vi.fn(() => ({ select })) };

    const result = await executeCoachTool(client, 'user-id', 'get_training_history', { limit: 6 });

    expect(select).toHaveBeenCalledWith(expect.stringContaining('custom_exercises(name,body_part,target,equipment)'));
    expect(userEq).toHaveBeenCalledWith('user_id', 'user-id');
    expect(result[0].workout_session_exercises).toEqual([
      expect.objectContaining({ exercise_key: 'catalog:catalog-id', exercise_name: 'Bench press' }),
      expect.objectContaining({ exercise_key: 'custom:11111111-1111-4111-8111-111111111111', exercise_name: 'Cable press variation' }),
    ]);
  });

  it('returns custom exercise identity in an active routine without dropping nested details', async () => {
    const routine = {
      id: 'routine-id',
      routine_days: [{
        id: 'day-id',
        routine_exercises: [{
          exercise_id: null,
          custom_exercise_id: '22222222-2222-4222-8222-222222222222',
          exercise_catalog: null,
          custom_exercises: { name: 'My pulldown', target: 'lats' },
        }],
      }],
    };
    const maybeSingle = vi.fn(async () => ({ data: routine, error: null }));
    const statusEq = vi.fn(() => ({ maybeSingle }));
    const userEq = vi.fn(() => ({ eq: statusEq }));
    const select = vi.fn(() => ({ eq: userEq }));
    const client = { from: vi.fn(() => ({ select })) };

    const result = await executeCoachTool(client, 'user-id', 'get_active_routine', { includeExercises: true });

    expect(select).toHaveBeenCalledWith(expect.stringContaining('custom_exercises(name,body_part,target,equipment)'));
    expect(userEq).toHaveBeenCalledWith('user_id', 'user-id');
    expect(result.routine_days[0].routine_exercises[0]).toEqual(expect.objectContaining({
      exercise_key: 'custom:22222222-2222-4222-8222-222222222222',
      exercise_name: 'My pulldown',
      custom_exercises: { name: 'My pulldown', target: 'lats' },
    }));
  });

  it('reads custom exercise history through its unified key and scopes it to the user', async () => {
    const rows = [{
      exercise_key: 'custom:33333333-3333-4333-8333-333333333333',
      custom_exercise_id: '33333333-3333-4333-8333-333333333333',
      exercise_name: 'My row',
      reps: 10,
    }];
    const limit = vi.fn(async () => ({ data: rows, error: null }));
    const order = vi.fn(() => ({ limit }));
    const keyEq = vi.fn(() => ({ order }));
    const userEq = vi.fn(() => ({ eq: keyEq }));
    const select = vi.fn(() => ({ eq: userEq }));
    const client = { from: vi.fn(() => ({ select })) };
    const exerciseKey = 'custom:33333333-3333-4333-8333-333333333333';

    const result = await executeCoachTool(client, 'user-id', 'get_exercise_history', { exerciseKey, limit: 12 });

    expect(client.from).toHaveBeenCalledWith('exercise_history');
    expect(select).toHaveBeenCalledWith(expect.stringContaining('exercise_name'));
    expect(userEq).toHaveBeenCalledWith('user_id', 'user-id');
    expect(keyEq).toHaveBeenCalledWith('exercise_key', exerciseKey);
    expect(result).toEqual(rows);
    expect(validateToolArguments('get_exercise_history', { exerciseKey, limit: 12 })).toEqual({ exerciseKey, limit: 12 });
    expect(() => validateToolArguments('get_exercise_history', { exerciseKey: '33333333-3333-4333-8333-333333333333', limit: 12 })).toThrow();
  });

  it('keeps exercise details restricted to the trusted catalog contract', async () => {
    const inIds = vi.fn(async () => ({ data: [{ id: 'catalog-id', name: 'Bench press' }], error: null }));
    const select = vi.fn(() => ({ in: inIds }));
    const client = { from: vi.fn(() => ({ select })) };

    await executeCoachTool(client, 'user-id', 'get_exercise_details', { exerciseIds: ['catalog-id'] });

    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith('exercise_catalog');
    expect(inIds).toHaveBeenCalledWith('id', ['catalog-id']);
  });
});

describe('create_routine_draft tool', () => {
  it('rejects unknown exercise IDs before writing a routine', async () => {
    const insert = vi.fn();
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'exercise_catalog') {
          return { select: () => ({ in: async () => ({ data: [{ id: 'known-id' }], error: null }) }) };
        }
        return { insert };
      }),
    };

    const result = await executeCoachTool(client, 'user-id', 'create_routine_draft', {
      name: 'Draft',
      description: null,
      days: [{
        name: 'Day 1',
        notes: null,
        exercises: [{ exerciseId: 'unknown-id', targetSets: 3, repMin: 8, repMax: 12, restSeconds: 90, targetRpe: 8, targetRir: 2, notes: null }],
      }],
    });

    expect(result).toEqual({ ok: false, error: 'unknown_exercise_ids', unknownExerciseIds: ['unknown-id'] });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('goal update proposal tool', () => {
  it('returns a confirmation proposal without writing data', async () => {
    const maybeSingle = vi.fn(async () => ({ data: { id: '11111111-1111-4111-8111-111111111111', goal_type: 'recomp', notes: null }, error: null }));
    const secondEq = vi.fn(() => ({ maybeSingle }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    const client = { from: vi.fn(() => ({ select })) };

    const result = await executeCoachTool(client, 'user-id', 'propose_goal_update', {
      goalType: 'muscle_gain',
      notes: 'Prioritize gradual mass gain',
    });

    expect(result).toEqual({
      ok: true,
      currentGoalId: '11111111-1111-4111-8111-111111111111',
      currentGoalType: 'recomp',
      proposedGoalType: 'muscle_gain',
      notes: 'Prioritize gradual mass gain',
      requiresConfirmation: true,
    });
    expect(client.from).toHaveBeenCalledWith('fitness_goals');
    expect(firstEq).toHaveBeenCalledWith('user_id', 'user-id');
  });

  it('rejects unsupported goal types before executing a tool', () => {
    expect(() => validateToolArguments('propose_goal_update', { goalType: 'extreme_cut', notes: null })).toThrow();
  });
});

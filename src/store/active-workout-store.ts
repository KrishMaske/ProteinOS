import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PendingSetDraft } from '@/features/workouts/services/set-draft';

type ActiveWorkoutState = {
  ownerUserId: string | null;
  workoutId: string | null;
  pendingSetEdits: Record<string, PendingSetDraft>;
  restTimerEndsAt: number | null;
  scopeToUser: (userId: string | null) => void;
  begin: (workoutId: string) => void;
  editSet: (setId: string, edit: PendingSetDraft) => void;
  clearSetEdit: (setId: string) => void;
  startRestTimer: (seconds: number) => void;
  clearRestTimer: () => void;
  clear: () => void;
};

export const useActiveWorkoutStore = create<ActiveWorkoutState>()(persist((set) => ({
  ownerUserId: null, workoutId: null, pendingSetEdits: {}, restTimerEndsAt: null,
  scopeToUser: (ownerUserId) => set((state) => state.ownerUserId === ownerUserId
    ? { ownerUserId }
    : { ownerUserId, workoutId: null, pendingSetEdits: {}, restTimerEndsAt: null }),
  begin: (workoutId) => set((state) => state.workoutId === workoutId
    ? { workoutId }
    : { workoutId, pendingSetEdits: {}, restTimerEndsAt: null }),
  editSet: (setId, edit) => set((state) => ({ pendingSetEdits: { ...state.pendingSetEdits, [setId]: { ...state.pendingSetEdits[setId], ...edit } } })),
  clearSetEdit: (setId) => set((state) => { const pendingSetEdits = { ...state.pendingSetEdits }; delete pendingSetEdits[setId]; return { pendingSetEdits }; }),
  startRestTimer: (seconds) => set({ restTimerEndsAt: seconds > 0 ? Date.now() + seconds * 1000 : null }),
  clearRestTimer: () => set({ restTimerEndsAt: null }),
  clear: () => set({ workoutId: null, pendingSetEdits: {}, restTimerEndsAt: null }),
}), {
  name: 'proteinos-active-workout',
  version: 1,
  storage: createJSONStorage(() => AsyncStorage),
  migrate: (persistedState, version) => version < 1
    ? { ownerUserId: null, workoutId: null, pendingSetEdits: {}, restTimerEndsAt: null }
    : persistedState as ActiveWorkoutState,
  partialize: (state) => ({ ownerUserId: state.ownerUserId, workoutId: state.workoutId, pendingSetEdits: state.pendingSetEdits, restTimerEndsAt: state.restTimerEndsAt }),
}));

import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppText, ErrorState, LoadingState, Screen } from '@/components/ui';
import { useStartWorkout } from '@/features/workouts/hooks/use-workout';
import { useAuth } from '@/providers/auth-provider';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
export default function StartWorkoutScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const { user } = useAuth();
  const start = useStartWorkout();
  const begin = useActiveWorkoutStore((state) => state.begin);
  const launched = useRef(false);

  const launch = useCallback(() => {
    if (!user || launched.current) return;
    launched.current = true;
    start.mutate({ dayId }, {
      onSuccess: (session) => {
        begin(session.id);
        router.replace({ pathname: '/workout/[id]', params: { id: session.id } });
      },
    });
  }, [begin, dayId, start, user]);

  useEffect(() => {
    launch();
  }, [launch]);
  if (!user) return <Redirect href="/" />;

  function retry() {
    launched.current = false;
    start.reset();
    launch();
  }

  return <Screen>{start.isError ? <ErrorState message={start.error.message} onRetry={retry} /> : <LoadingState label="Preparing your sets…" />}<AppText variant="caption">A recoverable local copy will be kept while you train.</AppText></Screen>;
}

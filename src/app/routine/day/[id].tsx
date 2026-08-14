import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, Card, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { useRenameRoutineDay, useRoutine } from '@/features/routines/hooks/use-routines';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function RenameRoutineDayScreen() {
  const { id, routineId } = useLocalSearchParams<{ id: string; routineId: string }>();
  const query = useRoutine(routineId);
  if (query.isLoading) return <Screen><LoadingState label="Loading training day…" /></Screen>;
  if (query.isError) return <Screen><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;
  const day = query.data?.routine_days.find((item) => item.id === id);
  if (!day) return <Screen><ErrorState message="Training day not found" /></Screen>;
  return <RenameDayForm key={day.id} dayId={day.id} initialName={day.name} routineId={routineId} />;
}

function RenameDayForm({ dayId, initialName, routineId }: { dayId: string; initialName: string; routineId: string }) {
  const { colors } = useAppTheme();
  const rename = useRenameRoutineDay(routineId);
  const [name, setName] = useState(initialName);
  const cleanName = name.trim();

  async function save() {
    if (!cleanName) return;
    try {
      await rename.mutateAsync({ dayId, name: cleanName });
      router.back();
    } catch {
      // The mutation error remains visible so the user can retry without losing the name.
    }
  }

  return (
    <Screen footer={<Button disabled={!cleanName || cleanName === initialName || rename.isPending} onPress={() => void save()}>{rename.isPending ? 'Saving…' : 'Save name'}</Button>}>
      <Card>
        <AppText variant="heading">Name this cycle slot</AppText>
        <AppText color={colors.muted}>Use a short label you can recognize quickly during training, such as “Chest & Back A” or “Legs”.</AppText>
        <Field label="Day name" value={name} onChangeText={setName} maxLength={80} autoFocus selectTextOnFocus returnKeyType="done" onSubmitEditing={() => void save()} />
        {rename.error ? <AppText color={colors.danger}>{rename.error.message}</AppText> : null}
      </Card>
    </Screen>
  );
}

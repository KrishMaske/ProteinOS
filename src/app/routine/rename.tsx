import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText, Button, Card, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { useRenameRoutine, useRoutine } from '@/features/routines/hooks/use-routines';
import { useAppTheme } from '@/hooks/use-app-theme';

export default function RenameRoutineScreen() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const query = useRoutine(routineId);
  if (query.isLoading) return <Screen><LoadingState label="Loading plan…" /></Screen>;
  if (query.isError || !query.data) return <Screen><ErrorState message={query.error?.message ?? 'Routine not found'} onRetry={() => query.refetch()} /></Screen>;
  return <RenameRoutineForm key={query.data.id} routineId={query.data.id} initialName={query.data.name} />;
}

function RenameRoutineForm({ initialName, routineId }: { initialName: string; routineId: string }) {
  const { colors } = useAppTheme();
  const rename = useRenameRoutine(routineId);
  const [name, setName] = useState(initialName);
  const cleanName = name.trim();

  async function save() {
    if (!cleanName) return;
    try {
      await rename.mutateAsync(cleanName);
      router.back();
    } catch {
      // The mutation error stays visible so the name is not lost on a retry.
    }
  }

  return (
    <Screen footer={<Button disabled={!cleanName || cleanName === initialName || rename.isPending} onPress={() => void save()}>{rename.isPending ? 'Saving…' : 'Save name'}</Button>}>
      <Card>
        <AppText variant="heading">Name this plan</AppText>
        <AppText color={colors.muted}>Give the routine a label you will recognise in your plan list, such as “Upper/Lower 4x” or “Summer cut”.</AppText>
        <Field label="Plan name" value={name} onChangeText={setName} maxLength={120} autoFocus selectTextOnFocus returnKeyType="done" onSubmitEditing={() => void save()} />
        {rename.error ? <AppText color={colors.danger}>{rename.error.message}</AppText> : null}
      </Card>
    </Screen>
  );
}

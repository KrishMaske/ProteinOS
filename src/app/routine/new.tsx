import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Field, Screen } from '@/components/ui';
import { spacing } from '@/constants/tokens';
import { useCreateRoutine } from '@/features/routines/hooks/use-routines';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';

export default function NewRoutineScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const [name, setName] = useState('');
  const create = useCreateRoutine();
  const cleanName = name.trim();

  async function submit() {
    if (!user || !cleanName) return;
    try {
      const routine = await create.mutateAsync({ userId: user.id, name: cleanName });
      router.replace({ pathname: '/routine/[id]', params: { id: routine.id } });
    } catch {
      // Keep the form open and render the mutation error below.
    }
  }

  return (
    <Screen footer={<Button disabled={!cleanName || create.isPending} onPress={() => void submit()}>{create.isPending ? 'Creating…' : 'Create routine'}</Button>}>
      <View style={styles.header}>
        <AppText variant="eyebrow" color={colors.primary}>Start simple</AppText>
        <AppText variant="title">Create a routine</AppText>
        <AppText color={colors.muted}>Name the plan first. You will add training and rest slots on the next screen.</AppText>
      </View>
      <Card>
        <Field label="Routine name" placeholder="Upper / Lower, Full Body…" value={name} onChangeText={setName} maxLength={100} autoFocus returnKeyType="done" onSubmitEditing={() => void submit()} />
        {create.error ? <AppText color={colors.danger}>{create.error.message}</AppText> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ header: { gap: spacing.sm } });

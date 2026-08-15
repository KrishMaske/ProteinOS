import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Field, LoadingState, Screen, SectionHeader } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import type { Gym } from '@/features/gyms/api/gyms';
import {
  useCreateGym,
  useDeleteGym,
  useGymComparison,
  useGyms,
  useSetDefaultGym,
} from '@/features/gyms/hooks/use-gyms';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';

export default function GymsScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const query = useGyms();
  const create = useCreateGym();
  const setDefault = useSetDefaultGym();
  const remove = useDeleteGym();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!user) return;
    if (!name.trim()) return setError('Give the gym a name.');
    setError(null);
    try {
      await create.mutateAsync({ userId: user.id, name, notes: notes.trim() || null });
      setName('');
      setNotes('');
    } catch {
      // The mutation error renders below.
    }
  }

  function confirmDelete(gym: Gym) {
    Alert.alert(
      'Delete this gym?',
      `${gym.name} is removed. Workouts logged there keep their history but stop being attributed to it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(gym.id) },
      ],
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Gyms' }} />

      {query.isLoading ? <LoadingState label="Loading gyms…" /> : null}
      {query.isError ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} /> : null}

      {!query.isLoading && !query.isError && !query.data?.length ? (
        <EmptyState
          title="No gyms yet"
          description="Add the places you train. New workouts are tagged with your default gym automatically."
        />
      ) : null}

      {query.data?.length ? (
        <View style={styles.list}>
          {query.data.map((gym) => (
            <View key={gym.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <AppText variant="heading" numberOfLines={1}>{gym.name}</AppText>
                  {gym.is_default ? (
                    <View style={[styles.badge, { backgroundColor: colors.softAccent }]}>
                      <AppText variant="caption" color={colors.primary}>Default</AppText>
                    </View>
                  ) : null}
                </View>
                {gym.notes ? <AppText variant="caption" color={colors.muted} numberOfLines={2}>{gym.notes}</AppText> : null}
              </View>
              {!gym.is_default ? (
                <Pressable
                  accessibilityLabel={`Make ${gym.name} the default gym`}
                  hitSlop={8}
                  onPress={() => setDefault.mutate(gym.id)}
                  style={({ pressed }) => [styles.iconAction, { opacity: pressed ? 0.5 : 1 }]}>
                  <Ionicons name="star-outline" size={22} color={colors.muted} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel={`Delete ${gym.name}`}
                hitSlop={8}
                onPress={() => confirmDelete(gym)}
                style={({ pressed }) => [styles.iconAction, { opacity: pressed ? 0.5 : 1 }]}>
                <Ionicons name="trash-outline" size={20} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Card>
        <AppText variant="heading">Add a gym</AppText>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Home garage, PureGym Fulham" />
        <Field
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Plate brand, machine quirks, anything that changes how a lift feels"
          multiline
          numberOfLines={2}
        />
        {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
        {create.error ? <AppText variant="caption" color={colors.danger}>{create.error.message}</AppText> : null}
        <Button disabled={create.isPending} onPress={() => void add()}>{create.isPending ? 'Adding…' : 'Add gym'}</Button>
      </Card>

      <GymComparison />
      {remove.error ? <AppText variant="caption" color={colors.danger}>{remove.error.message}</AppText> : null}
    </Screen>
  );
}

/**
 * The payoff for tagging sessions: the same lift side by side across gyms. Estimated
 * one-rep max rather than raw load, so sets taken at different rep counts still compare.
 */
function GymComparison() {
  const { colors } = useAppTheme();
  const query = useGymComparison();
  const rows = query.data ?? [];

  if (!rows.length) return null;

  const byExercise = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.exercise_key) continue;
    byExercise.set(row.exercise_key, [...(byExercise.get(row.exercise_key) ?? []), row]);
  }
  // Only exercises trained at more than one gym say anything about the difference.
  const compared = [...byExercise.values()].filter((group) => group.length > 1).slice(0, 6);
  if (!compared.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeader title="Same lift, different gyms" />
      {compared.map((group) => (
        <Card key={group[0].exercise_key}>
          <AppText variant="heading" numberOfLines={1}>{group[0].exercise_name}</AppText>
          {[...group]
            .sort((a, b) => Number(b.best_estimated_1rm_kg ?? 0) - Number(a.best_estimated_1rm_kg ?? 0))
            .map((row) => (
              <View key={`${row.gym_id ?? 'none'}`} style={styles.comparisonRow}>
                <AppText variant="caption" style={styles.flex} numberOfLines={1}>
                  {row.gym_name ?? 'Unrecorded'}
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  {Math.round(Number(row.average_weight_kg ?? 0))} kg avg · {row.completed_sets} sets
                </AppText>
              </View>
            ))}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  section: { minWidth: 0, gap: spacing.md },
  row: { minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { flexShrink: 0, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  iconAction: { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  comparisonRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0, gap: spacing.xs },
});

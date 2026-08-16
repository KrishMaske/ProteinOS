import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { useGyms, useSetSessionGym } from '@/features/gyms/hooks/use-gyms';
import { useAppTheme } from '@/hooks/use-app-theme';

/**
 * The default gym is stamped when a session starts, so this only has to make correcting
 * it cheap for the sessions that happened somewhere else. One saved gym is enough to show
 * it: the choice is still between that gym and leaving the session unrecorded.
 *
 * Used on the active workout and again on the summary, because "that was at the other
 * gym" is usually realised after finishing.
 */
export function GymPicker({ sessionId, gymId }: { sessionId: string; gymId: string | null }) {
  const { colors } = useAppTheme();
  const gyms = useGyms();
  const setGym = useSetSessionGym(sessionId);
  const [open, setOpen] = useState(false);
  const all = gyms.data ?? [];
  if (!all.length) return null;
  const current = all.find((gym) => gym.id === gymId);

  return (
    <View style={styles.gymWrap}>
      <Pressable
        accessibilityLabel={`Training at ${current?.name ?? 'an unrecorded gym'}. Change`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.gymRow, { backgroundColor: colors.raised, opacity: pressed ? 0.7 : 1 }]}>
        <Ionicons name="location-outline" size={17} color={colors.primary} />
        <AppText variant="caption" style={styles.flex} numberOfLines={1}>{current?.name ?? 'Gym not set'}</AppText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.gymOptions}>
          {all.map((gym) => (
            <Pressable
              key={gym.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: gym.id === gymId }}
              disabled={setGym.isPending}
              onPress={() => {
                setOpen(false);
                setGym.mutate({ sessionId, gymId: gym.id });
              }}
              style={({ pressed }) => [styles.gymOption, { backgroundColor: gym.id === gymId ? colors.primary : colors.surface, opacity: pressed ? 0.7 : 1 }]}>
              <AppText variant="caption" color={gym.id === gymId ? colors.onPrimary : colors.text} numberOfLines={1}>{gym.name}</AppText>
            </Pressable>
          ))}
          {/* Clearing is a real answer: better unrecorded than attributed to the wrong gym. */}
          {gymId ? (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: false }}
              disabled={setGym.isPending}
              onPress={() => {
                setOpen(false);
                setGym.mutate({ sessionId, gymId: null });
              }}
              style={({ pressed }) => [styles.gymOption, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}>
              <AppText variant="caption" color={colors.muted} numberOfLines={1}>Not set</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gymWrap: { minWidth: 0, gap: spacing.xs },
  gymRow: { minWidth: 0, minHeight: 40, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gymOptions: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  gymOption: { minHeight: 38, flexGrow: 1, flexBasis: '30%', minWidth: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});

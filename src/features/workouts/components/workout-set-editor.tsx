import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText, Button } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import type { WorkoutSet } from '@/features/workouts/api/workouts';
import { isSetDraftCurrent } from '@/features/workouts/services/set-draft';
import { parseSetEntry, stepEntry, type SetEntryFields } from '@/features/workouts/services/set-entry';
import { useAppTheme } from '@/hooks/use-app-theme';
import { kgToLb } from '@/lib/units';
import { useActiveWorkoutStore } from '@/store/active-workout-store';

type PreviousSet = { weightKg: number | null; reps: number | null } | null;

type WorkoutSetEditorProps = {
  set: WorkoutSet;
  imperial: boolean;
  isCurrent: boolean;
  previous: PreviousSet;
  restSeconds: number;
  onSave: (values: Partial<WorkoutSet>, justCompleted?: boolean) => Promise<unknown>;
  onRemove: () => void;
};

const setTypes = ['warmup', 'working', 'failure', 'drop'] as const;

function displayWeight(weightKg: number | null | undefined, imperial: boolean) {
  if (weightKg === null || weightKg === undefined) return '';
  const value = imperial ? kgToLb(weightKg) : weightKg;
  return value.toFixed(1).replace(/\.0$/, '');
}

function fieldsFromServer(set: WorkoutSet, imperial: boolean): SetEntryFields {
  return {
    weight: displayWeight(set.weight_kg, imperial),
    reps: set.reps?.toString() ?? '',
    duration: set.duration_seconds?.toString() ?? '',
    rpe: set.rpe?.toString() ?? '',
    rir: set.rir?.toString() ?? '',
  };
}

export function WorkoutSetEditor({ set, imperial, isCurrent, previous, restSeconds, onSave, onRemove }: WorkoutSetEditorProps) {
  const { colors } = useAppTheme();
  const pendingDraft = useActiveWorkoutStore((state) => state.pendingSetEdits[set.id]);
  const editSet = useActiveWorkoutStore((state) => state.editSet);
  const clearSetEdit = useActiveWorkoutStore((state) => state.clearSetEdit);
  const recovered = isSetDraftCurrent(pendingDraft, set) ? pendingDraft : undefined;
  const initialWeightKg = recovered?.weightKg ?? set.weight_kg;
  const [fields, setFields] = useState<SetEntryFields>({
    weight: displayWeight(initialWeightKg, imperial),
    reps: recovered?.reps?.toString() ?? set.reps?.toString() ?? '',
    duration: recovered?.durationSeconds?.toString() ?? set.duration_seconds?.toString() ?? '',
    rpe: recovered?.rpe?.toString() ?? set.rpe?.toString() ?? '',
    rir: recovered?.rir?.toString() ?? set.rir?.toString() ?? '',
  });
  const [expanded, setExpanded] = useState(isCurrent);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(fields.duration || fields.rpe || fields.rir));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const completed = Boolean(set.completed_at);

  useEffect(() => {
    if (isSetDraftCurrent(pendingDraft, set)) return;
    if (pendingDraft) clearSetEdit(set.id);
    const serverFields = fieldsFromServer(set, imperial);
    setFields(serverFields);
    setDetailsOpen(Boolean(serverFields.duration || serverFields.rpe || serverFields.rir));
    setError(null);
  }, [clearSetEdit, imperial, pendingDraft, set, set.completed_at, set.id, set.updated_at]);

  useEffect(() => {
    if (isCurrent && !completed) setExpanded(true);
  }, [completed, isCurrent]);

  function changeField(field: keyof SetEntryFields, value: string) {
    const next = { ...fields, [field]: value };
    setFields(next);
    setError(null);
    if (field === 'weight') {
      const parsed = parseSetEntry({ ...next, reps: '', duration: '', rpe: '', rir: '' }, imperial);
      editSet(set.id, { serverUpdatedAt: recovered?.serverUpdatedAt ?? set.updated_at, weightKg: parsed.values?.weight_kg ?? null });
    } else if (field === 'reps') editSet(set.id, { serverUpdatedAt: recovered?.serverUpdatedAt ?? set.updated_at, reps: value ? Number(value) : null });
    else if (field === 'duration') editSet(set.id, { serverUpdatedAt: recovered?.serverUpdatedAt ?? set.updated_at, durationSeconds: value ? Number(value) : null });
    else if (field === 'rpe') editSet(set.id, { serverUpdatedAt: recovered?.serverUpdatedAt ?? set.updated_at, rpe: value ? Number(value) : null });
    else editSet(set.id, { serverUpdatedAt: recovered?.serverUpdatedAt ?? set.updated_at, rir: value ? Number(value) : null });
  }

  function step(field: 'weight' | 'reps', amount: number) {
    changeField(field, stepEntry(fields[field], amount, field === 'reps' ? 1 : 0));
  }

  function usePrevious() {
    if (!previous) return;
    const weight = displayWeight(previous.weightKg, imperial);
    const reps = previous.reps?.toString() ?? '';
    setFields((current) => ({ ...current, weight, reps }));
    editSet(set.id, { serverUpdatedAt: recovered?.serverUpdatedAt ?? set.updated_at, weightKg: previous.weightKg, reps: previous.reps });
    setError(null);
  }

  async function persist(mode: 'save' | 'complete' | 'incomplete') {
    const parsed = parseSetEntry(fields, imperial, mode === 'complete');
    if (parsed.error || !parsed.values) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ...parsed.values,
        ...(mode === 'complete' ? { completed_at: new Date().toISOString() } : mode === 'incomplete' ? { completed_at: null } : {}),
      }, mode === 'complete');
      clearSetEdit(set.id);
      if (mode !== 'incomplete') setExpanded(false);
    } catch {
      // The local recovery copy stays available and the parent renders request errors.
    } finally {
      setSaving(false);
    }
  }

  async function changeSetType(type: WorkoutSet['set_type']) {
    if (type === set.set_type) return;
    const parsed = parseSetEntry(fields, imperial);
    if (parsed.error || !parsed.values) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...parsed.values, set_type: type });
      clearSetEdit(set.id);
    } catch {
      // The parent renders request errors.
    } finally {
      setSaving(false);
    }
  }

  const summary = fields.reps || fields.duration
    ? `${fields.weight ? `${fields.weight} ${imperial ? 'lb' : 'kg'} × ` : ''}${fields.reps ? `${fields.reps} reps` : `${fields.duration}s`}`
    : completed ? 'Completed' : isCurrent ? 'Up next' : 'Not logged';

  if (!expanded) {
    return (
      <Pressable
        accessibilityLabel={`Edit set ${set.set_index + 1}, ${summary}`}
        accessibilityRole="button"
        onPress={() => setExpanded(true)}
        style={({ pressed }) => [
          styles.collapsed,
          { backgroundColor: completed ? colors.raised : colors.surface, borderColor: isCurrent ? colors.primary : colors.line, opacity: pressed ? 0.72 : 1 },
        ]}>
        <View style={[styles.setNumber, { backgroundColor: completed ? colors.primary : colors.raised }]}>
          {completed ? <Ionicons name="checkmark" size={19} color={colors.onPrimary} /> : <AppText variant="caption">{set.set_index + 1}</AppText>}
        </View>
        <View style={styles.summaryCopy}>
          <AppText variant="caption" color={colors.muted}>{set.set_type}</AppText>
          <AppText numberOfLines={1}>{summary}</AppText>
        </View>
        <Ionicons name="chevron-forward" color={colors.muted} size={20} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.editor, { backgroundColor: colors.surface, borderColor: isCurrent ? colors.primary : colors.line }]}>
      <View style={styles.editorHeader}>
        <View style={styles.editorTitle}>
          <View style={[styles.setNumber, { backgroundColor: completed ? colors.primary : colors.raised }]}>
            {completed ? <Ionicons name="checkmark" size={19} color={colors.onPrimary} /> : <AppText variant="caption">{set.set_index + 1}</AppText>}
          </View>
          <View style={styles.summaryCopy}>
            <AppText variant="heading">Set {set.set_index + 1}</AppText>
            <AppText variant="caption" color={colors.muted}>{isCurrent && !completed ? 'Enter your result' : completed ? 'Completed set' : 'Planned set'}</AppText>
          </View>
        </View>
        <Pressable accessibilityLabel={`Collapse set ${set.set_index + 1}`} onPress={() => setExpanded(false)} style={styles.iconButton}>
          <Ionicons name="chevron-up" color={colors.text} size={22} />
        </Pressable>
      </View>

      <View style={styles.typeRow}>
        {setTypes.map((type) => (
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            key={type}
            onPress={() => void changeSetType(type)}
            style={[styles.typeChip, { backgroundColor: type === set.set_type ? colors.raised : 'transparent', borderColor: type === set.set_type ? colors.primary : colors.line }]}>
            <AppText variant="caption" color={type === set.set_type ? colors.primary : colors.muted}>{type}</AppText>
          </Pressable>
        ))}
      </View>

      {previous && (previous.weightKg !== null || previous.reps !== null) ? (
        <Pressable accessibilityRole="button" onPress={usePrevious} style={[styles.previous, { backgroundColor: colors.raised }]}>
          <Ionicons name="time-outline" color={colors.primary} size={20} />
          <View style={styles.summaryCopy}>
            <AppText variant="caption" color={colors.muted}>Last time</AppText>
            <AppText variant="caption">{previous.weightKg === null ? 'Bodyweight' : `${displayWeight(previous.weightKg, imperial)} ${imperial ? 'lb' : 'kg'}`} {previous.reps === null ? '' : `× ${previous.reps}`}</AppText>
          </View>
          <AppText variant="caption" color={colors.primary}>Use</AppText>
        </Pressable>
      ) : null}

      <NumericControl
        label={imperial ? 'Weight (lb)' : 'Weight (kg)'}
        value={fields.weight}
        decrement={() => step('weight', imperial ? -5 : -2.5)}
        increment={() => step('weight', imperial ? 5 : 2.5)}
        onChangeText={(value) => changeField('weight', value)}
        placeholder="Bodyweight"
        decimal
      />
      <NumericControl
        label="Reps"
        value={fields.reps}
        decrement={() => step('reps', -1)}
        increment={() => step('reps', 1)}
        onChangeText={(value) => changeField('reps', value)}
        placeholder="0"
      />

      <Pressable accessibilityRole="button" onPress={() => setDetailsOpen((open) => !open)} style={styles.detailsToggle}>
        <AppText variant="caption" color={colors.primary}>{detailsOpen ? 'Hide details' : 'More details'}</AppText>
        <Ionicons name={detailsOpen ? 'chevron-up' : 'chevron-down'} color={colors.primary} size={18} />
      </Pressable>
      {detailsOpen ? (
        <View style={styles.detailsGrid}>
          <SmallInput label="Duration (sec)" value={fields.duration} onChangeText={(value) => changeField('duration', value)} />
          <SmallInput label="RPE" value={fields.rpe} onChangeText={(value) => changeField('rpe', value)} decimal />
          <SmallInput label="RIR" value={fields.rir} onChangeText={(value) => changeField('rir', value)} />
        </View>
      ) : null}

      {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
      <Button disabled={saving} onPress={() => void persist(completed ? 'save' : 'complete')}>
        {saving ? 'Saving…' : completed ? 'Save changes' : `Complete set · rest ${Math.round(restSeconds / 60)}:${String(restSeconds % 60).padStart(2, '0')}`}
      </Button>
      <View style={styles.secondaryRow}>
        {completed ? <Button variant="ghost" style={styles.flex} disabled={saving} onPress={() => void persist('incomplete')}>Mark incomplete</Button> : null}
        <Button variant="ghost" style={styles.flex} disabled={saving} onPress={onRemove}>Remove set</Button>
      </View>
    </View>
  );
}

function NumericControl({ label, value, decrement, increment, onChangeText, placeholder, decimal = false }: {
  label: string;
  value: string;
  decrement: () => void;
  increment: () => void;
  onChangeText: (value: string) => void;
  placeholder: string;
  decimal?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.controlWrap}>
      <AppText variant="caption" color={colors.muted}>{label}</AppText>
      <View style={[styles.control, { backgroundColor: colors.background, borderColor: colors.line }]}>
        <Pressable accessibilityLabel={`Decrease ${label}`} accessibilityRole="button" onPress={decrement} style={styles.stepButton}>
          <Ionicons name="remove" color={colors.text} size={22} />
        </Pressable>
        <TextInput
          accessibilityLabel={label}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          returnKeyType="done"
          selectTextOnFocus
          style={[styles.numericInput, { color: colors.text, borderColor: colors.line }]}
          value={value}
        />
        <Pressable accessibilityLabel={`Increase ${label}`} accessibilityRole="button" onPress={increment} style={styles.stepButton}>
          <Ionicons name="add" color={colors.text} size={22} />
        </Pressable>
      </View>
    </View>
  );
}

function SmallInput({ label, value, onChangeText, decimal = false }: { label: string; value: string; onChangeText: (value: string) => void; decimal?: boolean }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.smallInputWrap}>
      <AppText variant="caption" color={colors.muted}>{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        onChangeText={onChangeText}
        placeholder="—"
        placeholderTextColor={colors.muted}
        returnKeyType="done"
        selectTextOnFocus
        style={[styles.smallInput, { backgroundColor: colors.background, borderColor: colors.line, color: colors.text }]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: { minHeight: 64, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%' },
  setNumber: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1, minWidth: 0, gap: 1 },
  editor: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, width: '100%', overflow: 'hidden' },
  editorHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editorTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconButton: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: { minHeight: 36, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  previous: { minHeight: 58, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  controlWrap: { gap: spacing.xs, width: '100%' },
  control: { height: 58, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'stretch', overflow: 'hidden' },
  stepButton: { width: 52, alignItems: 'center', justifyContent: 'center' },
  numericInput: { flex: 1, minWidth: 0, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, textAlign: 'center', fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'], paddingHorizontal: spacing.sm },
  detailsToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  smallInputWrap: { flexGrow: 1, flexBasis: 88, gap: spacing.xs },
  smallInput: { height: 48, minWidth: 0, borderWidth: 1, borderRadius: radius.sm, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flex: { flexGrow: 1, flexBasis: 130 },
});

import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Button, EmptyState, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { ExerciseCard } from '@/features/exercises/components/exercise-card';
import { useExerciseFilters, useExercises } from '@/features/exercises/hooks/use-exercises';
import { useAppTheme } from '@/hooks/use-app-theme';

const SCREEN_MAX_WIDTH = 720;
const PREFERRED_CARD_WIDTH = 170;
const MIN_COLUMNS = 3;
const MAX_COLUMNS = 5;

// Screen caps its content and switches to tighter padding on small phones, so the
// grid has to measure against the same box to keep the final row aligned.
function useExerciseGrid() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, SCREEN_MAX_WIDTH) - (width < 380 ? spacing.md : spacing.lg) * 2;
  const fitting = Math.floor((contentWidth + spacing.sm) / (PREFERRED_CARD_WIDTH + spacing.sm));
  const columns = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, fitting));
  const cardWidth = Math.floor((contentWidth - spacing.sm * (columns - 1)) / columns);
  return { cardWidth, mediaSize: cardWidth - spacing.xs * 2 };
}

export default function ExerciseLibraryScreen() {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [bodyPart, setBodyPart] = useState<string>();
  const [target, setTarget] = useState<string>();
  const [equipment, setEquipment] = useState<string>();
  const query = useExercises({ search, bodyPart, target, equipment });
  const filters = useExerciseFilters();
  const activeFilters = [bodyPart, target, equipment].filter(Boolean).length;
  const { cardWidth, mediaSize } = useExerciseGrid();

  return <Screen><Field label="Search" placeholder="Bench press, squat, row…" value={search} onChangeText={setSearch} autoFocus /><Button variant="secondary" onPress={() => setShowFilters((value) => !value)}>{showFilters ? 'Hide filters' : `Filters${activeFilters ? ` (${activeFilters})` : ''}`}</Button>
    {showFilters ? <View style={styles.filters}><FilterStrip label="Body part" values={filters.data?.bodyParts ?? []} selected={bodyPart} onSelect={setBodyPart} /><FilterStrip label="Target" values={filters.data?.targets ?? []} selected={target} onSelect={setTarget} /><FilterStrip label="Equipment" values={filters.data?.equipment ?? []} selected={equipment} onSelect={setEquipment} /></View> : null}
    {query.isLoading ? <LoadingState label="Loading exercises…" /> : query.isError ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} /> : query.data?.length ? <View style={styles.list}>{query.data.map((exercise) => <ExerciseCard exercise={exercise} key={exercise.exercise_key} mediaSize={mediaSize} style={{ width: cardWidth }} />)}</View> : <EmptyState title="No exercises found" description="Try removing a filter or using a broader search." />}
  </Screen>;
}

function FilterStrip({ label, values, selected, onSelect }: { label: string; values: string[]; selected?: string; onSelect: (value?: string) => void }) {
  const { colors } = useAppTheme();
  return <View style={styles.filter}><AppText variant="caption">{label}</AppText><View style={styles.chips}><Pressable onPress={() => onSelect(undefined)} style={[styles.chip, { backgroundColor: !selected ? colors.primary : colors.raised }]}><AppText variant="caption" color={!selected ? colors.onPrimary : colors.text}>All</AppText></Pressable>{values.slice(0, 12).map((value) => <Pressable key={value} onPress={() => onSelect(selected === value ? undefined : value)} style={[styles.chip, { backgroundColor: selected === value ? colors.primary : colors.raised }]}><AppText variant="caption" color={selected === value ? colors.onPrimary : colors.text}>{value}</AppText></Pressable>)}</View></View>;
}

const styles = StyleSheet.create({
  // Fixed tile widths leave a few pixels of rounding slack per row, and the last row is
  // usually short — centering keeps both balanced instead of hanging off the left edge.
  list: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center', gap: spacing.sm },
  filters: { gap: spacing.lg },
  filter: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, minHeight: 44, justifyContent: 'center', borderRadius: radius.pill },
});

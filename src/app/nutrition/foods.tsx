import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { useLogSavedFood, useSavedFoods } from '@/features/nutrition/hooks/use-nutrition';
import { useAppTheme } from '@/hooks/use-app-theme';
import { localDateKey } from '@/lib/date';
import type { Database, Tables } from '@/types/database';

type MealType = Database['public']['Enums']['meal_type'];
type SavedFood = Tables<'saved_foods'>;
const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks', 'other'];

function currentMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snacks';
}

export default function SavedFoodsScreen() {
  const { colors } = useAppTheme();
  const query = useSavedFoods();
  const log = useLogSavedFood(localDateKey());
  const [mealType, setMealType] = useState<MealType>(currentMealType);
  const [search, setSearch] = useState('');
  const [lastLoggedId, setLastLoggedId] = useState<string | null>(null);
  const foods = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return normalized ? (query.data ?? []).filter((food) => food.name.toLocaleLowerCase().includes(normalized)) : query.data ?? [];
  }, [query.data, search]);

  async function quickLog(id: string) {
    setLastLoggedId(null);
    try {
      await log.mutateAsync({ id, mealType });
      setLastLoggedId(id);
    } catch {
      // Mutation state displays the error without losing the selected meal.
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Saved foods' }} />
      <View style={styles.mealPicker}>
        <View style={styles.intro}>
          <AppText variant="caption" color={colors.muted} style={styles.flex}>Log to</AppText>
          <Link href="/nutrition/saved/new" asChild>
            <Pressable accessibilityLabel="Create saved food" style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}>
              <Ionicons name="add" size={22} color={colors.onPrimary} />
            </Pressable>
          </Link>
        </View>
        <View style={styles.chips}>{meals.map((meal) => <MealChip key={meal} label={meal} active={mealType === meal} onPress={() => setMealType(meal)} />)}</View>
      </View>

      {(query.data?.length ?? 0) > 5 ? <Field label="Search your foods" value={search} onChangeText={setSearch} placeholder="Greek yogurt, oats…" returnKeyType="search" /> : null}

      {query.isLoading ? <LoadingState label="Loading your foods…" /> : null}
      {query.isError ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} /> : null}
      {!query.isLoading && !query.isError && !query.data?.length ? (
        <EmptyState
          title="Save it once"
          description="Add a food and its usual serving. It stays private to your account and is ready whenever you eat it again."
          action={<Link href="/nutrition/saved/new" asChild><Button>Add your first food</Button></Link>}
        />
      ) : null}
      {query.data?.length && !foods.length ? <EmptyState title="No match" description="Try another food name." /> : null}

      <View style={styles.list}>
        {foods.map((food) => (
          <SavedFoodRow
            key={food.id}
            food={food}
            logged={lastLoggedId === food.id}
            pending={log.isPending && log.variables?.id === food.id}
            onLog={() => void quickLog(food.id)}
          />
        ))}
      </View>
      {log.error ? <AppText color={colors.danger}>{log.error.message}</AppText> : null}
    </Screen>
  );
}

function SavedFoodRow({ food, logged, pending, onLog }: { food: SavedFood; logged: boolean; pending: boolean; onLog: () => void }) {
  const { colors } = useAppTheme();
  const serving = [food.serving_quantity, food.serving_unit].filter((value) => value !== null && value !== '').join(' ')
    || (food.serving_grams ? `${food.serving_grams} g` : '1 serving');
  return (
    <View style={[styles.foodRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Link href={`/nutrition/saved/${food.id}` as Href} asChild>
        <Pressable accessibilityLabel={`Edit ${food.name}`} style={({ pressed }) => [styles.foodCopy, { opacity: pressed ? 0.65 : 1 }]}>
          <View style={[styles.foodIcon, { backgroundColor: colors.raised }]}><Ionicons name="restaurant-outline" size={19} color={colors.primary} /></View>
          <View style={styles.flex}>
            <AppText variant="heading" numberOfLines={1}>{food.name}</AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>{serving} · {Math.round(food.calories)} kcal · {Math.round(food.protein_grams)}g protein</AppText>
          </View>
        </Pressable>
      </Link>
      <Pressable
        accessibilityLabel={`Log ${food.name}`}
        disabled={pending}
        onPress={onLog}
        style={({ pressed }) => [styles.logButton, { backgroundColor: logged ? colors.raised : colors.primary, opacity: pending ? 0.5 : pressed ? 0.72 : 1 }]}>
        <Ionicons name={logged ? 'checkmark' : 'add'} size={18} color={logged ? colors.primary : colors.onPrimary} />
        <AppText variant="caption" color={logged ? colors.primary : colors.onPrimary}>{pending ? 'Saving' : logged ? 'Logged' : 'Log'}</AppText>
      </Pressable>
    </View>
  );
}

function MealChip({ active, label, onPress }: { active: boolean; label: MealType; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: active ? colors.primary : colors.raised, opacity: pressed ? 0.75 : 1 }]}>
      <AppText variant="caption" color={active ? colors.onPrimary : colors.text}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  addButton: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  mealPicker: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Three per row keeps the five meals as two full rows instead of stranding one alone.
  chip: { minHeight: 42, flexGrow: 1, flexBasis: '30%', minWidth: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  list: { gap: spacing.sm },
  foodRow: { minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  foodCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  foodIcon: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  logButton: { minHeight: 42, minWidth: 70, flexShrink: 0, paddingHorizontal: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  flex: { flex: 1, minWidth: 0, gap: spacing.xs },
});

import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, LoadingState, PressableCard, ProgressBar, Screen, SectionHeader } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { useDailyNutrition } from '@/features/nutrition/hooks/use-nutrition';
import { useAppTheme } from '@/hooks/use-app-theme';
import { localDateKey } from '@/lib/date';
import type { Database } from '@/types/database';

const mealOrder: Database['public']['Enums']['meal_type'][] = ['breakfast', 'lunch', 'dinner', 'snacks', 'other'];

export default function NutritionScreen() {
  const { colors } = useAppTheme();
  const date = localDateKey();
  const query = useDailyNutrition(date);
  if (query.isLoading) return <Screen safeEdges={['top', 'left', 'right']}><LoadingState /></Screen>;
  if (query.isError) return <Screen safeEdges={['top', 'left', 'right']}><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;

  const { totals, target, logs } = query.data!;
  const calories = totals?.calories ?? 0;
  const calorieTarget = target?.calories ?? 2000;
  const caloriesLeft = Math.round(calorieTarget - calories);
  const over = caloriesLeft < 0;

  return (
    <Screen safeEdges={['top', 'left', 'right']}>
      <View style={styles.header}><AppText variant="title">Nutrition</AppText></View>
      <Card>
        <View style={styles.calorieRow}>
          <View style={styles.calorieCopy}><AppText variant="number">{Math.round(calories)}</AppText><AppText color={colors.muted}>of {Math.round(calorieTarget)} kcal</AppText></View>
          <View style={[styles.leftPill, { backgroundColor: colors.raised }]}><AppText variant="heading" color={over ? colors.danger : colors.text}>{Math.abs(caloriesLeft)}</AppText><AppText variant="caption" color={colors.muted}>{over ? 'over' : 'left'}</AppText></View>
        </View>
        <ProgressBar label={`${Math.round(calories)} of ${Math.round(calorieTarget)} calories`} value={calorieTarget > 0 ? calories / calorieTarget * 100 : 0} />
        <View style={styles.macros}>
          <Macro label="Protein" current={totals?.protein_grams} target={target?.protein_grams} />
          <Macro label="Carbs" current={totals?.carbohydrate_grams} target={target?.carbohydrate_grams} />
          <Macro label="Fat" current={totals?.fat_grams} target={target?.fat_grams} />
        </View>
      </Card>

      <View style={styles.actions}>
        <Link href="/nutrition/scan" asChild><Button style={styles.growingAction}>Food camera</Button></Link>
        <Link href="/nutrition/recipes" asChild><Button variant="secondary" style={styles.growingAction}>Recipes</Button></Link>
        <Link href="/nutrition/foods" asChild><Button variant="secondary" style={styles.growingAction}>Saved foods</Button></Link>
        <Link href="/nutrition/log" asChild><Button variant="ghost" style={styles.growingAction}>Enter manually</Button></Link>
      </View>

      <View style={styles.mealSection}>
        <SectionHeader title="Meals" />
        {logs.length ? mealOrder.map((meal) => {
          const entries = logs.filter((log) => log.meal_type === meal);
          if (!entries.length) return null;
          return (
            <View key={meal} style={styles.group}>
              <AppText variant="eyebrow" color={colors.muted}>{meal}</AppText>
              {entries.map((log) => {
                const entryCalories = Math.round(log.food_log_items.reduce((sum, item) => sum + item.calories, 0));
                const protein = Math.round(log.food_log_items.reduce((sum, item) => sum + (item.protein_grams ?? 0), 0));
                return (
                  <Link key={log.id} href={{ pathname: '/nutrition/[id]', params: { id: log.id } }} asChild>
                    <PressableCard>
                      <View style={styles.mealRow}>
                        <View style={[styles.mealIcon, { backgroundColor: colors.raised }]}><Ionicons name={log.source === 'photo_estimate' ? 'camera-outline' : 'restaurant-outline'} size={20} color={colors.primary} /></View>
                        <View style={styles.flex}><AppText variant="heading" numberOfLines={2}>{log.name ?? 'Meal'}</AppText><AppText variant="caption" color={colors.muted}>{protein}g protein{log.source === 'photo_estimate' ? ' · photo estimate' : ''}</AppText></View>
                        <View style={styles.mealCalories}><AppText variant="heading">{entryCalories}</AppText><AppText variant="caption" color={colors.muted}>kcal</AppText></View>
                        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                      </View>
                    </PressableCard>
                  </Link>
                );
              })}
            </View>
          );
        }) : <EmptyState title="No meals yet" description="Add what you ate, or use a photo for an estimate you can review before saving." />}
      </View>
    </Screen>
  );
}

function Macro({ label, current, target }: { label: string; current?: number | null; target?: number | null }) {
  const { colors } = useAppTheme();
  const currentValue = Math.round(current ?? 0);
  const targetValue = Math.round(target ?? 0);
  return (
    <View style={[styles.macro, { backgroundColor: colors.raised }]}>
      <AppText variant="heading">{currentValue}g</AppText>
      <AppText variant="caption" color={colors.muted}>{label}</AppText>
      <AppText variant="caption" color={colors.muted}>of {targetValue}g</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { minWidth: 0, gap: spacing.sm },
  calorieRow: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  calorieCopy: { minWidth: 0 },
  leftPill: { minWidth: 90, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  macros: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  macro: { minWidth: 88, flexGrow: 1, flexBasis: 88, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  growingAction: { flexGrow: 1, flexBasis: 140 },
  mealSection: { minWidth: 0, gap: spacing.md },
  group: { minWidth: 0, gap: spacing.sm },
  mealRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealIcon: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  mealCalories: { flexShrink: 0, alignItems: 'flex-end' },
  flex: { flex: 1, minWidth: 0 },
});

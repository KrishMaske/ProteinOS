import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, LoadingState, PressableCard, ProgressBar, Screen, SectionHeader } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { perServing, recipeTotals } from '@/features/nutrition/api/recipes';
import { useDailyNutrition } from '@/features/nutrition/hooks/use-nutrition';
import { useLogRecipe, useRecipes } from '@/features/nutrition/hooks/use-recipes';
import { RecipeImage } from '@/features/nutrition/components/recipe-image';
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
        <Link href="/nutrition/foods" asChild><Button variant="secondary" style={styles.growingAction}>Saved foods</Button></Link>
        <Link href="/nutrition/log" asChild><Button variant="ghost" style={styles.growingAction}>Enter manually</Button></Link>
      </View>

      <RecipeShortcuts mealType={currentMealType()} />

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

function currentMealType(): Database['public']['Enums']['meal_type'] {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snacks';
}

/**
 * Recipes are a library rather than a way of logging, so they sit apart from the logging
 * row. The point of this section is the one tap that says "I had this today", which
 * writes the macros through the same path as any other meal.
 */
function RecipeShortcuts({ mealType }: { mealType: Database['public']['Enums']['meal_type'] }) {
  const { colors } = useAppTheme();
  const query = useRecipes();
  const log = useLogRecipe();
  const [loggedId, setLoggedId] = useState<string | null>(null);
  const recipes = (query.data ?? []).slice(0, 3);

  if (query.isLoading || !query.data?.length) {
    return (
      <View style={styles.mealSection}>
        <SectionHeader title="Recipes" />
        {query.isLoading ? null : (
          <>
            <AppText variant="caption" color={colors.muted}>
              Save something you cook and logging a serving is one tap from here.
            </AppText>
            <Link href="/nutrition/recipes" asChild><Button variant="secondary">Add a recipe</Button></Link>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.mealSection}>
      <SectionHeader title="Recipes" />
      <View style={styles.cardList}>
        {recipes.map((recipe) => {
          const each = perServing(recipeTotals(recipe.recipe_ingredients), Number(recipe.servings));
          const done = loggedId === recipe.id;
          const pending = log.isPending && log.variables?.recipeId === recipe.id;
          return (
            <View key={recipe.id} style={[styles.recipeRow, { backgroundColor: colors.surface }]}>
              <Link href={`/nutrition/recipe/${recipe.id}` as Href} asChild>
                <Pressable accessibilityLabel={`Open ${recipe.name}`} style={({ pressed }) => [styles.recipeCopy, { opacity: pressed ? 0.65 : 1 }]}>
                  <RecipeImage path={recipe.image_path} size={44} />
                  <View style={styles.flex}>
                    <AppText variant="heading" numberOfLines={1}>{recipe.name}</AppText>
                    <AppText variant="caption" color={colors.muted} numberOfLines={1}>
                      {Math.round(each.calories)} kcal · {Math.round(each.proteinGrams)}g protein a serving
                    </AppText>
                  </View>
                </Pressable>
              </Link>
              <Pressable
                accessibilityLabel={`Log one serving of ${recipe.name} to ${mealType}`}
                disabled={pending}
                onPress={() => {
                  setLoggedId(null);
                  log.mutate({ recipeId: recipe.id, date: localDateKey(), mealType, servings: 1 },
                    { onSuccess: () => setLoggedId(recipe.id) });
                }}
                style={({ pressed }) => [styles.recipeLog, { backgroundColor: done ? colors.raised : colors.primary, opacity: pending ? 0.5 : pressed ? 0.72 : 1 }]}>
                <Ionicons name={done ? 'checkmark' : 'add'} size={16} color={done ? colors.primary : colors.onPrimary} />
                <AppText variant="caption" color={done ? colors.primary : colors.onPrimary}>{pending ? 'Saving' : done ? 'Logged' : 'I had this'}</AppText>
              </Pressable>
            </View>
          );
        })}
      </View>
      <Link href="/nutrition/recipes" asChild>
        <Button variant="secondary">
          {query.data.length > 3 ? `All ${query.data.length} recipes` : 'Manage recipes'}
        </Button>
      </Link>
      {log.error ? <AppText variant="caption" color={colors.danger}>{log.error.message}</AppText> : null}
    </View>
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
  cardList: { minWidth: 0, gap: spacing.sm },
  recipeRow: { minWidth: 0, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recipeCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recipeLog: { minHeight: 40, flexShrink: 0, paddingHorizontal: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  mealSection: { minWidth: 0, gap: spacing.md },
  group: { minWidth: 0, gap: spacing.sm },
  mealRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealIcon: { width: 42, height: 42, flexShrink: 0, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  mealCalories: { flexShrink: 0, alignItems: 'flex-end' },
  flex: { flex: 1, minWidth: 0 },
});

import { Ionicons } from '@expo/vector-icons';
import { Link, Stack, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import {
  perServing,
  recipeTotals,
  type RecipeWithIngredients,
} from '@/features/nutrition/api/recipes';
import { RecipeImage } from '@/features/nutrition/components/recipe-image';
import { useLogRecipe, useRecipes } from '@/features/nutrition/hooks/use-recipes';
import { useAppTheme } from '@/hooks/use-app-theme';
import { localDateKey } from '@/lib/date';
import type { Database } from '@/types/database';

type MealType = Database['public']['Enums']['meal_type'];
const meals: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks', 'other'];

function currentMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snacks';
}

export default function RecipesScreen() {
  const { colors } = useAppTheme();
  const query = useRecipes();
  const log = useLogRecipe();
  const [mealType, setMealType] = useState<MealType>(currentMealType);
  const [search, setSearch] = useState('');
  const [loggedId, setLoggedId] = useState<string | null>(null);

  const recipes = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    const all = query.data ?? [];
    return normalized ? all.filter((recipe) => recipe.name.toLocaleLowerCase().includes(normalized)) : all;
  }, [query.data, search]);

  async function logOne(recipe: RecipeWithIngredients) {
    setLoggedId(null);
    try {
      await log.mutateAsync({ recipeId: recipe.id, date: localDateKey(), mealType, servings: 1 });
      setLoggedId(recipe.id);
    } catch {
      // The mutation error renders below the list without losing the selected meal.
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Recipes' }} />
      <View style={styles.mealPicker}>
        <View style={styles.intro}>
          <AppText variant="caption" color={colors.muted} style={styles.flex}>Log one serving to</AppText>
          <Link href={'/nutrition/recipe/new' as Href} asChild>
            <Pressable
              accessibilityLabel="Create recipe"
              style={({ pressed }) => [styles.addButton, { backgroundColor: colors.primary, opacity: pressed ? 0.75 : 1 }]}>
              <Ionicons name="add" size={22} color={colors.onPrimary} />
            </Pressable>
          </Link>
        </View>
        <View style={styles.chips}>
          {meals.map((meal) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: mealType === meal }}
              key={meal}
              onPress={() => setMealType(meal)}
              style={({ pressed }) => [styles.chip, { backgroundColor: mealType === meal ? colors.primary : colors.raised, opacity: pressed ? 0.75 : 1 }]}>
              <AppText variant="caption" color={mealType === meal ? colors.onPrimary : colors.text}>{meal}</AppText>
            </Pressable>
          ))}
        </View>
      </View>

      {(query.data?.length ?? 0) > 5 ? (
        <Field label="Search recipes" value={search} onChangeText={setSearch} placeholder="Chilli, overnight oats…" returnKeyType="search" />
      ) : null}

      {query.isLoading ? <LoadingState label="Loading recipes…" /> : null}
      {query.isError ? <ErrorState message={query.error.message} onRetry={() => query.refetch()} /> : null}
      {!query.isLoading && !query.isError && !query.data?.length ? (
        <>
          <EmptyState title="No recipes yet" description="Save something you cook once, then log a serving whenever you eat it." />
          <Link href={'/nutrition/recipe/new' as Href} asChild><Button>Add your first recipe</Button></Link>
        </>
      ) : null}
      {query.data?.length && !recipes.length ? <EmptyState title="No match" description="Try another recipe name." /> : null}

      <View style={styles.list}>
        {recipes.map((recipe) => (
          <RecipeRow
            key={recipe.id}
            recipe={recipe}
            logged={loggedId === recipe.id}
            pending={log.isPending && log.variables?.recipeId === recipe.id}
            onLog={() => void logOne(recipe)}
          />
        ))}
      </View>
      {log.error ? <AppText variant="caption" color={colors.danger}>{log.error.message}</AppText> : null}
    </Screen>
  );
}

function RecipeRow({ recipe, logged, pending, onLog }: {
  recipe: RecipeWithIngredients;
  logged: boolean;
  pending: boolean;
  onLog: () => void;
}) {
  const { colors } = useAppTheme();
  const each = perServing(recipeTotals(recipe.recipe_ingredients), Number(recipe.servings));

  return (
    <View style={[styles.recipeRow, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Link href={`/nutrition/recipe/${recipe.id}` as Href} asChild>
        <Pressable accessibilityLabel={`Open ${recipe.name}`} style={({ pressed }) => [styles.recipeCopy, { opacity: pressed ? 0.65 : 1 }]}>
          <RecipeImage path={recipe.image_path} />
          <View style={styles.flex}>
            <AppText variant="heading" numberOfLines={1}>{recipe.name}</AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>
              {Math.round(each.calories)} kcal · {Math.round(each.proteinGrams)}g protein per serving
            </AppText>
            <AppText variant="caption" color={colors.muted} numberOfLines={1}>
              Makes {Number(recipe.servings)} · {recipe.recipe_ingredients.length} ingredient{recipe.recipe_ingredients.length === 1 ? '' : 's'}
            </AppText>
          </View>
        </Pressable>
      </Link>
      <Pressable
        accessibilityLabel={`Log one serving of ${recipe.name}`}
        disabled={pending}
        onPress={onLog}
        style={({ pressed }) => [styles.logButton, { backgroundColor: logged ? colors.raised : colors.primary, opacity: pending ? 0.5 : pressed ? 0.72 : 1 }]}>
        <Ionicons name={logged ? 'checkmark' : 'add'} size={18} color={logged ? colors.primary : colors.onPrimary} />
        <AppText variant="caption" color={logged ? colors.primary : colors.onPrimary}>{pending ? 'Saving' : logged ? 'Logged' : 'Log'}</AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  addButton: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  mealPicker: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { minHeight: 42, flexGrow: 1, flexBasis: '30%', minWidth: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  list: { gap: spacing.sm },
  recipeRow: { minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recipeCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logButton: { minHeight: 42, minWidth: 70, flexShrink: 0, paddingHorizontal: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  flex: { flex: 1, minWidth: 0, gap: 2 },
});

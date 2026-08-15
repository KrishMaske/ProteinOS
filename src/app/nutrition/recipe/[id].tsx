import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import {
  perServing,
  pickRecipeImage,
  recipeTotals,
  signedRecipeImageUrl,
  type RecipeIngredient,
} from '@/features/nutrition/api/recipes';
import {
  useCreateRecipe,
  useDeleteRecipe,
  useRecipe,
  useUpdateRecipe,
} from '@/features/nutrition/hooks/use-recipes';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';

/** One editable ingredient row. Strings throughout so a half-typed number is not lost. */
type DraftIngredient = {
  key: string;
  name: string;
  quantity: string;
  unit: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

function emptyIngredient(): DraftIngredient {
  return { key: Math.random().toString(36).slice(2), name: '', quantity: '', unit: '', calories: '', protein: '', carbs: '', fat: '' };
}

function fromStored(item: RecipeIngredient): DraftIngredient {
  const text = (value: number | null) => value === null || value === undefined ? '' : String(Number(value));
  return {
    key: item.id,
    name: item.name,
    quantity: text(item.quantity),
    unit: item.unit ?? '',
    calories: text(item.calories),
    protein: text(item.protein_grams),
    carbs: text(item.carbohydrate_grams),
    fat: text(item.fat_grams),
  };
}

const number = (value: string) => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export default function RecipeEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const query = useRecipe(isNew ? '' : id);
  const create = useCreateRecipe();
  const update = useUpdateRecipe();
  const remove = useDeleteRecipe();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [servings, setServings] = useState('1');
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<DraftIngredient[]>([emptyIngredient()]);
  const [error, setError] = useState<string | null>(null);
  const [busyImage, setBusyImage] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Fill the form once the saved recipe arrives, without stamping over later edits.
  useEffect(() => {
    if (isNew || hydrated || !query.data) return;
    const recipe = query.data;
    setName(recipe.name);
    setDescription(recipe.description ?? '');
    setInstructions(recipe.instructions ?? '');
    setServings(String(Number(recipe.servings)));
    setImagePath(recipe.image_path);
    const sorted = [...recipe.recipe_ingredients].sort((a, b) => a.position - b.position);
    setIngredients(sorted.length ? sorted.map(fromStored) : [emptyIngredient()]);
    setHydrated(true);
  }, [hydrated, isNew, query.data]);

  const filled = ingredients.filter((item) => item.name.trim());
  const totals = recipeTotals(filled.map((item) => ({
    calories: number(item.calories),
    protein_grams: number(item.protein),
    carbohydrate_grams: number(item.carbs),
    fat_grams: number(item.fat),
    fiber_grams: null,
  }) as RecipeIngredient));
  const each = perServing(totals, number(servings) || 1);
  const pending = create.isPending || update.isPending;

  function setIngredient(key: string, patch: Partial<DraftIngredient>) {
    setIngredients((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  async function attachImage(source: 'camera' | 'library') {
    if (!user || busyImage) return;
    setError(null);
    setBusyImage(true);
    try {
      const path = await pickRecipeImage(user.id, source);
      if (path) setImagePath(path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add that photo.');
    } finally {
      setBusyImage(false);
    }
  }

  async function save() {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) return setError('Give the recipe a name.');
    if (!filled.length) return setError('Add at least one ingredient.');
    if (!(number(servings) > 0)) return setError('Servings must be greater than zero.');
    setError(null);

    const input = {
      name: trimmed,
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      servings: number(servings),
      imagePath,
      ingredients: filled.map((item) => ({
        name: item.name.trim(),
        quantity: item.quantity.trim() ? number(item.quantity) : null,
        unit: item.unit.trim() || null,
        grams: null,
        calories: number(item.calories),
        protein_grams: number(item.protein),
        carbohydrate_grams: number(item.carbs),
        fat_grams: number(item.fat),
        fiber_grams: null,
      })),
    };

    try {
      if (isNew) await create.mutateAsync({ userId: user.id, input });
      else await update.mutateAsync({ id, input });
      router.back();
    } catch {
      // The mutation error is rendered below the form.
    }
  }

  function confirmDelete() {
    Alert.alert('Delete recipe?', `${name || 'This recipe'} will be removed. Meals already logged from it stay in your history.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => remove.mutate({ id, imagePath }, { onSuccess: () => router.back() }),
      },
    ]);
  }

  if (!isNew && query.isLoading) return <Screen><LoadingState label="Loading recipe…" /></Screen>;
  if (!isNew && query.isError) return <Screen><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;

  return (
    <Screen
      footer={<Button disabled={pending} onPress={() => void save()}>{pending ? 'Saving…' : isNew ? 'Save recipe' : 'Save changes'}</Button>}
    >
      <Stack.Screen options={{ title: isNew ? 'New recipe' : 'Edit recipe' }} />

      <Card>
        <RecipePhoto path={imagePath} />
        <View style={styles.photoActions}>
          <Button variant="secondary" style={styles.photoAction} disabled={busyImage} onPress={() => void attachImage('camera')}>Take photo</Button>
          <Button variant="secondary" style={styles.photoAction} disabled={busyImage} onPress={() => void attachImage('library')}>Choose photo</Button>
        </View>
        {imagePath ? <Button variant="ghost" onPress={() => setImagePath(null)}>Remove photo</Button> : null}
      </Card>

      <Card>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Chicken and rice bowl" />
        <Field label="Servings this makes" value={servings} onChangeText={setServings} keyboardType="decimal-pad" placeholder="1" />
        <Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder="What it is, when you eat it" multiline numberOfLines={2} />
      </Card>

      <Card>
        <AppText variant="heading">Ingredients</AppText>
        <AppText variant="caption" color={colors.muted}>Macros for the whole recipe, not per serving.</AppText>
        {ingredients.map((item, index) => (
          <View key={item.key} style={[styles.ingredient, index > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={styles.ingredientHead}>
              <Field containerStyle={styles.flex} label={`Ingredient ${index + 1}`} value={item.name} onChangeText={(value) => setIngredient(item.key, { name: value })} placeholder="Chicken breast" />
              {ingredients.length > 1 ? (
                <Pressable
                  accessibilityLabel={`Remove ingredient ${index + 1}`}
                  hitSlop={8}
                  onPress={() => setIngredients((current) => current.filter((entry) => entry.key !== item.key))}
                  style={styles.removeIngredient}>
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.ingredientFields}>
              <Field containerStyle={styles.smallField} label="Qty" value={item.quantity} onChangeText={(value) => setIngredient(item.key, { quantity: value })} keyboardType="decimal-pad" placeholder="200" />
              <Field containerStyle={styles.smallField} label="Unit" value={item.unit} onChangeText={(value) => setIngredient(item.key, { unit: value })} placeholder="g" />
              <Field containerStyle={styles.smallField} label="Calories" value={item.calories} onChangeText={(value) => setIngredient(item.key, { calories: value })} keyboardType="decimal-pad" placeholder="0" />
            </View>
            <View style={styles.ingredientFields}>
              <Field containerStyle={styles.smallField} label="Protein (g)" value={item.protein} onChangeText={(value) => setIngredient(item.key, { protein: value })} keyboardType="decimal-pad" placeholder="0" />
              <Field containerStyle={styles.smallField} label="Carbs (g)" value={item.carbs} onChangeText={(value) => setIngredient(item.key, { carbs: value })} keyboardType="decimal-pad" placeholder="0" />
              <Field containerStyle={styles.smallField} label="Fat (g)" value={item.fat} onChangeText={(value) => setIngredient(item.key, { fat: value })} keyboardType="decimal-pad" placeholder="0" />
            </View>
          </View>
        ))}
        <Button variant="secondary" onPress={() => setIngredients((current) => [...current, emptyIngredient()])}>Add ingredient</Button>
      </Card>

      <Card>
        <AppText variant="heading">Per serving</AppText>
        <AppText>
          {Math.round(each.calories)} kcal · {Math.round(each.proteinGrams)}g protein · {Math.round(each.carbohydrateGrams)}g carbs · {Math.round(each.fatGrams)}g fat
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          Whole recipe: {Math.round(totals.calories)} kcal across {number(servings) || 1} serving{(number(servings) || 1) === 1 ? '' : 's'}
        </AppText>
      </Card>

      <Card>
        <Field label="Method (optional)" value={instructions} onChangeText={setInstructions} placeholder="Steps, timings, anything you want to remember" multiline numberOfLines={6} />
      </Card>

      {error ? <AppText color={colors.danger}>{error}</AppText> : null}
      {create.error || update.error || remove.error ? (
        <AppText color={colors.danger}>{create.error?.message ?? update.error?.message ?? remove.error?.message}</AppText>
      ) : null}
      {!isNew ? <Button variant="danger" disabled={remove.isPending} onPress={confirmDelete}>{remove.isPending ? 'Deleting…' : 'Delete recipe'}</Button> : null}
    </Screen>
  );
}

function RecipePhoto({ path }: { path: string | null }) {
  const { colors } = useAppTheme();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUri(null); return; }
    let cancelled = false;
    void signedRecipeImageUrl(path).then((url) => { if (!cancelled) setUri(url); });
    return () => { cancelled = true; };
  }, [path]);

  if (!path || !uri) {
    return (
      <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colors.raised }]}>
        <Ionicons name="camera-outline" size={28} color={colors.muted} />
        <AppText variant="caption" color={colors.muted}>Add a photo</AppText>
      </View>
    );
  }
  return <Image source={{ uri }} style={styles.photo} contentFit="cover" transition={160} accessibilityLabel="Recipe photo" />;
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  photoActions: { flexDirection: 'row', gap: spacing.sm },
  photoAction: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm },
  ingredient: { gap: spacing.sm, paddingTop: spacing.md },
  ingredientHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  removeIngredient: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ingredientFields: { flexDirection: 'row', gap: spacing.sm },
  smallField: { flex: 1, minWidth: 0 },
  flex: { flex: 1, minWidth: 0 },
});

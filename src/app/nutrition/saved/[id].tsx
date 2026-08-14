import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { spacing } from '@/constants/tokens';
import { useCreateSavedFood, useDeleteSavedFood, useSavedFood, useUpdateSavedFood } from '@/features/nutrition/hooks/use-nutrition';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';
import type { Tables } from '@/types/database';

type SavedFood = Tables<'saved_foods'>;

export default function SavedFoodEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const query = useSavedFood(id ?? '');
  if (!isNew && query.isLoading) return <Screen><Stack.Screen options={{ title: 'Edit saved food' }} /><LoadingState /></Screen>;
  if (!isNew && query.isError) return <Screen><Stack.Screen options={{ title: 'Edit saved food' }} /><ErrorState message={query.error.message} onRetry={() => query.refetch()} /></Screen>;
  if (!isNew && !query.data) return <Screen><ErrorState message="Saved food not found." /></Screen>;
  return <SavedFoodForm key={query.data?.updated_at ?? 'new'} food={query.data ?? null} />;
}

function SavedFoodForm({ food }: { food: SavedFood | null }) {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const create = useCreateSavedFood();
  const update = useUpdateSavedFood(food?.id ?? '');
  const remove = useDeleteSavedFood();
  const [name, setName] = useState(food?.name ?? '');
  const [quantity, setQuantity] = useState(food?.serving_quantity?.toString() ?? '1');
  const [unit, setUnit] = useState(food?.serving_unit ?? 'serving');
  const [grams, setGrams] = useState(food?.serving_grams?.toString() ?? '');
  const [calories, setCalories] = useState(food?.calories.toString() ?? '');
  const [protein, setProtein] = useState(food?.protein_grams.toString() ?? '');
  const [carbs, setCarbs] = useState(food?.carbohydrate_grams.toString() ?? '');
  const [fat, setFat] = useState(food?.fat_grams.toString() ?? '');
  const [fiber, setFiber] = useState(food?.fiber_grams?.toString() ?? '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const pending = create.isPending || update.isPending || remove.isPending;
  const mutationError = create.error ?? update.error ?? remove.error;

  function optionalPositive(value: string, label: string) {
    if (!value.trim()) return null;
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`);
    return parsed;
  }

  function nonnegative(value: string, label: string, required = false) {
    if (!value.trim()) {
      if (required) throw new Error(`${label} is required.`);
      return 0;
    }
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} cannot be negative.`);
    return parsed;
  }

  async function save() {
    if (!user || !name.trim()) return;
    setValidationError(null);
    try {
      const values = {
        name: name.trim(),
        serving_quantity: optionalPositive(quantity, 'Serving quantity'),
        serving_unit: unit.trim() || null,
        serving_grams: optionalPositive(grams, 'Serving grams'),
        calories: nonnegative(calories, 'Calories', true),
        protein_grams: nonnegative(protein, 'Protein'),
        carbohydrate_grams: nonnegative(carbs, 'Carbohydrates'),
        fat_grams: nonnegative(fat, 'Fat'),
        fiber_grams: fiber.trim() ? nonnegative(fiber, 'Fiber') : null,
      };
      if (food) await update.mutateAsync(values);
      else await create.mutateAsync({ ...values, user_id: user.id });
      router.back();
    } catch (caught) {
      if (caught instanceof Error && !('code' in caught)) setValidationError(caught.message);
    }
  }

  function confirmDelete() {
    if (!food) return;
    Alert.alert('Delete saved food?', `${food.name} will no longer be available for quick logging. Existing meal logs will stay unchanged.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(food.id, { onSuccess: () => router.back() }) },
    ]);
  }

  return (
    <Screen footer={<Button disabled={pending || !name.trim()} onPress={() => void save()}>{pending ? 'Saving…' : food ? 'Save changes' : 'Save food'}</Button>}>
      <Stack.Screen options={{ title: food ? 'Edit saved food' : 'New saved food' }} />
      <View style={styles.header}>
        <AppText variant="title">{food ? food.name : 'Save a food'}</AppText>
        <AppText color={colors.muted}>Use the nutrition facts for the serving you normally eat. You can edit them anytime.</AppText>
      </View>
      <Card>
        <Field label="Food name" value={name} onChangeText={setName} autoFocus={!food} maxLength={120} placeholder="Greek yogurt" />
        <View style={styles.fields}>
          <Field containerStyle={styles.field} label="Serving amount" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="1" />
          <Field containerStyle={styles.field} label="Unit" value={unit} onChangeText={setUnit} maxLength={40} placeholder="cup" />
          <Field containerStyle={styles.field} label="Serving grams (optional)" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" placeholder="225" />
        </View>
      </Card>
      <Card>
        <AppText variant="heading">Nutrition per serving</AppText>
        <View style={styles.fields}>
          <Field containerStyle={styles.field} label="Calories" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" placeholder="0" />
          <Field containerStyle={styles.field} label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder="0" />
          <Field containerStyle={styles.field} label="Carbohydrates (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" placeholder="0" />
          <Field containerStyle={styles.field} label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" placeholder="0" />
          <Field containerStyle={styles.field} label="Fiber (g, optional)" value={fiber} onChangeText={setFiber} keyboardType="decimal-pad" placeholder="0" />
        </View>
      </Card>
      {validationError || mutationError ? <AppText color={colors.danger}>{validationError ?? mutationError?.message}</AppText> : null}
      {food ? <Button variant="danger" disabled={pending} onPress={confirmDelete}>Delete saved food</Button> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { minWidth: 138, flexGrow: 1, flexBasis: 160 },
});

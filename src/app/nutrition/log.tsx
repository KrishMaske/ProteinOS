import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Field, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { deleteSavedFood } from '@/features/nutrition/api/nutrition';
import { useCreateFoodLog, useCreateSavedFood } from '@/features/nutrition/hooks/use-nutrition';
import { useAppTheme } from '@/hooks/use-app-theme';
import { localDateKey } from '@/lib/date';
import { useAuth } from '@/providers/auth-provider';
import type { Database } from '@/types/database';

const meals: Database['public']['Enums']['meal_type'][] = ['breakfast', 'lunch', 'dinner', 'snacks', 'other'];

export default function LogFoodScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const date = localDateKey();
  const mutation = useCreateFoodLog(date);
  const saveFood = useCreateSavedFood();
  const [name, setName] = useState('');
  const [meal, setMeal] = useState<Database['public']['Enums']['meal_type']>('other');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fiber, setFiber] = useState('');
  const [saveForLater, setSaveForLater] = useState(false);
  const [servingQuantity, setServingQuantity] = useState('1');
  const [servingUnit, setServingUnit] = useState('serving');
  const [servingGrams, setServingGrams] = useState('');
  const number = (value: string) => Math.max(0, Number(value) || 0);

  async function save() {
    if (!user || !name.trim()) return;
    let savedFoodId: string | null = null;
    try {
      if (saveForLater) {
        const saved = await saveFood.mutateAsync({
          user_id: user.id,
          name: name.trim(),
          serving_quantity: servingQuantity.trim() ? Math.max(0.001, number(servingQuantity)) : null,
          serving_unit: servingUnit.trim() || null,
          serving_grams: servingGrams.trim() ? Math.max(0.001, number(servingGrams)) : null,
          calories: number(calories),
          protein_grams: number(protein),
          carbohydrate_grams: number(carbs),
          fat_grams: number(fat),
          fiber_grams: fiber ? number(fiber) : null,
        });
        savedFoodId = saved.id;
      }
      await mutation.mutateAsync({
        userId: user.id,
        log: { user_id: user.id, logged_date: date, meal_type: meal, name: name.trim(), source: 'manual' },
        items: [{ food_log_id: '', name: name.trim(), quantity: servingQuantity.trim() ? number(servingQuantity) : null, unit: servingUnit.trim() || null, grams: servingGrams.trim() ? number(servingGrams) : null, calories: number(calories), protein_grams: number(protein), carbohydrate_grams: number(carbs), fat_grams: number(fat), fiber_grams: fiber ? number(fiber) : null }],
      });
      router.back();
    } catch {
      if (savedFoodId) await deleteSavedFood(savedFoodId).catch(() => undefined);
      // Mutation state renders the useful error without dismissing the form.
    }
  }

  return (
    <Screen footer={<Button disabled={!name.trim() || mutation.isPending || saveFood.isPending} onPress={save}>{mutation.isPending || saveFood.isPending ? 'Saving…' : 'Save meal'}</Button>}>
      <View style={styles.chips}>{meals.map((item) => <Choice key={item} active={meal === item} label={item} onPress={() => setMeal(item)} />)}</View>
      <Card>
        <Field label="Food or meal" value={name} onChangeText={setName} autoFocus />
        <Field label="Calories" keyboardType="decimal-pad" value={calories} onChangeText={setCalories} />
        <Field label="Protein (g)" keyboardType="decimal-pad" value={protein} onChangeText={setProtein} />
        <Field label="Carbohydrates (g)" keyboardType="decimal-pad" value={carbs} onChangeText={setCarbs} />
        <Field label="Fat (g)" keyboardType="decimal-pad" value={fat} onChangeText={setFat} />
        <Field label="Fiber (g, optional)" keyboardType="decimal-pad" value={fiber} onChangeText={setFiber} />
      </Card>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: saveForLater }}
        onPress={() => setSaveForLater((current) => !current)}
        style={[styles.saveToggle, { backgroundColor: colors.surface, borderColor: saveForLater ? colors.primary : colors.line }]}>
        <View style={[styles.checkbox, { backgroundColor: saveForLater ? colors.primary : colors.raised }]}>{saveForLater ? <Ionicons name="checkmark" size={17} color={colors.onPrimary} /> : null}</View>
        <View style={styles.toggleCopy}><AppText variant="heading">Save to My Foods</AppText><AppText variant="caption" color={colors.muted}>Reuse these facts for one-tap logging next time.</AppText></View>
      </Pressable>
      {saveForLater ? <Card><AppText variant="heading">Usual serving</AppText><View style={styles.servingFields}><Field containerStyle={styles.servingField} label="Amount" value={servingQuantity} onChangeText={setServingQuantity} keyboardType="decimal-pad" /><Field containerStyle={styles.servingField} label="Unit" value={servingUnit} onChangeText={setServingUnit} placeholder="serving" /><Field containerStyle={styles.servingField} label="Grams (optional)" value={servingGrams} onChangeText={setServingGrams} keyboardType="decimal-pad" /></View></Card> : null}
      {mutation.error || saveFood.error ? <AppText color={colors.danger}>{mutation.error?.message ?? saveFood.error?.message}</AppText> : null}
    </Screen>
  );
}

function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.chip, { backgroundColor: active ? colors.primary : colors.raised }]}><AppText variant="caption" color={active ? colors.onPrimary : colors.text}>{label}</AppText></Pressable>;
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Three per row keeps the five meals as two full rows instead of stranding one alone.
  chip: { minHeight: 44, flexGrow: 1, flexBasis: '30%', minWidth: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  saveToggle: { minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: { width: 28, height: 28, flexShrink: 0, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  toggleCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  servingFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  servingField: { minWidth: 120, flexGrow: 1, flexBasis: 140 },
});

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { AppText, Button, Card, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { getFoodLog } from '@/features/nutrition/api/nutrition';
import { useDeleteFoodLog, useFoodLog, useUpdateFoodLog } from '@/features/nutrition/hooks/use-nutrition';
import { useAppTheme } from '@/hooks/use-app-theme';

type DraftItem = { id: string; name: string; grams: string; calories: string; protein: string; carbs: string; fat: string; fiber: string };
type FoodLog = Awaited<ReturnType<typeof getFoodLog>>;

export default function EditFoodLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useFoodLog(id);
  if (query.isLoading) return <Screen><LoadingState /></Screen>;
  if (query.isError || !query.data) return <Screen><ErrorState message={query.error?.message ?? 'Food log not found'} /></Screen>;
  return <FoodLogEditor key={query.data.updated_at} foodLog={query.data} />;
}

function FoodLogEditor({ foodLog }: { foodLog: FoodLog }) {
  const { colors } = useAppTheme(); const update = useUpdateFoodLog(foodLog.id); const remove = useDeleteFoodLog();
  const [name, setName] = useState(foodLog.name ?? '');
  const [items, setItems] = useState<DraftItem[]>(() => foodLog.food_log_items.map((item) => ({ id: item.id, name: item.name, grams: item.grams?.toString() ?? '', calories: item.calories.toString(), protein: item.protein_grams.toString(), carbs: item.carbohydrate_grams.toString(), fat: item.fat_grams.toString(), fiber: item.fiber_grams?.toString() ?? '' })));
  const set = (index: number, key: keyof DraftItem, value: string) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item)); const number = (value: string) => Math.max(0, Number(value) || 0);
  async function save() { await update.mutateAsync({ log: { name: name.trim() || null }, items: items.map((item) => ({ id: item.id, values: { name: item.name, grams: item.grams ? number(item.grams) : null, calories: number(item.calories), protein_grams: number(item.protein), carbohydrate_grams: number(item.carbs), fat_grams: number(item.fat), fiber_grams: item.fiber ? number(item.fiber) : null } })) }); router.back(); }
  async function deleteEntry() { await remove.mutateAsync({ id: foodLog.id, photoPath: foodLog.photo_path }); router.back(); }
  function confirmDelete() { Alert.alert('Delete meal?', 'This food entry will be permanently removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void deleteEntry() }]); }
  return <Screen><Field label="Meal name" value={name} onChangeText={setName} />{items.map((item, index) => <Card key={item.id}><Field label="Food" value={item.name} onChangeText={(value) => set(index, 'name', value)} /><Field label="Portion (g)" keyboardType="decimal-pad" value={item.grams} onChangeText={(value) => set(index, 'grams', value)} /><Field label="Calories" keyboardType="decimal-pad" value={item.calories} onChangeText={(value) => set(index, 'calories', value)} /><Field label="Protein (g)" keyboardType="decimal-pad" value={item.protein} onChangeText={(value) => set(index, 'protein', value)} /><Field label="Carbs (g)" keyboardType="decimal-pad" value={item.carbs} onChangeText={(value) => set(index, 'carbs', value)} /><Field label="Fat (g)" keyboardType="decimal-pad" value={item.fat} onChangeText={(value) => set(index, 'fat', value)} /><Field label="Fiber (g)" keyboardType="decimal-pad" value={item.fiber} onChangeText={(value) => set(index, 'fiber', value)} /></Card>)}{update.error || remove.error ? <AppText color={colors.danger}>{update.error?.message ?? remove.error?.message}</AppText> : null}<Button disabled={update.isPending} onPress={save}>{update.isPending ? 'Saving…' : 'Save changes'}</Button><Button variant="danger" disabled={remove.isPending} onPress={confirmDelete}>Delete meal</Button></Screen>;
}

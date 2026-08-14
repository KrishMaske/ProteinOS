import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, EmptyState, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { spacing } from '@/constants/tokens';
import { useCreateBodyMetric, useDeleteBodyMetric, useProgressDashboard, useUpdateBodyMetric } from '@/features/progress/hooks/use-progress';
import {
  bodyMetricFormToUpdate,
  bodyMetricToFormValues,
  emptyBodyMetricForm,
  hasBodyMetricFormChanges,
  validateBodyMetricForm,
  type BodyMetricFormValues,
} from '@/features/progress/services/body-metric-form';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';
import type { Tables } from '@/types/database';

export default function LogProgressScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const rawId = params.id;
  const metricId = Array.isArray(rawId) ? rawId[0] : rawId;
  const dashboard = useProgressDashboard();
  const title = metricId ? 'Edit measurement' : 'Log measurement';

  if (dashboard.isLoading) return <><Stack.Screen options={{ title }} /><Screen><LoadingState label="Loading measurement…" /></Screen></>;
  if (dashboard.isError) return <><Stack.Screen options={{ title }} /><Screen><ErrorState message={dashboard.error.message} onRetry={() => dashboard.refetch()} /></Screen></>;

  const data = dashboard.data!;
  const metric = metricId ? data.metrics.find((item) => item.id === metricId) : undefined;
  if (metricId && !metric) {
    return <><Stack.Screen options={{ title }} /><Screen><EmptyState title="Measurement not found" description="It may have been removed or is no longer available." action={<Button onPress={() => router.back()}>Close</Button>} /></Screen></>;
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <MetricForm imperial={data.preferredUnits === 'imperial'} metric={metric} />
    </>
  );
}

function MetricForm({ imperial, metric }: { imperial: boolean; metric?: Tables<'body_metrics'> }) {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const createMutation = useCreateBodyMetric();
  const updateMutation = useUpdateBodyMetric();
  const deleteMutation = useDeleteBodyMetric();
  const [initialValues] = useState<BodyMetricFormValues>(() => metric ? bodyMetricToFormValues(metric, imperial) : emptyBodyMetricForm);
  const [values, setValues] = useState<BodyMetricFormValues>(() => ({ ...initialValues }));
  const validation = validateBodyMetricForm(values);
  const editing = Boolean(metric);
  const hasChanges = !editing || hasBodyMetricFormChanges(values, initialValues);
  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const mutationError = deleteMutation.error ?? (editing ? updateMutation.error : createMutation.error);
  const lengthUnit = imperial ? 'in' : 'cm';

  function setField(field: keyof BodyMetricFormValues, value: string) {
    createMutation.reset();
    updateMutation.reset();
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    if (!user || !validation.isValid || !hasChanges) return;
    const input = bodyMetricFormToUpdate(values, imperial, metric ? initialValues : undefined);
    try {
      if (metric) await updateMutation.mutateAsync({ id: metric.id, userId: user.id, input });
      else await createMutation.mutateAsync({ user_id: user.id, ...input });
      router.back();
    } catch {
      // Keep the form in place so the user can correct or retry it.
    }
  }

  async function remove() {
    if (!user || !metric) return;
    try {
      await deleteMutation.mutateAsync({ id: metric.id, userId: user.id });
      router.back();
    } catch {
      // The mutation error is rendered below the form.
    }
  }

  function confirmDelete() {
    if (!metric) return;
    const measuredOn = new Date(metric.measured_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    Alert.alert('Delete measurement?', `The reading from ${measuredOn} will be permanently removed from your trends.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void remove() },
    ]);
  }

  const footer = (
    <View style={styles.footerActions}>
      <Button disabled={pending} onPress={() => router.back()} style={styles.footerButton} variant="secondary">Cancel</Button>
      <Button disabled={!validation.isValid || !hasChanges || pending} onPress={() => void save()} style={styles.footerButton}>
        {pending ? (editing ? 'Updating…' : 'Saving…') : (editing ? 'Update measurement' : 'Save measurement')}
      </Button>
    </View>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.header}>
        <AppText variant="heading">{editing ? 'Update measurement' : 'New measurement'}</AppText>
        <AppText color={colors.muted}>{metric ? new Date(metric.measured_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Enter any measurements you took.'}</AppText>
      </View>
      <Card>
        <AppText variant="heading">Measurements</AppText>
        <View style={styles.fields}>
          <Field containerStyle={styles.field} error={validation.errors.weight} label={`Weight (${imperial ? 'lb' : 'kg'})`} keyboardType="decimal-pad" value={values.weight} onChangeText={(value) => setField('weight', value)} selectTextOnFocus />
          <Field containerStyle={styles.field} error={validation.errors.waist} label={`Waist (${lengthUnit})`} keyboardType="decimal-pad" value={values.waist} onChangeText={(value) => setField('waist', value)} selectTextOnFocus />
          <Field containerStyle={styles.field} error={validation.errors.bodyFat} label="Body fat (%)" keyboardType="decimal-pad" value={values.bodyFat} onChangeText={(value) => setField('bodyFat', value)} selectTextOnFocus />
        </View>
      </Card>
      <Card>
        <AppText variant="heading">Optional</AppText>
        <View style={styles.fields}>
          <Field containerStyle={styles.field} error={validation.errors.chest} label={`Chest (${lengthUnit})`} keyboardType="decimal-pad" value={values.chest} onChangeText={(value) => setField('chest', value)} selectTextOnFocus />
          <Field containerStyle={styles.field} error={validation.errors.arm} label={`Arm (${lengthUnit})`} keyboardType="decimal-pad" value={values.arm} onChangeText={(value) => setField('arm', value)} selectTextOnFocus />
          <Field containerStyle={styles.field} error={validation.errors.thigh} label={`Thigh (${lengthUnit})`} keyboardType="decimal-pad" value={values.thigh} onChangeText={(value) => setField('thigh', value)} selectTextOnFocus />
        </View>
      </Card>
      <Card><Field label="Notes" value={values.notes} onChangeText={(value) => setField('notes', value)} multiline placeholder="Optional context" /></Card>
      {mutationError ? <AppText color={colors.danger}>{mutationError.message}</AppText> : null}
      {editing ? (
        <Button disabled={pending} onPress={confirmDelete} variant="danger">
          {deleteMutation.isPending ? 'Deleting…' : 'Delete measurement'}
        </Button>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minWidth: 0, gap: spacing.xs },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  field: { flexGrow: 1, flexBasis: 125 },
  footerActions: { flexDirection: 'row', gap: spacing.sm },
  footerButton: { flex: 1 },
});

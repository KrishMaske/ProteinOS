import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  ErrorState,
  Field,
  LoadingState,
  ProgressBar,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { calculateNutritionTargets } from '@/features/nutrition/services/nutrition-targets';
import { saveOnboarding } from '@/features/onboarding/api/save-onboarding';
import { onboardingSchema, type OnboardingValues } from '@/features/onboarding/schema';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/providers/auth-provider';

const goals = ['recomp', 'fat_loss', 'muscle_gain', 'maintenance', 'strength'] as const;
const experience = ['beginner', 'intermediate', 'advanced'] as const;
const sexes = ['male', 'female', 'unspecified'] as const;
const INCHES_TO_CM = 2.54;
const POUNDS_TO_KG = 0.45359237;
const stepFields: (keyof OnboardingValues)[][] = [
  ['displayName', 'age', 'height', 'weight', 'preferredUnits', 'biologicalSex'],
  ['goalType', 'trainingExperience', 'trainingDaysPerWeek', 'preferredSessionMinutes', 'equipment', 'exercisesToAvoid'],
  ['dietPreference', 'calorieTarget', 'proteinTarget', 'carbohydrateTarget', 'fatTarget'],
];
const steps = [
  { eyebrow: 'Your profile', title: 'Start with the basics', description: 'We use this to set units and sensible starting targets.' },
  { eyebrow: 'Your training', title: 'Build around your week', description: 'Choose a direction now. Your routine can still change anytime.' },
  { eyebrow: 'Your nutrition', title: 'Set simple defaults', description: 'Add targets if you have them, or let ProteinOS estimate a starting point.' },
] as const;

export default function OnboardingScreen() {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { isLoading, isOnboarded, profileError, refreshProfile, user } = useAuth();
  const [step, setStep] = useState(0);
  const submitLockRef = useRef(false);
  const saveCompletedRef = useRef(false);
  const compact = width < 560;
  const {
    clearErrors,
    control,
    handleSubmit,
    setError,
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      displayName: '',
      age: 30,
      height: 175,
      weight: 75,
      preferredUnits: 'metric',
      biologicalSex: 'unspecified',
      goalType: 'recomp',
      trainingExperience: 'beginner',
      trainingDaysPerWeek: 3,
      preferredSessionMinutes: 60,
      equipment: '',
      exercisesToAvoid: '',
      dietPreference: '',
      calorieTarget: '',
      proteinTarget: '',
      carbohydrateTarget: '',
      fatTarget: '',
    },
  });

  const [units, selectedSex, selectedGoal, selectedExperience, age, height, weight, trainingDays] = useWatch({
    control,
    name: ['preferredUnits', 'biologicalSex', 'goalType', 'trainingExperience', 'age', 'height', 'weight', 'trainingDaysPerWeek'],
  });
  const measurementsReady = [age, height, weight].every((value) => Number.isFinite(value) && value > 0);
  const estimate = measurementsReady
    ? calculateNutritionTargets({
        weightKg: units === 'imperial' ? weight * POUNDS_TO_KG : weight,
        heightCm: units === 'imperial' ? height * INCHES_TO_CM : height,
        age,
        biologicalSex: selectedSex,
        trainingDaysPerWeek: trainingDays,
        goalType: selectedGoal,
      })
    : null;

  async function nextStep() {
    clearErrors('root');
    const isValid = await trigger(stepFields[step], { shouldFocus: true });
    if (isValid) setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function submit(values: OnboardingValues) {
    if (!user || submitLockRef.current) return;
    submitLockRef.current = true;
    clearErrors('root');
    try {
      if (!saveCompletedRef.current) {
        await saveOnboarding(user.id, values);
        saveCompletedRef.current = true;
      }
      await refreshProfile();
      router.replace('/(tabs)/today');
    } catch (error) {
      setError('root', { message: error instanceof Error ? error.message : 'Could not save your profile' });
    } finally {
      submitLockRef.current = false;
    }
  }

  if (isLoading) return <Screen scroll={false}><LoadingState label="Loading your setup…" /></Screen>;
  if (!user) return <Redirect href="/(auth)/login" />;
  if (profileError) {
    return <Screen scroll={false}><ErrorState message={profileError} onRetry={() => void refreshProfile().catch(() => undefined)} /></Screen>;
  }
  if (isOnboarded) return <Redirect href="/(tabs)/today" />;

  const footer = (
    <View style={styles.footerRow}>
      {step > 0 ? (
        <Button
          accessibilityLabel="Go to the previous setup step"
          disabled={isSubmitting}
          onPress={() => setStep((current) => Math.max(0, current - 1))}
          style={styles.footerButton}
          variant="secondary">
          Back
        </Button>
      ) : null}
      {step < steps.length - 1 ? (
        <Button accessibilityLabel="Continue setup" onPress={() => void nextStep()} style={styles.footerButton}>
          Continue
        </Button>
      ) : (
        <Button disabled={isSubmitting} onPress={handleSubmit(submit)} style={styles.footerButton}>
          {isSubmitting ? 'Saving your plan…' : 'Finish setup'}
        </Button>
      )}
    </View>
  );

  return (
    <Screen footer={footer} safeEdges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.intro}>
        <View style={styles.stepLine}>
          <AppText variant="eyebrow" color={colors.primary}>{steps[step].eyebrow}</AppText>
          <AppText variant="caption" color={colors.muted}>{step + 1} of {steps.length}</AppText>
        </View>
        <ProgressBar label={`Setup step ${step + 1} of ${steps.length}`} value={((step + 1) / steps.length) * 100} />
        <AppText variant="title">{steps[step].title}</AppText>
        <AppText color={colors.muted}>{steps[step].description}</AppText>
      </View>

      {step === 0 ? (
        <Card>
          <SectionHeader title="About you" />
          <Controller
            control={control}
            name="displayName"
            render={({ field }) => (
              <Field
                autoCapitalize="words"
                autoComplete="name"
                error={errors.displayName?.message}
                label="What should we call you?"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="Your name"
                returnKeyType="next"
                value={field.value}
              />
            )}
          />
          <ChoiceRow
            label="Preferred units"
            values={['metric', 'imperial']}
            selected={units}
            onChange={(value) => setValue('preferredUnits', value, { shouldDirty: true, shouldValidate: true })}
          />
          <View style={[styles.row, compact && styles.stack]}>
            <Controller
              control={control}
              name="age"
              render={({ field }) => (
                <Field
                  containerStyle={styles.flex}
                  error={errors.age?.message}
                  keyboardType="number-pad"
                  label="Age"
                  onBlur={field.onBlur}
                  onChangeText={(value) => field.onChange(value === '' ? Number.NaN : Number(value))}
                  selectTextOnFocus
                  value={numberText(field.value)}
                />
              )}
            />
            <Controller
              control={control}
              name="height"
              render={({ field }) => (
                <Field
                  containerStyle={styles.flex}
                  error={errors.height?.message}
                  keyboardType="decimal-pad"
                  label={units === 'metric' ? 'Height (cm)' : 'Height (in)'}
                  onBlur={field.onBlur}
                  onChangeText={(value) => field.onChange(value === '' ? Number.NaN : Number(value))}
                  selectTextOnFocus
                  value={numberText(field.value)}
                />
              )}
            />
            <Controller
              control={control}
              name="weight"
              render={({ field }) => (
                <Field
                  containerStyle={styles.flex}
                  error={errors.weight?.message}
                  keyboardType="decimal-pad"
                  label={units === 'metric' ? 'Weight (kg)' : 'Weight (lb)'}
                  onBlur={field.onBlur}
                  onChangeText={(value) => field.onChange(value === '' ? Number.NaN : Number(value))}
                  selectTextOnFocus
                  value={numberText(field.value)}
                />
              )}
            />
          </View>
          <ChoiceRow
            label="Biological sex"
            values={sexes}
            selected={selectedSex}
            onChange={(value) => setValue('biologicalSex', value, { shouldDirty: true, shouldValidate: true })}
          />
          <AppText variant="caption" color={colors.muted}>
            Used only to pick the right metabolic-rate constant. Choose Unspecified to skip it and
            we will use a neutral average.
          </AppText>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <SectionHeader title="Training preferences" />
          <ChoiceRow
            label="Primary goal"
            values={goals}
            selected={selectedGoal}
            onChange={(value) => setValue('goalType', value, { shouldDirty: true, shouldValidate: true })}
          />
          <ChoiceRow
            label="Experience"
            values={experience}
            selected={selectedExperience}
            onChange={(value) => setValue('trainingExperience', value, { shouldDirty: true, shouldValidate: true })}
          />
          <View style={[styles.row, compact && styles.stack]}>
            <Controller
              control={control}
              name="trainingDaysPerWeek"
              render={({ field }) => (
                <Field
                  containerStyle={styles.flex}
                  error={errors.trainingDaysPerWeek?.message}
                  keyboardType="number-pad"
                  label="Days per week"
                  onBlur={field.onBlur}
                  onChangeText={(value) => field.onChange(value === '' ? Number.NaN : Number(value))}
                  selectTextOnFocus
                  value={numberText(field.value)}
                />
              )}
            />
            <Controller
              control={control}
              name="preferredSessionMinutes"
              render={({ field }) => (
                <Field
                  containerStyle={styles.flex}
                  error={errors.preferredSessionMinutes?.message}
                  keyboardType="number-pad"
                  label="Minutes per session"
                  onBlur={field.onBlur}
                  onChangeText={(value) => field.onChange(value === '' ? Number.NaN : Number(value))}
                  selectTextOnFocus
                  value={numberText(field.value)}
                />
              )}
            />
          </View>
          <Controller
            control={control}
            name="equipment"
            render={({ field }) => (
              <Field
                autoCapitalize="sentences"
                label="Equipment you can use"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="Barbell, dumbbells, cables"
                value={field.value}
              />
            )}
          />
          <Controller
            control={control}
            name="exercisesToAvoid"
            render={({ field }) => (
              <Field
                autoCapitalize="sentences"
                label="Movements to avoid (optional)"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="Anything uncomfortable or unavailable"
                value={field.value}
              />
            )}
          />
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <SectionHeader title="Nutrition defaults" />
          <Controller
            control={control}
            name="dietPreference"
            render={({ field }) => (
              <Field
                autoCapitalize="sentences"
                label="Diet preference (optional)"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="No preference, vegetarian, halal…"
                value={field.value}
              />
            )}
          />
          <View style={[styles.row, compact && styles.stack]}>
            <OptionalNumberField control={control} error={errors.calorieTarget?.message} label="Calories" name="calorieTarget" placeholder={estimate ? String(estimate.calories) : 'Auto'} />
            <OptionalNumberField control={control} error={errors.proteinTarget?.message} label="Protein (g)" name="proteinTarget" placeholder={estimate ? String(estimate.proteinGrams) : 'Auto'} />
          </View>
          <View style={[styles.row, compact && styles.stack]}>
            <OptionalNumberField control={control} error={errors.carbohydrateTarget?.message} label="Carbs (g)" name="carbohydrateTarget" placeholder={estimate ? String(estimate.carbohydrateGrams) : 'Auto'} />
            <OptionalNumberField control={control} error={errors.fatTarget?.message} label="Fat (g)" name="fatTarget" placeholder={estimate ? String(estimate.fatGrams) : 'Auto'} />
          </View>
          <View style={[styles.estimateNote, { backgroundColor: colors.raised }]}>
            {estimate ? (
              <>
                <AppText variant="caption" color={colors.primary}>
                  Estimated from your profile
                </AppText>
                <AppText variant="caption" color={colors.muted}>
                  Resting burn {estimate.basalMetabolicRate} kcal · maintenance{' '}
                  {estimate.maintenanceCalories} kcal · {choiceLabel(selectedGoal).toLowerCase()} target{' '}
                  {estimate.calories} kcal
                </AppText>
              </>
            ) : null}
            <AppText variant="caption" color={colors.muted}>
              Leave any target blank to use the estimate. You can change it later in Settings.
            </AppText>
          </View>
        </Card>
      ) : null}

      {errors.root?.message ? <AppText color={colors.danger}>{errors.root.message}</AppText> : null}
    </Screen>
  );
}

type OptionalNumberName = 'calorieTarget' | 'proteinTarget' | 'carbohydrateTarget' | 'fatTarget';

function OptionalNumberField({
  control,
  error,
  label,
  name,
  placeholder = 'Auto',
}: {
  control: ReturnType<typeof useForm<OnboardingValues>>['control'];
  error?: string;
  label: string;
  name: OptionalNumberName;
  placeholder?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field
          containerStyle={styles.flex}
          error={error}
          keyboardType="number-pad"
          label={label}
          onBlur={field.onBlur}
          onChangeText={(value) => field.onChange(value === '' ? '' : Number(value))}
          placeholder={placeholder}
          selectTextOnFocus
          value={field.value === '' || field.value === undefined ? '' : String(field.value)}
        />
      )}
    />
  );
}

function ChoiceRow<T extends string>({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.choiceWrap}>
      <AppText variant="caption">{label}</AppText>
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {values.map((value) => {
          const checked = selected === value;
          return (
            <Pressable
              accessibilityLabel={choiceLabel(value)}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              key={value}
              onPress={() => onChange(value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: checked ? colors.primary : colors.raised,
                  borderColor: checked ? colors.primary : colors.line,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}>
              <AppText variant="caption" color={checked ? colors.onPrimary : colors.text}>{choiceLabel(value)}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function choiceLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function numberText(value: number) {
  return Number.isFinite(value) ? String(value) : '';
}

const styles = StyleSheet.create({
  intro: { gap: spacing.md },
  stepLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  stack: { flexDirection: 'column' },
  flex: { flex: 1, minWidth: 0, width: '100%' },
  choiceWrap: { gap: spacing.sm },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  estimateNote: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  footerRow: { width: '100%', maxWidth: 720, alignSelf: 'center', flexDirection: 'row', gap: spacing.md },
  footerButton: { flex: 1 },
});

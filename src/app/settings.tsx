import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText, Button, ErrorState, Field, LoadingState, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { estimateTargetsFromSettings } from '@/features/settings/api/settings';
import { ageFromBirthDate } from '@/features/nutrition/services/nutrition-targets';
import { useRecalculateNutritionTargets, useSettings, useUpdateBodyMeasurements, useUpdateFitnessGoal, useUpdateSettings } from '@/features/settings/hooks/use-settings';
import { useAppTheme } from '@/hooks/use-app-theme';
import { supabase } from '@/lib/supabase/client';
import { cmToIn, inToCm, kgToLb, lbToKg } from '@/lib/units';
import { useAuth } from '@/providers/auth-provider';
import { useActiveWorkoutStore } from '@/store/active-workout-store';
import { themePreferences, type ThemePreference } from '@/theme/theme-preference';
import type { Database } from '@/types/database';

type Goal = Database['public']['Enums']['goal_type'];
type Sex = Database['public']['Enums']['biological_sex'];
type Activity = Database['public']['Enums']['daily_activity_level'];
type Selector = 'goal' | 'days' | 'minutes' | 'sex' | 'activity';

const goals: Goal[] = ['recomp', 'fat_loss', 'muscle_gain', 'maintenance', 'strength'];
const goalLabels: Record<Goal, string> = {
  recomp: 'Recomposition',
  fat_loss: 'Fat loss',
  muscle_gain: 'Build muscle',
  maintenance: 'Maintain',
  strength: 'Strength',
};
const activityLevels: Activity[] = ['sedentary', 'light', 'moderate', 'very_active'];
const activityLabels: Record<Activity, string> = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderately active',
  very_active: 'Very active',
};
/** Describes life outside the gym: training is counted separately. */
const activityHints: Record<Activity, string> = {
  sedentary: 'Desk job, little walking',
  light: 'Some walking most days',
  moderate: 'On your feet a lot',
  very_active: 'Physical job or always moving',
};
const sexes: Sex[] = ['male', 'female', 'unspecified'];
const sexLabels: Record<Sex, string> = { male: 'Male', female: 'Female', unspecified: 'Prefer not to say' };

export default function SettingsScreen() {
  const { user } = useAuth();
  const { colors, preference, setPreference } = useAppTheme();
  const query = useSettings();
  const update = useUpdateSettings();
  const updateGoal = useUpdateFitnessGoal();
  const recalculate = useRecalculateNutritionTargets();
  const clearActiveWorkout = useActiveWorkoutStore((state) => state.clear);
  const [openSelector, setOpenSelector] = useState<Selector | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLogoutError(error.message);
      setLoggingOut(false);
      return;
    }
    clearActiveWorkout();
    router.replace('/');
  }

  if (query.isLoading) return <Screen><LoadingState /></Screen>;
  if (query.isError || !query.data) return <Screen><ErrorState message={query.error?.message ?? 'Settings unavailable'} onRetry={() => query.refetch()} /></Screen>;

  const { profile, goal, target, latestWeight, trend } = query.data;
  const estimate = estimateTargetsFromSettings(query.data);
  const targetsMatchEstimate = Boolean(
    estimate && target &&
    Number(target.calories) === estimate.calories &&
    Number(target.protein_grams) === estimate.proteinGrams &&
    Number(target.carbohydrate_grams) === estimate.carbohydrateGrams &&
    Number(target.fat_grams) === estimate.fatGrams,
  );
  const dayOptions = [1, 2, 3, 4, 5, 6, 7];
  const minuteOptions = [...new Set([15, 30, 45, 60, 75, 90, 120, profile.preferred_session_minutes]
    .filter((value): value is number => value !== null))].sort((a, b) => a - b);
  const deletingPhotos = update.isPending && typeof update.variables?.delete_food_photo_after_analysis === 'boolean'
    ? update.variables.delete_food_photo_after_analysis
    : profile.delete_food_photo_after_analysis;

  function toggleSelector(selector: Selector) {
    setOpenSelector((current) => current === selector ? null : selector);
  }

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={[styles.account, { backgroundColor: colors.surface }]}>
        <View style={[styles.avatar, { backgroundColor: colors.softAccent }]}>
          <Ionicons name="person" size={22} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <AppText variant="heading" numberOfLines={1}>{profile.display_name || 'Your account'}</AppText>
          <AppText variant="caption" color={colors.muted} numberOfLines={1}>{user?.email}</AppText>
        </View>
      </View>

      <SettingsSection title="Appearance">
        <View accessibilityRole="radiogroup" style={[styles.segmented, { backgroundColor: colors.raised }]}>
          {themePreferences.map((value) => (
            <ThemeChoice key={value} value={value} active={preference === value} onPress={() => void setPreference(value)} />
          ))}
        </View>
      </SettingsSection>

      <SettingsSection title="Training">
        <SelectorRow
          expanded={openSelector === 'goal'}
          label="Primary goal"
          value={goal ? goalLabels[goal.goal_type] : 'Not set'}
          onPress={() => toggleSelector('goal')}
        />
        {openSelector === 'goal' ? (
          <OptionGrid>
            {goals.map((value) => (
              <Choice
                key={value}
                active={goal?.goal_type === value}
                disabled={updateGoal.isPending}
                label={goalLabels[value]}
                onPress={() => {
                  setOpenSelector(null);
                  updateGoal.mutate(value);
                }}
              />
            ))}
          </OptionGrid>
        ) : null}
        <Divider />
        <SelectorRow
          expanded={openSelector === 'days'}
          label="Training days"
          value={profile.training_days_per_week ? `${profile.training_days_per_week} per week` : 'Not set'}
          onPress={() => toggleSelector('days')}
        />
        {openSelector === 'days' ? (
          <OptionGrid>
            {dayOptions.map((days) => (
              <Choice
                key={days}
                active={profile.training_days_per_week === days}
                disabled={update.isPending}
                label={`${days} day${days === 1 ? '' : 's'}`}
                onPress={() => {
                  setOpenSelector(null);
                  update.mutate({ training_days_per_week: days });
                }}
              />
            ))}
          </OptionGrid>
        ) : null}
        <Divider />
        <SelectorRow
          expanded={openSelector === 'activity'}
          label="Daily activity"
          value={activityLabels[profile.daily_activity_level]}
          onPress={() => toggleSelector('activity')}
        />
        {openSelector === 'activity' ? (
          <>
            <AppText variant="caption" color={colors.muted}>
              Your day outside training. Workouts are counted separately from how often and how long you train.
            </AppText>
            <OptionGrid>
              {activityLevels.map((value) => (
                <Choice
                  key={value}
                  active={profile.daily_activity_level === value}
                  disabled={update.isPending}
                  label={`${activityLabels[value]} · ${activityHints[value]}`}
                  onPress={() => {
                    setOpenSelector(null);
                    update.mutate({ daily_activity_level: value });
                  }}
                />
              ))}
            </OptionGrid>
          </>
        ) : null}
        <Divider />
        <SelectorRow
          expanded={openSelector === 'minutes'}
          label="Session length"
          value={profile.preferred_session_minutes ? `${profile.preferred_session_minutes} minutes` : 'Not set'}
          onPress={() => toggleSelector('minutes')}
        />
        {openSelector === 'minutes' ? (
          <OptionGrid>
            {minuteOptions.map((minutes) => (
              <Choice
                key={minutes}
                active={profile.preferred_session_minutes === minutes}
                disabled={update.isPending}
                label={`${minutes} min`}
                onPress={() => {
                  setOpenSelector(null);
                  update.mutate({ preferred_session_minutes: minutes });
                }}
              />
            ))}
          </OptionGrid>
        ) : null}
        <Divider />
        <SelectorRow
          expanded={openSelector === 'sex'}
          label="Biological sex"
          value={profile.biological_sex ? sexLabels[profile.biological_sex] : 'Not set'}
          onPress={() => toggleSelector('sex')}
        />
        {openSelector === 'sex' ? (
          <OptionGrid>
            {sexes.map((value) => (
              <Choice
                key={value}
                active={profile.biological_sex === value}
                disabled={update.isPending}
                label={sexLabels[value]}
                onPress={() => {
                  setOpenSelector(null);
                  update.mutate({ biological_sex: value });
                }}
              />
            ))}
          </OptionGrid>
        ) : null}
      </SettingsSection>

      <SettingsSection title="Body">
        <BodyMeasurements
          birthDate={profile.birth_date}
          key={`${profile.height_cm}-${profile.target_weight_kg}-${latestWeight?.measured_at ?? 'none'}`}
          heightCm={profile.height_cm === null ? null : Number(profile.height_cm)}
          imperial={profile.preferred_units === 'imperial'}
          targetWeightKg={profile.target_weight_kg === null ? null : Number(profile.target_weight_kg)}
          weightKg={latestWeight?.weight_kg === null || latestWeight?.weight_kg === undefined ? null : Number(latestWeight.weight_kg)}
        />
      </SettingsSection>

      <SettingsSection title="Nutrition targets">
        {target ? (
          <View style={styles.targetGrid}>
            <TargetStat label="Calories" value={`${Math.round(Number(target.calories))}`} unit="kcal" />
            <TargetStat label="Protein" value={`${Math.round(Number(target.protein_grams))}`} unit="g" />
            <TargetStat label="Carbs" value={`${Math.round(Number(target.carbohydrate_grams))}`} unit="g" />
            <TargetStat label="Fat" value={`${Math.round(Number(target.fat_grams))}`} unit="g" />
          </View>
        ) : (
          <AppText variant="caption" color={colors.muted}>No targets set yet.</AppText>
        )}
        {estimate ? (
          <>
            <AppText variant="caption" color={colors.muted}>
              {targetsMatchEstimate
                ? `Up to date · resting burn ${estimate.basalMetabolicRate} kcal, maintenance ${estimate.maintenanceCalories} kcal.`
                : `Your data suggests ${estimate.calories} kcal · ${estimate.proteinGrams}P / ${estimate.carbohydrateGrams}C / ${estimate.fatGrams}F.`}
            </AppText>
            <AppText variant="caption" color={colors.muted}>
              {estimate.maintenanceFromObservation
                ? `Maintenance measured from your logged intake and weight trend${trend ? ` (${formatTrend(trend.changeKgPerWeek, profile.preferred_units === 'imperial')}).` : '.'}`
                : 'Maintenance is estimated from height, weight, age, sex, and training days. Log weight and meals for a few weeks and it switches to your measured rate.'}
            </AppText>
            {estimate.goalAdjustmentScale < 1 && profile.target_weight_kg !== null ? (
              <AppText variant="caption" color={colors.muted}>
                Eased to {Math.round(estimate.goalAdjustmentScale * 100)}% of the usual adjustment because you are close to your goal weight.
              </AppText>
            ) : null}
          </>
        ) : (
          <AppText variant="caption" color={colors.muted}>
            Add your height, birth date, and a logged weight above to derive targets automatically.
          </AppText>
        )}
      </SettingsSection>

      <SettingsSection title="Everything derived">
        <AppText variant="caption" color={colors.muted}>
          Targets re-derive on their own whenever an input changes. Use this if you want to
          force it, or after logging older measurements.
        </AppText>
        <Pressable
          accessibilityRole="button"
          disabled={recalculate.isPending}
          onPress={() => recalculate.mutate()}
          style={({ pressed }) => [
            styles.recalculate,
            {
              backgroundColor: colors.softAccent,
              opacity: recalculate.isPending ? 0.45 : pressed ? 0.72 : 1,
            },
          ]}
        >
          <Ionicons name="refresh" size={18} color={colors.primary} />
          <AppText variant="caption" color={colors.primary}>
            {recalculate.isPending ? 'Recalculating…' : 'Recalculate everything'}
          </AppText>
        </Pressable>
        {recalculate.isSuccess && !recalculate.isPending ? (
          <AppText variant="caption" color={colors.primary}>
            Recalculated {recalculate.data?.calories} kcal · {recalculate.data?.proteinGrams}g protein
          </AppText>
        ) : null}
        {recalculate.error ? <AppText variant="caption" color={colors.danger}>{recalculate.error.message}</AppText> : null}
      </SettingsSection>

      <SettingsSection title="Units">
        <View accessibilityRole="radiogroup" style={[styles.segmented, { backgroundColor: colors.raised }]}>
          {(['metric', 'imperial'] as const).map((unit) => (
            <Choice
              key={unit}
              active={profile.preferred_units === unit}
              disabled={update.isPending}
              fill
              label={unit === 'metric' ? 'Metric' : 'Imperial'}
              onPress={() => update.mutate({ preferred_units: unit })}
            />
          ))}
        </View>
      </SettingsSection>

      <SettingsSection title="Privacy">
        <View style={styles.privacyRow}>
          <View style={styles.flex}>
            <AppText variant="heading">Delete food photos</AppText>
            <AppText variant="caption" color={colors.muted}>Remove the source photo after saving the reviewed meal.</AppText>
          </View>
          <Switch
            accessibilityLabel="Delete food photos after saving"
            disabled={update.isPending}
            onValueChange={(value) => update.mutate({ delete_food_photo_after_analysis: value })}
            thumbColor={deletingPhotos ? colors.onPrimary : colors.surface}
            trackColor={{ false: colors.raised, true: colors.primary }}
            value={deletingPhotos}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Security">
        <ChangePassword email={user?.email ?? null} />
      </SettingsSection>

      {update.error || updateGoal.error ? (
        <AppText variant="caption" color={colors.danger}>{update.error?.message ?? updateGoal.error?.message}</AppText>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={loggingOut}
        onPress={() => void logout()}
        style={({ pressed }) => [styles.logout, { backgroundColor: colors.surface, opacity: loggingOut ? 0.5 : pressed ? 0.7 : 1 }]}
      >
        <Ionicons name="log-out-outline" size={21} color={colors.danger} />
        <AppText color={colors.danger}>{loggingOut ? 'Logging out…' : 'Log out'}</AppText>
      </Pressable>
      {logoutError ? <AppText variant="caption" color={colors.danger}>{logoutError}</AppText> : null}
    </Screen>
  );
}

/**
 * Supabase authorises a password change from the session alone, so the current password
 * is checked explicitly first. Without that, anyone who picked up an unlocked phone could
 * lock the owner out of their own account.
 */
function ChangePassword({ email }: { email: string | null }) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  }

  async function submit() {
    if (pending) return;
    setError(null);
    setDone(false);
    if (!email) return setError('No email address is attached to this account.');
    if (next.length < 8) return setError('Use at least 8 characters for the new password.');
    if (next !== confirm) return setError('The new passwords do not match.');
    if (next === current) return setError('The new password must differ from the current one.');

    setPending(true);
    try {
      // Re-authenticating proves the current password; it refreshes the existing session
      // rather than starting a second one.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInError) {
        setError('That current password is not right.');
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      reset();
      setOpen(false);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not change the password.');
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <>
        <SelectorRow
          expanded={false}
          label="Password"
          value="Change"
          onPress={() => { setDone(false); setOpen(true); }}
        />
        {done ? <AppText variant="caption" color={colors.primary}>Password updated.</AppText> : null}
      </>
    );
  }

  return (
    <>
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="••••••••" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" />
      <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="••••••••" onSubmitEditing={() => void submit()} returnKeyType="done" />
      {error ? <AppText variant="caption" color={colors.danger}>{error}</AppText> : null}
      <Button disabled={pending} onPress={() => void submit()}>{pending ? 'Updating…' : 'Update password'}</Button>
      <Button variant="ghost" disabled={pending} onPress={() => { reset(); setOpen(false); }}>Cancel</Button>
    </>
  );
}

function SettingsSection({ children, title }: PropsWithChildren<{ title: string }>) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sectionWrap}>
      <AppText variant="eyebrow" color={colors.muted} style={styles.sectionTitle}>{title}</AppText>
      <View style={[styles.section, { backgroundColor: colors.surface }]}>{children}</View>
    </View>
  );
}

function Divider() {
  const { colors } = useAppTheme();
  return <View style={[styles.divider, { backgroundColor: colors.line }]} />;
}

function SelectorRow({ expanded, label, onPress, value }: { expanded: boolean; label: string; onPress: () => void; value: string }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      style={({ pressed }) => [styles.selectorRow, { opacity: pressed ? 0.65 : 1 }]}
    >
      <AppText>{label}</AppText>
      <View style={styles.selectorValue}>
        <AppText color={colors.muted} numberOfLines={1}>{value}</AppText>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </View>
    </Pressable>
  );
}

function OptionGrid({ children }: PropsWithChildren) {
  return <View accessibilityRole="radiogroup" style={styles.options}>{children}</View>;
}

function Choice({ active, disabled, fill = false, label, onPress }: { active: boolean; disabled?: boolean; fill?: boolean; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        fill && styles.fillChoice,
        { backgroundColor: active ? colors.softAccent : colors.raised, opacity: disabled ? 0.5 : pressed ? 0.72 : 1 },
      ]}
    >
      <AppText variant="caption" color={active ? colors.primary : colors.text}>{label}</AppText>
      {active ? <Ionicons name="checkmark" size={17} color={colors.primary} /> : null}
    </Pressable>
  );
}

function BodyMeasurements({ birthDate, heightCm, imperial, targetWeightKg, weightKg }: {
  birthDate: string | null;
  heightCm: number | null;
  imperial: boolean;
  targetWeightKg: number | null;
  weightKg: number | null;
}) {
  const { colors } = useAppTheme();
  const save = useUpdateBodyMeasurements();
  const toDisplayHeight = (value: number | null) => value === null ? '' : trimNumber(imperial ? cmToIn(value) : value);
  const toDisplayWeight = (value: number | null) => value === null ? '' : trimNumber(imperial ? kgToLb(value) : value);
  const toDisplayAge = (value: string | null) => value === null ? '' : String(ageFromBirthDate(value));
  const [height, setHeight] = useState(() => toDisplayHeight(heightCm));
  const [weight, setWeight] = useState(() => toDisplayWeight(weightKg));
  const [goalWeight, setGoalWeight] = useState(() => toDisplayWeight(targetWeightKg));
  const [age, setAge] = useState(() => toDisplayAge(birthDate));
  const [validationError, setValidationError] = useState<string | null>(null);
  const weightChanged = weight !== toDisplayWeight(weightKg);
  const ageChanged = age !== toDisplayAge(birthDate);
  const dirty = weightChanged || ageChanged || height !== toDisplayHeight(heightCm) || goalWeight !== toDisplayWeight(targetWeightKg);

  function parse(value: string, label: string, convert: (input: number) => number) {
    if (!value.trim()) return null;
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`);
    return convert(parsed);
  }

  function parsedAge() {
    if (!ageChanged) return null;
    if (!age.trim()) throw new Error('Age cannot be blank.');
    const parsed = Number(age);
    if (!Number.isInteger(parsed) || parsed < 13 || parsed > 120) throw new Error('Enter an age between 13 and 120.');
    return parsed;
  }

  async function submit() {
    setValidationError(null);
    try {
      await save.mutateAsync({
        heightCm: parse(height, 'Height', (value) => imperial ? inToCm(value) : value),
        targetWeightKg: parse(goalWeight, 'Goal weight', (value) => imperial ? lbToKg(value) : value),
        // Only log a new reading when the number actually moved, so opening settings does not add rows.
        weightKg: weightChanged ? parse(weight, 'Weight', (value) => imperial ? lbToKg(value) : value) : null,
        age: parsedAge(),
      });
    } catch (caught) {
      if (caught instanceof Error && !('code' in caught)) setValidationError(caught.message);
    }
  }

  return (
    <>
      <View style={styles.measurementFields}>
        <Field containerStyle={styles.measurementField} label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="—" />
        <Field containerStyle={styles.measurementField} label={imperial ? 'Height (in)' : 'Height (cm)'} value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="—" />
        <Field containerStyle={styles.measurementField} label={imperial ? 'Weight (lb)' : 'Weight (kg)'} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="—" />
        <Field containerStyle={styles.measurementField} label={imperial ? 'Goal weight (lb)' : 'Goal weight (kg)'} value={goalWeight} onChangeText={setGoalWeight} keyboardType="decimal-pad" placeholder="Optional" />
      </View>
      <AppText variant="caption" color={colors.muted}>
        {weightChanged ? 'Saving logs this weight as a new measurement.' : 'Changing your weight logs a new measurement and feeds your progress chart.'}
      </AppText>
      <Button disabled={!dirty || save.isPending} variant="secondary" onPress={() => void submit()}>
        {save.isPending ? 'Saving…' : 'Save measurements'}
      </Button>
      {validationError || save.error ? <AppText variant="caption" color={colors.danger}>{validationError ?? save.error?.message}</AppText> : null}
    </>
  );
}

function trimNumber(value: number) {
  return value.toFixed(1).replace(/\.0$/, '');
}

function formatTrend(changeKgPerWeek: number, imperial: boolean) {
  const change = imperial ? kgToLb(changeKgPerWeek) : changeKgPerWeek;
  const unit = imperial ? 'lb' : 'kg';
  if (Math.abs(change) < 0.05) return 'holding steady';
  return `${change > 0 ? '+' : ''}${change.toFixed(1)} ${unit}/week`;
}

function TargetStat({ label, unit, value }: { label: string; unit: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.targetStat, { backgroundColor: colors.raised }]}>
      <AppText variant="heading">{value}</AppText>
      <AppText variant="caption" color={colors.muted}>{unit}</AppText>
      <AppText variant="caption" color={colors.muted}>{label}</AppText>
    </View>
  );
}

function ThemeChoice({ active, onPress, value }: { active: boolean; onPress: () => void; value: ThemePreference }) {
  const { colors } = useAppTheme();
  const icon = value === 'system' ? 'phone-portrait-outline' : value === 'light' ? 'sunny-outline' : 'moon-outline';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.themeChoice, { backgroundColor: active ? colors.surface : 'transparent', opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={icon} size={19} color={active ? colors.primary : colors.muted} />
      <AppText variant="caption" color={active ? colors.primary : colors.text}>{value[0].toUpperCase() + value.slice(1)}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl },
  account: { minWidth: 0, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.md },
  avatar: { width: 46, height: 46, flexShrink: 0, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0, gap: spacing.xs },
  sectionWrap: { minWidth: 0, gap: spacing.sm },
  sectionTitle: { marginLeft: spacing.sm },
  section: { minWidth: 0, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  segmented: { minWidth: 0, flexDirection: 'row', gap: spacing.xs, borderRadius: radius.md, padding: spacing.xs },
  themeChoice: { minWidth: 0, minHeight: 48, flex: 1, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  selectorRow: { minWidth: 0, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xs },
  selectorValue: { minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: spacing.xs },
  options: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.sm },
  choice: { minHeight: 42, minWidth: 0, flexGrow: 1, flexBasis: 108, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  fillChoice: { flexBasis: 0 },
  measurementFields: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  measurementField: { minWidth: 110, flexGrow: 1, flexBasis: 130 },
  targetGrid: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  targetStat: { minWidth: 76, flexGrow: 1, flexBasis: 76, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  recalculate: { minHeight: 46, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  privacyRow: { minWidth: 0, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xs },
  logout: { minHeight: 52, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
});

import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, BackHandler, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Button, Card, LoadingState, ProgressBar, Screen } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import {
  clearRoutineImportReview,
  loadRoutineImportReview,
  saveRoutineImportReview,
} from '@/features/routines/api/routine-import';
import { MovementReview, RoutineImportOverview } from '@/features/routines/components/routine-import-review';
import {
  reviewedKeysAfterSelectionChange,
  shouldStackRoutineImportFooter,
} from '@/features/routines/components/routine-import-review-state';
import {
  useAnalyzeRoutineImport,
  useCancelRoutineImport,
  useConfirmRoutineImport,
} from '@/features/routines/hooks/use-routine-import';
import { useAppTheme } from '@/hooks/use-app-theme';
import type {
  RoutineImportAnalysis,
  RoutineImportChoice,
  RoutineImportExercise,
  RoutineImportReviewSelection,
} from '@/lib/openai-types/routine-import';
import { useAuth } from '@/providers/auth-provider';

type ReviewMovement = {
  exercise: RoutineImportExercise;
  appearances: string[];
};

export default function ImportRoutineScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const analyze = useAnalyzeRoutineImport();
  const confirm = useConfirmRoutineImport();
  const cancel = useCancelRoutineImport();
  const [restoredAnalysis, setRestoredAnalysis] = useState<RoutineImportAnalysis | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [selections, setSelections] = useState<Record<string, RoutineImportReviewSelection>>({});
  const [reviewedExerciseKeys, setReviewedExerciseKeys] = useState<string[]>([]);
  const [activeExerciseKey, setActiveExerciseKey] = useState<string | null>(null);
  const userId = user?.id ?? null;
  const analysis = analyze.data ?? restoredAnalysis;

  useEffect(() => {
    let cancelled = false;
    setIsRestoring(true);

    async function restoreReview() {
      if (!userId) {
        if (!cancelled) {
          setRestoredAnalysis(null);
          setSelections({});
          setReviewedExerciseKeys([]);
          setActiveExerciseKey(null);
          setIsRestoring(false);
        }
        return;
      }

      try {
        const review = await loadRoutineImportReview(userId);
        if (cancelled) return;
        setRestoredAnalysis(review?.analysis ?? null);
        setSelections(review?.selections ?? {});
        setReviewedExerciseKeys(review?.reviewedExerciseKeys ?? []);
        setActiveExerciseKey(review?.activeExerciseKey ?? null);
      } catch {
        if (cancelled) return;
        setRestoredAnalysis(null);
        setSelections({});
        setReviewedExerciseKeys([]);
        setActiveExerciseKey(null);
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    }

    void restoreReview();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const movements = useMemo(() => analysis ? buildReviewMovements(analysis) : [], [analysis]);
  const effectiveSelections = useMemo(
    () => analysis ? buildInitialSelections(analysis, selections) : {},
    [analysis, selections],
  );
  const reviewedSet = useMemo(() => new Set(reviewedExerciseKeys), [reviewedExerciseKeys]);
  const activeIndex = Math.max(0, movements.findIndex((movement) => movement.exercise.exerciseKey === activeExerciseKey));
  const activeMovement = movements[activeIndex] ?? null;
  const activeSelection = activeMovement ? effectiveSelections[activeMovement.exercise.exerciseKey] : null;
  const resolvedCount = movements.filter((movement) => (
    reviewedSet.has(movement.exercise.exerciseKey)
    && isValidSelection(movement.exercise, effectiveSelections[movement.exercise.exerciseKey])
  )).length;
  const allResolved = resolvedCount === movements.length;
  const busy = analyze.isPending || confirm.isPending;
  const stackFooterActions = shouldStackRoutineImportFooter(width, fontScale);

  useEffect(() => {
    if (!busy) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => {
      subscription.remove();
    };
  }, [busy]);

  useEffect(() => {
    if (!userId || !analysis || isRestoring) return undefined;
    const timeout = setTimeout(() => {
      void saveRoutineImportReview(userId, {
        version: 2,
        analysis,
        selections: effectiveSelections,
        reviewedExerciseKeys: reviewedExerciseKeys.filter((key) => movements.some((movement) => movement.exercise.exerciseKey === key)),
        activeExerciseKey: activeMovement?.exercise.exerciseKey ?? null,
      }).catch(() => {
        // The server-side review remains intact even if this device cannot cache progress.
      });
    }, 200);
    return () => {
      clearTimeout(timeout);
    };
  }, [activeMovement?.exercise.exerciseKey, analysis, effectiveSelections, isRestoring, movements, reviewedExerciseKeys, userId]);

  async function chooseFile() {
    if (!userId) return;
    analyze.reset();
    confirm.reset();
    setRestoredAnalysis(null);
    setSelections({});
    setReviewedExerciseKeys([]);
    setActiveExerciseKey(null);
    try {
      const review = await analyze.mutateAsync(userId);
      if (!review) return;
      const initialSelections = buildInitialSelections(review, {});
      const initialMovements = buildReviewMovements(review);
      const firstExerciseKey = initialMovements[0]?.exercise.exerciseKey ?? null;
      setRestoredAnalysis(review);
      setSelections(initialSelections);
      setReviewedExerciseKeys([]);
      setActiveExerciseKey(firstExerciseKey);
      await saveRoutineImportReview(userId, {
        version: 2,
        analysis: review,
        selections: initialSelections,
        reviewedExerciseKeys: [],
        activeExerciseKey: firstExerciseKey,
      }).catch(() => {
        // Import success does not depend on this device's optional resume cache.
      });
    } catch {
      // The mutation error is rendered below and any successful review remains recoverable.
    }
  }

  function updateSelection(selection: RoutineImportReviewSelection) {
    if (!activeMovement) return;
    const key = activeMovement.exercise.exerciseKey;
    const previousSelection = effectiveSelections[key];
    setSelections((current) => ({ ...current, [key]: selection }));
    setReviewedExerciseKeys((current) => (
      reviewedKeysAfterSelectionChange(current, key, previousSelection, selection)
    ));
  }

  function continueReview() {
    if (!activeMovement || !activeSelection || !isValidSelection(activeMovement.exercise, activeSelection)) return;
    const currentKey = activeMovement.exercise.exerciseKey;
    const nextReviewed = new Set(reviewedExerciseKeys);
    nextReviewed.add(currentKey);
    setReviewedExerciseKeys([...nextReviewed]);

    const nextSequential = movements.slice(activeIndex + 1).find((movement) => !nextReviewed.has(movement.exercise.exerciseKey));
    const firstUnresolved = movements.find((movement) => !nextReviewed.has(movement.exercise.exerciseKey));
    const nextMovement = nextSequential ?? firstUnresolved;
    if (nextMovement) setActiveExerciseKey(nextMovement.exercise.exerciseKey);
  }

  function goToPreviousMovement() {
    const previous = movements[activeIndex - 1];
    if (previous) setActiveExerciseKey(previous.exercise.exerciseKey);
  }

  async function createDraft() {
    if (!analysis || !allResolved) return;
    const resolutions: RoutineImportChoice[] = movements.map(({ exercise }) => {
      const selection = effectiveSelections[exercise.exerciseKey];
      if (!selection || !isValidSelection(exercise, selection)) throw new Error(`Review ${exercise.sourceTitle} before continuing.`);
      return selection.type === 'catalog'
        ? {
            exerciseKey: exercise.exerciseKey,
            type: 'catalog',
            exerciseId: selection.exerciseId,
            customName: null,
            useStagedImage: false,
          }
        : {
            exerciseKey: exercise.exerciseKey,
            type: 'custom',
            exerciseId: null,
            customName: selection.customName.trim(),
            useStagedImage: selection.useStagedImage && Boolean(exercise.stagedImagePath),
          };
    });

    try {
      const routine = await confirm.mutateAsync({ importId: analysis.importId, resolutions });
      if (userId) await clearRoutineImportReview(userId);
      setRestoredAnalysis(null);
      router.replace({ pathname: '/routine/[id]', params: { id: routine.routineId } });
    } catch {
      // Keep the review and every choice editable when confirmation fails.
    }
  }

  async function discardImportAndChooseAgain() {
    if (!analysis) return;
    try {
      await cancel.mutateAsync(analysis.importId);
    } catch {
      // Expired imports are cleaned by the server, so cleanup cannot trap navigation.
    }
    analyze.reset();
    confirm.reset();
    setSelections({});
    setReviewedExerciseKeys([]);
    setActiveExerciseKey(null);
    setRestoredAnalysis(null);
    if (userId) await clearRoutineImportReview(userId);
    void chooseFile();
  }

  function confirmDiscard() {
    Alert.alert(
      'Discard this import?',
      'Your reviewed choices will be removed. The routine itself has not been created yet.',
      [
        { text: 'Keep reviewing', style: 'cancel' },
        { text: 'Discard and choose file', style: 'destructive', onPress: () => void discardImportAndChooseAgain() },
      ],
    );
  }

  const navigation = (
    <Stack.Screen
      options={{
        title: analyze.isPending ? 'Analyzing workout' : analysis ? 'Review workout' : 'Import workout',
        gestureEnabled: !busy,
        headerBackVisible: !busy,
      }}
    />
  );

  if (isRestoring) {
    return <>{navigation}<Screen scroll={false}><LoadingState label="Restoring your import…" /></Screen></>;
  }

  if (analyze.isPending) {
    return (
      <>
        {navigation}
        <Screen scroll={false} contentContainerStyle={styles.loadingScreen}>
          <LoadingState label="Reading your workout…" />
          <Card style={styles.loadingCard}>
            <AppText variant="heading">Building your review</AppText>
            <AppText color={colors.muted}>Coach is finding the cycle order, exercises, and closest catalog matches. Large PDFs can take a minute or two.</AppText>
            <View style={styles.privateRow}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
              <AppText variant="caption" color={colors.muted} style={styles.flex}>Keep this screen open. Nothing is added until you approve it.</AppText>
            </View>
          </Card>
        </Screen>
      </>
    );
  }

  if (analysis) {
    const activeIsValid = Boolean(activeMovement && activeSelection && isValidSelection(activeMovement.exercise, activeSelection));
    const activeIsReviewed = Boolean(activeMovement && reviewedSet.has(activeMovement.exercise.exerciseKey) && activeIsValid);
    const reviewActionLabel = allResolved
      ? (confirm.isPending ? 'Creating routine…' : 'Create draft routine')
      : !activeIsValid
        ? 'Enter a name to continue'
        : activeIsReviewed
          ? 'Next movement'
          : resolvedCount === movements.length - 1
            ? 'Finish review'
            : 'Accept & continue';
    const footer = (
      <View style={styles.footer}>
        <View style={styles.footerStatus}>
          <AppText variant="caption" color={colors.muted}>{resolvedCount} of {movements.length} resolved</AppText>
          <AppText variant="caption" color={colors.muted}>{movements.length ? `${activeIndex + 1} / ${movements.length}` : 'No movements'}</AppText>
        </View>
        <View style={[styles.footerActions, stackFooterActions && styles.footerActionsStacked]}>
          {activeIndex > 0 ? (
            <Button
              variant="secondary"
              disabled={confirm.isPending}
              onPress={goToPreviousMovement}
              style={stackFooterActions ? styles.stackedFooterButton : styles.previousButton}>
              Previous
            </Button>
          ) : null}
          <Button
            accessibilityLabel={allResolved ? 'Create draft routine' : 'Save this choice and continue'}
            disabled={confirm.isPending || (!allResolved && !activeIsValid)}
            onPress={() => allResolved ? void createDraft() : continueReview()}
            style={stackFooterActions ? styles.stackedFooterButton : styles.primaryFooterButton}>
            {reviewActionLabel}
          </Button>
        </View>
      </View>
    );

    return (
      <>
        {navigation}
        <Screen footer={footer}>
          <View style={styles.progressBlock}>
            <View style={styles.progressHeading}>
              <View style={styles.flex}>
                <AppText variant="eyebrow" color={colors.primary}>Review progress</AppText>
                <AppText variant="heading">{resolvedCount} of {movements.length} resolved</AppText>
              </View>
              {allResolved ? <Ionicons name="checkmark-circle" size={30} color={colors.primary} /> : null}
            </View>
            <ProgressBar label={`${resolvedCount} of ${movements.length} movements resolved`} value={movements.length ? (resolvedCount / movements.length) * 100 : 100} />
            <AppText variant="caption" color={colors.muted}>Your place and choices save automatically. You can leave and resume later.</AppText>
          </View>

          <RoutineImportOverview analysis={analysis} />

          {activeMovement && activeSelection ? (
            <MovementReview
              key={activeMovement.exercise.exerciseKey}
              exercise={activeMovement.exercise}
              selection={activeSelection}
              appearances={activeMovement.appearances}
              onChange={updateSelection}
            />
          ) : (
            <Card>
              <AppText variant="heading">No exercises were found</AppText>
              <AppText color={colors.muted}>Check the cycle overview. You can create the rest-day plan as-is or try a different file.</AppText>
            </Card>
          )}

          {confirm.error ? (
            <Card>
              <View style={styles.errorHeading}>
                <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                <AppText variant="heading" color={colors.danger} style={styles.flex}>Routine wasn’t created</AppText>
              </View>
              <AppText>{confirm.error.message}</AppText>
              <AppText variant="caption" color={colors.muted}>Your review is still saved. Check your choices and try again.</AppText>
            </Card>
          ) : null}

          <Button variant="ghost" disabled={confirm.isPending || cancel.isPending} onPress={confirmDiscard}>
            {cancel.isPending ? 'Discarding import…' : 'Discard and choose another file'}
          </Button>
        </Screen>
      </>
    );
  }

  return (
    <>
      {navigation}
      <Screen contentContainerStyle={styles.uploadScreen}>
        <Card style={styles.uploadCard}>
          <View style={[styles.heroIcon, { backgroundColor: colors.raised }]}>
            <Ionicons name="document-text-outline" size={30} color={colors.primary} />
          </View>
          <View style={styles.uploadCopy}>
            <AppText variant="eyebrow" color={colors.primary}>Import a workout</AppText>
            <AppText variant="title">Your file, turned into a routine.</AppText>
            <AppText color={colors.muted}>Coach reads the full rotation and suggests exercise matches. You approve each movement before anything is created.</AppText>
          </View>
          <Button onPress={() => void chooseFile()}>Choose workout file</Button>
          <View style={[styles.fileInfo, { borderTopColor: colors.line }]}>
            <ImportFact icon="repeat-outline" text="Keeps A/B days and rest slots in order" />
            <ImportFact icon="checkmark-circle-outline" text="Catalog matches stay editable" />
            <ImportFact icon="lock-closed-outline" text="Private upload · 10 MB maximum" />
          </View>
        </Card>

        {analyze.error ? (
          <Card>
            <View style={styles.errorHeading}>
              <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
              <AppText variant="heading" color={colors.danger} style={styles.flex}>Couldn’t read that file</AppText>
            </View>
            <AppText>{analyze.error.message}</AppText>
            <Button variant="secondary" onPress={() => void chooseFile()}>Try another file</Button>
          </Card>
        ) : null}

        <AppText variant="caption" color={colors.muted} style={styles.centerText}>PDF, Word, text, CSV, and Excel files are supported.</AppText>
      </Screen>
    </>
  );
}

function buildReviewMovements(analysis: RoutineImportAnalysis) {
  const byKey = new Map<string, ReviewMovement>();
  for (const day of analysis.days) {
    for (const exercise of day.exercises) {
      const existing = byKey.get(exercise.exerciseKey);
      if (existing) {
        if (!existing.appearances.includes(day.name)) existing.appearances.push(day.name);
      } else {
        byKey.set(exercise.exerciseKey, { exercise, appearances: [day.name] });
      }
    }
  }
  return [...byKey.values()];
}

function buildInitialSelections(analysis: RoutineImportAnalysis, overrides: Record<string, RoutineImportReviewSelection>) {
  const initial: Record<string, RoutineImportReviewSelection> = {};
  for (const { exercise } of buildReviewMovements(analysis)) {
    const override = overrides[exercise.exerciseKey];
    if (override && isValidCatalogReference(exercise, override)) {
      initial[exercise.exerciseKey] = override;
      continue;
    }

    const suggestion = exercise.suggestedResolution;
    if (suggestion.type === 'catalog' && exercise.candidates.some((candidate) => candidate.exerciseId === suggestion.exerciseId)) {
      initial[exercise.exerciseKey] = { type: 'catalog', exerciseId: suggestion.exerciseId };
    } else if (suggestion.type === 'custom') {
      initial[exercise.exerciseKey] = {
        type: 'custom',
        customName: suggestion.name,
        useStagedImage: Boolean(exercise.stagedImagePath),
      };
    } else if (exercise.candidates[0]) {
      initial[exercise.exerciseKey] = { type: 'catalog', exerciseId: exercise.candidates[0].exerciseId };
    } else {
      initial[exercise.exerciseKey] = {
        type: 'custom',
        customName: exercise.sourceTitle,
        useStagedImage: Boolean(exercise.stagedImagePath),
      };
    }
  }
  return initial;
}

function isValidCatalogReference(exercise: RoutineImportExercise, selection: RoutineImportReviewSelection) {
  return selection.type === 'custom' || exercise.candidates.some((candidate) => candidate.exerciseId === selection.exerciseId);
}

function isValidSelection(exercise: RoutineImportExercise, selection: RoutineImportReviewSelection | undefined) {
  if (!selection) return false;
  if (selection.type === 'custom') return Boolean(selection.customName.trim());
  return exercise.candidates.some((candidate) => candidate.exerciseId === selection.exerciseId);
}

function ImportFact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.factRow}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <AppText variant="caption" color={colors.muted} style={styles.flex}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  loadingScreen: { justifyContent: 'center' },
  loadingCard: { maxWidth: 520, width: '100%', alignSelf: 'center' },
  privateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  progressBlock: { gap: spacing.sm },
  progressHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: { gap: spacing.sm },
  footerStatus: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footerActionsStacked: { flexDirection: 'column', alignItems: 'stretch' },
  previousButton: { flex: 1, paddingHorizontal: spacing.md },
  primaryFooterButton: { flex: 2, paddingHorizontal: spacing.md },
  stackedFooterButton: { width: '100%', paddingHorizontal: spacing.md },
  errorHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  uploadScreen: { justifyContent: 'center' },
  uploadCard: { maxWidth: 560, width: '100%', alignSelf: 'center', gap: spacing.lg },
  uploadCopy: { gap: spacing.sm },
  heroIcon: { width: 58, height: 58, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, gap: spacing.sm },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  centerText: { textAlign: 'center' },
});

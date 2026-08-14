import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, Card, Field } from '@/components/ui';
import { radius, spacing } from '@/constants/tokens';
import { ExerciseMedia } from '@/features/exercises/components/exercise-media';
import { useCandidateMedia, useStagedImage } from '@/features/routines/hooks/use-routine-import';
import { useAppTheme } from '@/hooks/use-app-theme';
import type {
  RoutineImportAnalysis,
  RoutineImportCandidate,
  RoutineImportExercise,
  RoutineImportReviewSelection,
} from '@/lib/openai-types/routine-import';

export function RoutineImportOverview({ analysis }: { analysis: RoutineImportAnalysis }) {
  const { colors } = useAppTheme();
  const [showCycle, setShowCycle] = useState(false);
  const [showWarnings, setShowWarnings] = useState(false);

  return (
    <Card style={styles.overviewCard}>
      <View style={styles.overviewHeader}>
        <View style={styles.flexMin}>
          <AppText variant="eyebrow" color={colors.primary}>Imported plan</AppText>
          <AppText variant="heading" numberOfLines={2}>{analysis.routineName}</AppText>
          {analysis.description ? <AppText variant="caption" color={colors.muted} numberOfLines={2}>{analysis.description}</AppText> : null}
        </View>
        <View style={[styles.sourceBadge, { backgroundColor: colors.raised }]}>
          <Ionicons name="document-text-outline" size={16} color={colors.primary} />
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={analysis.cycleLength} label="slots" />
        <Stat value={analysis.trainingDays} label="training" />
        <Stat value={analysis.restDays} label="rest" />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showCycle }}
        onPress={() => setShowCycle((value) => !value)}
        style={styles.disclosure}>
        <View style={styles.disclosureCopy}>
          <Ionicons name="repeat-outline" size={19} color={colors.primary} />
          <AppText style={styles.flexMin}>Cycle overview</AppText>
        </View>
        <Ionicons name={showCycle ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </Pressable>
      {showCycle ? (
        <View style={[styles.detailSection, { borderTopColor: colors.line }]}>
          {analysis.days.map((day, index) => (
            <View key={day.dayKey} style={styles.dayRow}>
              <View style={[styles.dayIndex, { backgroundColor: colors.raised }]}>
                <AppText variant="caption" color={colors.primary}>{index + 1}</AppText>
              </View>
              <View style={styles.flexMin}>
                <AppText numberOfLines={2}>{day.name}</AppText>
                {day.notes ? <AppText variant="caption" color={colors.muted} numberOfLines={2}>{day.notes}</AppText> : null}
              </View>
              <AppText variant="caption" color={colors.muted} style={styles.dayCount}>
                {day.isRestDay ? 'Rest' : `${day.exercises.length} ${day.exercises.length === 1 ? 'move' : 'moves'}`}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {analysis.warnings.length ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showWarnings }}
            onPress={() => setShowWarnings((value) => !value)}
            style={styles.disclosure}>
            <View style={styles.disclosureCopy}>
              <Ionicons name="information-circle-outline" size={19} color={colors.primary} />
              <AppText style={styles.flexMin}>Import notes ({analysis.warnings.length})</AppText>
            </View>
            <Ionicons name={showWarnings ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
          </Pressable>
          {showWarnings ? (
            <View style={[styles.detailSection, { borderTopColor: colors.line }]}>
              {analysis.warnings.map((warning, index) => (
                <View key={`${warning}-${index}`} style={styles.noteRow}>
                  <View style={[styles.noteDot, { backgroundColor: colors.primary }]} />
                  <AppText variant="caption" color={colors.muted} style={styles.flexMin}>{warning}</AppText>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      <AppText variant="caption" color={colors.muted} numberOfLines={1}>Source: {analysis.sourceFileName}</AppText>
    </Card>
  );
}

export function MovementReview({
  exercise,
  selection,
  appearances,
  onChange,
}: {
  exercise: RoutineImportExercise;
  selection: RoutineImportReviewSelection;
  appearances: string[];
  onChange: (selection: RoutineImportReviewSelection) => void;
}) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const candidateMedia = useCandidateMedia(exercise.exerciseKey, exercise.candidates);
  const stagedImage = useStagedImage(exercise.stagedImagePath);
  const candidates = candidateMedia.data ?? exercise.candidates;
  const suggestedCandidateId = exercise.suggestedResolution.type === 'catalog'
    ? exercise.suggestedResolution.exerciseId
    : null;
  const [catalogExerciseId, setCatalogExerciseId] = useState<string | null>(
    selection.type === 'catalog' ? selection.exerciseId : suggestedCandidateId ?? exercise.candidates[0]?.exerciseId ?? null,
  );
  const [customName, setCustomName] = useState(
    selection.type === 'custom' ? selection.customName : exercise.sourceTitle,
  );
  const [customUseStagedImage, setCustomUseStagedImage] = useState(
    selection.type === 'custom' ? selection.useStagedImage : Boolean(exercise.stagedImagePath),
  );
  const selectedCandidate = selection.type === 'catalog'
    ? candidates.find((candidate) => candidate.exerciseId === selection.exerciseId) ?? candidates[0]
    : null;
  const suggestedCandidate = candidates.find((candidate) => candidate.exerciseId === suggestedCandidateId) ?? candidates[0] ?? null;
  const alternateCandidates = selection.type === 'catalog'
    ? candidates.filter((candidate) => candidate.exerciseId !== selectedCandidate?.exerciseId)
    : candidates;
  const comparisonIsWide = width >= 620;

  function chooseCatalog() {
    const candidate = candidates.find((item) => item.exerciseId === catalogExerciseId) ?? suggestedCandidate;
    if (candidate) onChange({ type: 'catalog', exerciseId: candidate.exerciseId });
  }

  function chooseCustom() {
    onChange({
      type: 'custom',
      customName,
      useStagedImage: customUseStagedImage,
    });
  }

  return (
    <View style={styles.reviewStack}>
      <View style={styles.movementHeading}>
        <AppText variant="eyebrow" color={colors.primary}>Movement from your file</AppText>
        <AppText variant="title" style={styles.movementTitle}>{exercise.sourceTitle}</AppText>
        <AppText variant="caption" color={colors.muted}>
          {appearanceCopy(appearances)}{exercise.pageNumber ? ` · Page ${exercise.pageNumber}` : ''}
        </AppText>
      </View>

      <View style={[styles.comparison, comparisonIsWide && styles.comparisonWide]}>
        <ComparisonPanel wide={comparisonIsWide} label="Your file" title={exercise.sourceTitle} subtitle={exercise.sourceDetails}>
          <SourcePreview url={stagedImage.data ?? null} label="Source image" />
        </ComparisonPanel>

        <View style={[styles.compareArrow, { backgroundColor: colors.raised }]}>
          <Ionicons name={comparisonIsWide ? 'arrow-forward' : 'arrow-down'} size={18} color={colors.primary} />
        </View>

        {selection.type === 'catalog' && selectedCandidate ? (
          <ComparisonPanel
            wide={comparisonIsWide}
            label="Catalog exercise"
            title={selectedCandidate.name}
            subtitle={selectedCandidate.matchReason}
            badge={`${Math.round(selectedCandidate.score * 100)}% match`}>
            <ExerciseMedia compact imageSource={selectedCandidate.imageSource ?? null} gifSource={selectedCandidate.gifSource ?? null} />
          </ComparisonPanel>
        ) : (
          <ComparisonPanel wide={comparisonIsWide} label="Private custom exercise" title={selection.type === 'custom' ? selection.customName || 'Name needed' : exercise.sourceTitle} subtitle="Kept as your own exercise, not added to the public catalog.">
            <SourcePreview url={selection.type === 'custom' && selection.useStagedImage ? stagedImage.data ?? null : null} label="Custom exercise image" />
          </ComparisonPanel>
        )}
      </View>

      <Card style={styles.decisionCard}>
        <View style={styles.decisionHeading}>
          <View style={styles.flexMin}>
            <AppText variant="heading">How should it be saved?</AppText>
            <AppText variant="caption" color={colors.muted}>Pick the catalog equivalent or keep the movement exactly as your file describes it.</AppText>
          </View>
        </View>

        {suggestedCandidate ? (
          <DecisionOption
            icon="library-outline"
            selected={selection.type === 'catalog'}
            title="Use catalog exercise"
            description={selectedCandidate?.name ?? suggestedCandidate.name}
            badge={exercise.suggestedResolution.type === 'catalog' ? 'Coach pick' : undefined}
            onPress={chooseCatalog}
          />
        ) : null}
        <DecisionOption
          icon="person-outline"
          selected={selection.type === 'custom'}
          title="Keep as my custom exercise"
          description="Uses the name and optional image from your file."
          badge={exercise.suggestedResolution.type === 'custom' ? 'Coach pick' : undefined}
          onPress={chooseCustom}
        />

        {selection.type === 'custom' ? (
          <View style={[styles.customFields, { borderTopColor: colors.line }]}>
            <Field
              label="Custom exercise name"
              value={selection.customName}
              placeholder="Exercise name"
              maxLength={200}
              returnKeyType="done"
              error={selection.customName.trim() ? undefined : 'Enter a name to continue.'}
              onChangeText={(value) => {
                setCustomName(value);
                onChange({ ...selection, customName: value });
              }}
            />
            {exercise.stagedImagePath ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selection.useStagedImage }}
                onPress={() => {
                  const useStagedImage = !selection.useStagedImage;
                  setCustomUseStagedImage(useStagedImage);
                  onChange({ ...selection, useStagedImage });
                }}
                style={styles.checkbox}>
                <Ionicons name={selection.useStagedImage ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} />
                <View style={styles.flexMin}>
                  <AppText>Use image from my file</AppText>
                  <AppText variant="caption" color={colors.muted}>Saved privately with this exercise.</AppText>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {alternateCandidates.length ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showAlternatives }}
              onPress={() => setShowAlternatives((value) => !value)}
              style={[styles.alternativesButton, { borderColor: colors.line }]}>
              <AppText style={styles.flexMin}>{selection.type === 'custom' ? 'Browse catalog matches' : 'See other catalog matches'} ({alternateCandidates.length})</AppText>
              <Ionicons name={showAlternatives ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
            </Pressable>
            {showAlternatives ? (
              <View style={styles.alternativesList}>
                {alternateCandidates.map((candidate) => (
                  <CandidateOption
                    key={candidate.exerciseId}
                    candidate={candidate}
                    suggested={candidate.exerciseId === suggestedCandidateId}
                    onPress={() => {
                      setCatalogExerciseId(candidate.exerciseId);
                      onChange({ type: 'catalog', exerciseId: candidate.exerciseId });
                    }}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {candidateMedia.error || stagedImage.error ? (
          <View style={styles.previewWarning}>
            <Ionicons name="image-outline" size={17} color={colors.muted} />
            <AppText variant="caption" color={colors.muted} style={styles.flexMin}>A preview could not load. You can still decide using the exercise names.</AppText>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function ComparisonPanel({
  wide,
  label,
  title,
  subtitle,
  badge,
  children,
}: {
  wide: boolean;
  label: string;
  title: string;
  subtitle: string | null;
  badge?: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.comparisonPanel, wide && styles.comparisonPanelWide, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.comparisonMedia}>{children}</View>
      <View style={styles.flexMin}>
        <View style={styles.panelLabelRow}>
          <AppText variant="eyebrow" color={colors.primary} style={styles.flexMin} numberOfLines={1}>{label}</AppText>
          {badge ? <View style={[styles.matchBadge, { backgroundColor: colors.raised }]}><AppText variant="caption" color={colors.primary}>{badge}</AppText></View> : null}
        </View>
        <AppText variant="heading" numberOfLines={2}>{title}</AppText>
        {subtitle ? <AppText variant="caption" color={colors.muted} numberOfLines={3}>{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

function DecisionOption({
  icon,
  selected,
  title,
  description,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  title: string;
  description: string;
  badge?: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}: ${description}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.decisionOption,
        {
          backgroundColor: selected ? colors.raised : colors.surface,
          borderColor: selected ? colors.primary : colors.line,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <View style={[styles.optionIcon, { backgroundColor: colors.raised }]}>
        <Ionicons name={icon} size={21} color={colors.primary} />
      </View>
      <View style={styles.flexMin}>
        <View style={styles.optionTitleRow}>
          <AppText style={styles.flexMin}>{title}</AppText>
          {badge ? <AppText variant="eyebrow" color={colors.primary}>{badge}</AppText> : null}
        </View>
        <AppText variant="caption" color={colors.muted} numberOfLines={2}>{description}</AppText>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={24} color={selected ? colors.primary : colors.muted} />
    </Pressable>
  );
}

function CandidateOption({ candidate, suggested, onPress }: { candidate: RoutineImportCandidate; suggested: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: false }}
      accessibilityLabel={`Use ${candidate.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.candidateRow, { borderColor: colors.line, opacity: pressed ? 0.72 : 1 }]}>
      <ExerciseMedia compact imageSource={candidate.imageSource ?? null} gifSource={candidate.gifSource ?? null} />
      <View style={styles.flexMin}>
        <View style={styles.optionTitleRow}>
          <AppText style={styles.flexMin} numberOfLines={2}>{candidate.name}</AppText>
          <AppText variant="caption" color={colors.primary}>{Math.round(candidate.score * 100)}%</AppText>
        </View>
        <AppText variant="caption" color={colors.muted} numberOfLines={2}>{candidate.matchReason}</AppText>
        {suggested ? <AppText variant="eyebrow" color={colors.primary}>Coach pick</AppText> : null}
      </View>
      <Ionicons name="arrow-forward-circle-outline" size={23} color={colors.primary} />
    </Pressable>
  );
}

function SourcePreview({ url, label }: { url: string | null; label: string }) {
  const { colors } = useAppTheme();
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <View style={[styles.sourcePlaceholder, { backgroundColor: colors.raised }]}>
        <Ionicons name="image-outline" size={23} color={colors.muted} />
      </View>
    );
  }
  return <Image source={{ uri: url }} contentFit="cover" transition={160} onError={() => setFailed(true)} accessibilityLabel={label} style={styles.sourceImage} />;
}

function Stat({ value, label }: { value: number; label: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.raised }]}>
      <AppText variant="caption" color={colors.primary}>{value}</AppText>
      <AppText variant="caption" color={colors.muted}>{label}</AppText>
    </View>
  );
}

function appearanceCopy(appearances: string[]) {
  if (!appearances.length) return 'Imported movement';
  if (appearances.length === 1) return appearances[0];
  if (appearances.length === 2) return `${appearances[0]} and ${appearances[1]}`;
  return `${appearances[0]} and ${appearances.length - 1} more days`;
}

const styles = StyleSheet.create({
  flexMin: { flex: 1, minWidth: 0 },
  overviewCard: { gap: spacing.sm },
  overviewHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sourceBadge: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: { minHeight: 34, borderRadius: radius.pill, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  disclosure: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  disclosureCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm, gap: spacing.sm },
  dayRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dayIndex: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dayCount: { flexShrink: 0, textAlign: 'right' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noteDot: { width: 6, height: 6, borderRadius: radius.pill, marginTop: 6, flexShrink: 0 },
  reviewStack: { gap: spacing.lg },
  movementHeading: { gap: spacing.xs },
  movementTitle: { fontSize: 30, lineHeight: 35 },
  comparison: { alignItems: 'center', gap: spacing.sm },
  comparisonWide: { flexDirection: 'row', alignItems: 'stretch' },
  comparisonPanel: { width: '100%', minWidth: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  comparisonPanelWide: { width: 0 },
  comparisonMedia: { width: 76, height: 76, flexShrink: 0 },
  compareArrow: { width: 34, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  panelLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  matchBadge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, flexShrink: 0 },
  sourceImage: { width: 76, height: 76, borderRadius: radius.md },
  sourcePlaceholder: { width: 76, height: 76, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  decisionCard: { padding: spacing.md, gap: spacing.sm },
  decisionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  decisionOption: { minHeight: 76, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  customFields: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, gap: spacing.md },
  checkbox: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  alternativesButton: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  alternativesList: { gap: spacing.sm },
  candidateRow: { minHeight: 100, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  previewWarning: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.xs },
});

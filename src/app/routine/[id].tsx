import { Ionicons } from "@expo/vector-icons";
import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
    Alert,
    Pressable,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";

import {
    AppText,
    Button,
    Card,
    ErrorState,
    LoadingState,
    Screen,
} from "@/components/ui";
import { radius, spacing } from "@/constants/tokens";
import { ExerciseMedia } from "@/features/exercises/components/exercise-media";
import {
    useActivateRoutine,
    useAddRoutineDay,
    useDeactivateRoutine,
    useDuplicateRoutine,
    useDuplicateRoutineDay,
    useReorderRoutineDays,
    useReorderRoutineExercises,
    useRoutine,
} from "@/features/routines/hooks/use-routines";
import { useSkipRoutineDay } from "@/features/workouts/hooks/use-workout";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useAuth } from "@/providers/auth-provider";

function moved(ids: string[], from: number, to: number) {
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const [expandedDayId, setExpandedDayId] = useState<string | null | undefined>(
    undefined,
  );
  const query = useRoutine(id);
  const addDay = useAddRoutineDay(id);
  const activate = useActivateRoutine();
  const deactivate = useDeactivateRoutine();
  const duplicate = useDuplicateRoutine(user?.id ?? "");
  const duplicateDay = useDuplicateRoutineDay(id);
  const reorderDays = useReorderRoutineDays(id);
  const reorderExercises = useReorderRoutineExercises(id);
  const skipDay = useSkipRoutineDay();

  if (query.isLoading)
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  if (query.isError || !query.data)
    return (
      <Screen>
        <ErrorState message={query.error?.message ?? "Routine not found"} />
      </Screen>
    );

  const routine = query.data;
  const days = [...routine.routine_days].sort(
    (a, b) => a.day_index - b.day_index,
  );
  const busy =
    activate.isPending || deactivate.isPending || duplicate.isPending;
  const routineEditPending =
    addDay.isPending ||
    duplicateDay.isPending ||
    reorderDays.isPending ||
    reorderExercises.isPending;
  const routineEditError =
    addDay.error ??
    duplicateDay.error ??
    reorderDays.error ??
    reorderExercises.error;
  const compact = width < 380;
  const defaultExpandedDayId =
    days.find((day) => day.day_index === routine.current_cycle_index)?.id ??
    days[0]?.id;
  const visibleDayId =
    expandedDayId === undefined ? defaultExpandedDayId : expandedDayId;

  function confirmDeactivate() {
    Alert.alert(
      "Deactivate plan?",
      `“${routine.name}” will move to your drafts. Completed workout history will stay saved.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", onPress: () => deactivate.mutate(routine.id) },
      ],
    );
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <AppText variant="title">{routine.name}</AppText>
            <AppText variant="caption" color={colors.muted}>
              {days.length} cycle slot{days.length === 1 ? "" : "s"}
            </AppText>
          </View>
          <Link href={{ pathname: "/routine/rename", params: { routineId: id } }} asChild>
            <Pressable
              accessibilityLabel={`Rename ${routine.name}`}
              style={({ pressed }) => [
                styles.renameAction,
                { backgroundColor: colors.raised, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons name="pencil" size={18} color={colors.primary} />
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.primaryActions}>
        {routine.status === "draft" ? (
          <Button
            disabled={busy}
            style={styles.growingAction}
            onPress={() => activate.mutate(routine.id)}
          >
            {activate.isPending ? "Activating…" : "Activate plan"}
          </Button>
        ) : routine.status === "active" ? (
          <Button
            disabled={busy}
            style={styles.growingAction}
            variant="secondary"
            onPress={confirmDeactivate}
          >
            {deactivate.isPending ? "Deactivating…" : "Deactivate plan"}
          </Button>
        ) : null}
        <Button
          disabled={busy}
          style={styles.growingAction}
          variant="secondary"
          onPress={() =>
            duplicate.mutate(routine, {
              onSuccess: (copy) =>
                router.replace({
                  pathname: "/routine/[id]",
                  params: { id: copy.id },
                }),
            })
          }
        >
          {duplicate.isPending ? "Duplicating…" : "Duplicate plan"}
        </Button>
      </View>
      {activate.error || deactivate.error || duplicate.error ? (
        <AppText color={colors.danger}>
          {activate.error?.message ??
            deactivate.error?.message ??
            duplicate.error?.message}
        </AppText>
      ) : null}

      {days.map((day, dayPosition) => {
        const exercises = [...day.routine_exercises].sort(
          (a, b) => a.exercise_index - b.exercise_index,
        );
        const isNext =
          day.day_index === routine.current_cycle_index &&
          routine.status === "active";
        return (
          <Card
            key={day.id}
            style={isNext ? { backgroundColor: colors.softAccent } : undefined}
          >
            <View
              style={[styles.dayHeader, compact && styles.dayHeaderCompact]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: visibleDayId === day.id }}
                accessibilityLabel={`${visibleDayId === day.id ? "Collapse" : "Expand"} ${day.name}`}
                onPress={() =>
                  setExpandedDayId(visibleDayId === day.id ? null : day.id)
                }
                style={({ pressed }) => [
                  styles.dayToggle,
                  { opacity: pressed ? 0.65 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.slotNumber,
                    {
                      backgroundColor: isNext ? colors.primary : colors.raised,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    color={isNext ? colors.onPrimary : colors.text}
                  >
                    {dayPosition + 1}
                  </AppText>
                </View>
                <View style={styles.dayCopy}>
                  <AppText
                    variant="eyebrow"
                    color={isNext ? colors.primary : colors.muted}
                  >
                    {isNext ? "Up next" : `Cycle slot ${dayPosition + 1}`}
                  </AppText>
                  <AppText variant="heading">{day.name}</AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {day.is_rest_day
                      ? "Recovery day"
                      : `${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`}
                  </AppText>
                </View>
                <Ionicons
                  name={visibleDayId === day.id ? "chevron-up" : "chevron-down"}
                  size={19}
                  color={colors.muted}
                />
              </Pressable>
              <Link
                href={{
                  pathname: "/routine/day/[id]",
                  params: { id: day.id, routineId: id },
                }}
                asChild
              >
                <Pressable
                  accessibilityLabel={`Rename ${day.name}`}
                  style={({ pressed }) => [
                    styles.renameAction,
                    {
                      backgroundColor: colors.raised,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name="pencil" size={17} color={colors.primary} />
                </Pressable>
              </Link>
            </View>

            {visibleDayId === day.id ? (
              <>
                <View style={styles.dayTools}>
                  <IconButton
                    icon="arrow-up"
                    label="Move day up"
                    disabled={routineEditPending || dayPosition === 0}
                    onPress={() =>
                      reorderDays.mutate(
                        moved(
                          days.map((item) => item.id),
                          dayPosition,
                          dayPosition - 1,
                        ),
                      )
                    }
                  />
                  <IconButton
                    icon="arrow-down"
                    label="Move day down"
                    disabled={
                      routineEditPending || dayPosition === days.length - 1
                    }
                    onPress={() =>
                      reorderDays.mutate(
                        moved(
                          days.map((item) => item.id),
                          dayPosition,
                          dayPosition + 1,
                        ),
                      )
                    }
                  />
                  <Pressable
                    accessibilityLabel={`Duplicate ${day.name} cycle slot`}
                    accessibilityRole="button"
                    disabled={routineEditPending}
                    onPress={() => duplicateDay.mutate(day)}
                    style={({ pressed }) => [
                      styles.textTool,
                      {
                        backgroundColor: colors.raised,
                        opacity: routineEditPending ? 0.45 : pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={18}
                      color={colors.text}
                    />
                    <AppText variant="caption">Duplicate slot</AppText>
                  </Pressable>
                </View>

                {day.is_rest_day ? (
                  <View style={styles.restRow}>
                    <View
                      style={[
                        styles.restIcon,
                        { backgroundColor: colors.surface },
                      ]}
                    >
                      <Ionicons
                        name="moon-outline"
                        size={24}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.exerciseCopy}>
                      <AppText variant="heading">Recovery slot</AppText>
                      <AppText variant="caption" color={colors.muted}>
                        This stays in your rotation and advances only when you
                        complete it from Today.
                      </AppText>
                    </View>
                  </View>
                ) : exercises.length ? (
                  exercises.map((item, position) => (
                    <View
                      key={item.id}
                      style={[
                        styles.exercise,
                        { borderBottomColor: colors.line },
                      ]}
                    >
                      <View style={styles.exerciseMain}>
                        <View
                          style={[
                            styles.exerciseIndex,
                            { backgroundColor: colors.surface },
                          ]}
                        >
                          <AppText variant="caption">{position + 1}</AppText>
                        </View>
                        <ExerciseMedia
                          compact
                          imageSource={item.exercise.image_source ?? null}
                          gifSource={item.exercise.gif_source ?? null}
                        />
                        <View style={styles.exerciseCopy}>
                          <AppText variant="heading">
                            {item.exercise.name}
                          </AppText>
                          <AppText variant="caption" color={colors.muted}>
                            {item.target_sets} sets · {item.rep_min ?? "—"}–
                            {item.rep_max ?? "—"} reps · {item.rest_seconds}s
                            rest
                          </AppText>
                          {item.target_rir !== null ? (
                            <AppText variant="caption" color={colors.muted}>
                              Target RIR {item.target_rir}
                            </AppText>
                          ) : null}
                        </View>
                      </View>
                      <View style={styles.exerciseTools}>
                        <IconButton
                          icon="chevron-up"
                          label={`Move ${item.exercise.name} up`}
                          compact
                          disabled={routineEditPending || position === 0}
                          onPress={() =>
                            reorderExercises.mutate({
                              dayId: day.id,
                              orderedIds: moved(
                                exercises.map((exercise) => exercise.id),
                                position,
                                position - 1,
                              ),
                            })
                          }
                        />
                        <IconButton
                          icon="chevron-down"
                          label={`Move ${item.exercise.name} down`}
                          compact
                          disabled={
                            routineEditPending ||
                            position === exercises.length - 1
                          }
                          onPress={() =>
                            reorderExercises.mutate({
                              dayId: day.id,
                              orderedIds: moved(
                                exercises.map((exercise) => exercise.id),
                                position,
                                position + 1,
                              ),
                            })
                          }
                        />
                        <Link
                          href={{
                            pathname: "/routine/exercise/[id]",
                            params: { id: item.id, routineId: id },
                          }}
                          asChild
                        >
                          <Pressable
                            accessibilityLabel={`Edit ${item.exercise.name}`}
                            style={({ pressed }) => [
                              styles.editAction,
                              { opacity: pressed ? 0.7 : 1 },
                            ]}
                          >
                            <Ionicons
                              name="options-outline"
                              size={18}
                              color={colors.primary}
                            />
                            <AppText variant="caption" color={colors.primary}>
                              Edit prescription
                            </AppText>
                          </Pressable>
                        </Link>
                      </View>
                    </View>
                  ))
                ) : (
                  <AppText color={colors.muted}>
                    This training slot has no exercises yet.
                  </AppText>
                )}

                {!day.is_rest_day ? (
                  <Link
                    href={{
                      pathname: "/routine/[id]/add-exercise",
                      params: { id, dayId: day.id, index: exercises.length },
                    }}
                    asChild
                  >
                    <Button variant="secondary">Add exercise</Button>
                  </Link>
                ) : null}
                {isNext && routine.status === "active" ? (
                  <Button
                    variant="ghost"
                    accessibilityLabel={`Skip ${day.name}`}
                    disabled={skipDay.isPending}
                    onPress={() =>
                      Alert.alert(
                        "Skip this slot?",
                        "The rotation moves on to the next slot. Nothing is recorded as trained.",
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Skip slot", onPress: () => skipDay.mutate(day.id) },
                        ],
                      )
                    }
                  >
                    {skipDay.isPending ? "Skipping…" : "Skip this slot"}
                  </Button>
                ) : null}
                {!day.is_rest_day &&
                exercises.length &&
                routine.status === "active" ? (
                  <Link
                    href={{
                      pathname: "/workout/start",
                      params: { dayId: day.id },
                    }}
                    asChild
                  >
                    <Button>Start {day.name}</Button>
                  </Link>
                ) : !day.is_rest_day && routine.status === "draft" ? (
                  <AppText variant="caption" color={colors.muted}>
                    Activate the plan when the rotation looks right.
                  </AppText>
                ) : null}
              </>
            ) : null}
          </Card>
        );
      })}

      {routineEditError ? (
        <AppText color={colors.danger}>{routineEditError.message}</AppText>
      ) : null}
      {skipDay.error ? (
        <AppText color={colors.danger}>{skipDay.error.message}</AppText>
      ) : null}

      <View style={styles.addSlots}>
        <Pressable
          accessibilityLabel="Add training slot"
          accessibilityRole="button"
          disabled={routineEditPending}
          onPress={() =>
            addDay.mutate({ index: days.length, isRestDay: false })
          }
          style={({ pressed }) => [
            styles.addDay,
            {
              borderColor: colors.line,
              opacity: routineEditPending ? 0.45 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="add" color={colors.primary} size={22} />
          <View style={styles.addCopy}>
            <AppText variant="heading">Training slot</AppText>
            <AppText variant="caption" color={colors.muted}>
              Add another workout day
            </AppText>
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel="Add rest slot"
          accessibilityRole="button"
          disabled={routineEditPending}
          onPress={() => addDay.mutate({ index: days.length, isRestDay: true })}
          style={({ pressed }) => [
            styles.addDay,
            {
              borderColor: colors.line,
              opacity: routineEditPending ? 0.45 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Ionicons name="moon-outline" color={colors.primary} size={22} />
          <View style={styles.addCopy}>
            <AppText variant="heading">Rest slot</AppText>
            <AppText variant="caption" color={colors.muted}>
              Add planned recovery
            </AppText>
          </View>
        </Pressable>
      </View>
    </Screen>
  );
}

function IconButton({
  icon,
  label,
  disabled,
  compact,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        compact && styles.compactIconAction,
        {
          backgroundColor: colors.surface,
          opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={19} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { minWidth: 0, gap: spacing.sm },
  heroRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: spacing.sm },
  primaryActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  growingAction: { flexGrow: 1, flexBasis: 148 },
  dayHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dayHeaderCompact: { gap: spacing.xs },
  dayToggle: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  slotNumber: {
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  renameAction: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dayTools: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
  },
  textTool: {
    minHeight: 44,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconAction: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  compactIconAction: { width: 44, height: 44 },
  restRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  restIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  exercise: {
    minWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  exerciseMain: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  exerciseIndex: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  exerciseCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
    justifyContent: "center",
  },
  exerciseTools: {
    minWidth: 0,
    paddingLeft: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  editAction: {
    minHeight: 44,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
  },
  addSlots: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  addDay: {
    minHeight: 76,
    minWidth: 0,
    flexGrow: 1,
    flexBasis: 220,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  addCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
});

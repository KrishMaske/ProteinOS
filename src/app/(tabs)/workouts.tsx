import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import {
    AppText,
    Card,
    EmptyState,
    ErrorState,
    LoadingState,
    PressableCard,
    Screen,
    SectionHeader,
} from "@/components/ui";
import { radius, spacing } from "@/constants/tokens";
import {
    useArchiveRoutine,
    useRoutines,
} from "@/features/routines/hooks/use-routines";
import { useWorkoutHistory } from "@/features/workouts/hooks/use-workout";
import { useAppTheme } from "@/hooks/use-app-theme";

export default function WorkoutsScreen() {
  const { colors } = useAppTheme();
  const query = useRoutines();
  const history = useWorkoutHistory();
  const archive = useArchiveRoutine();
  const [showPlanActions, setShowPlanActions] = useState(false);
  const routines =
    query.data?.filter((routine) => routine.status !== "archived") ?? [];
  const active = routines.find((routine) => routine.status === "active");
  const drafts = routines.filter((routine) => routine.status === "draft");

  function confirmArchive(id: string, name: string) {
    Alert.alert(
      "Archive routine?",
      `${name} will be hidden from your training plans.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => archive.mutate(id),
        },
      ],
    );
  }

  return (
    <Screen safeEdges={["top", "left", "right"]}>
      <View style={styles.header}>
        <AppText variant="title" style={styles.headerCopy}>
          Train
        </AppText>
        <Link href="/exercises" asChild>
          <Pressable
            accessibilityLabel="Browse exercise library"
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.raised, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Ionicons name="search" size={22} color={colors.text} />
          </Pressable>
        </Link>
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={query.error.message}
          onRetry={() => query.refetch()}
        />
      ) : active ? (
        <Link
          href={{ pathname: "/routine/[id]", params: { id: active.id } }}
          asChild
        >
          <PressableCard
            accessibilityLabel={`Open active plan ${active.name}`}
            accessibilityHint="Shows the plan and training-day rotation"
            style={[styles.activePlan, { backgroundColor: colors.softAccent }]}
          >
            <View style={styles.activeTopRow}>
              <View
                style={[styles.activeIcon, { backgroundColor: colors.surface }]}
              >
                <Ionicons name="repeat" size={23} color={colors.primary} />
              </View>
              <AppText variant="eyebrow" color={colors.primary}>
                Active plan
              </AppText>
            </View>
            <AppText
              variant="title"
              style={styles.activeName}
              numberOfLines={2}
            >
              {active.name}
            </AppText>
            <View style={styles.openRow}>
              <AppText variant="caption" color={colors.primary}>
                View rotation
              </AppText>
              <Ionicons name="arrow-forward" size={18} color={colors.primary} />
            </View>
          </PressableCard>
        </Link>
      ) : (
        <EmptyState
          title="No active plan"
          description={
            drafts.length
              ? "Choose a draft below when it is ready."
              : "Import a workout file or create a simple rotation."
          }
        />
      )}

      <View style={styles.section}>
        {!active || showPlanActions ? (
          <>
            <SectionHeader
              title={active ? "Add another plan" : "Build a plan"}
              action={
                active ? (
                  <Pressable
                    accessibilityLabel="Hide plan options"
                    hitSlop={8}
                    onPress={() => setShowPlanActions(false)}
                  >
                    <AppText variant="caption" color={colors.primary}>
                      Hide
                    </AppText>
                  </Pressable>
                ) : undefined
              }
            />
            <View style={styles.planChooser}>
              <PlanAction
                icon="document-text-outline"
                title="Import"
                accessibilityLabel="Import a workout file"
                href="/routine/import"
              />
              <PlanAction
                icon="add-circle-outline"
                title="Create"
                accessibilityLabel="Create a routine from scratch"
                href="/routine/new"
              />
              <PlanAction
                icon="sparkles-outline"
                title="Coach"
                accessibilityLabel="Ask Coach to build a routine"
                href={{
                  pathname: "/coach",
                  params: { prompt: "Build me a routine" },
                }}
              />
            </View>
          </>
        ) : (
          <PressableCard
            accessibilityLabel="Add or import another plan"
            accessibilityHint="Shows plan creation options"
            onPress={() => setShowPlanActions(true)}
            style={styles.planToggle}
          >
            <View
              style={[
                styles.actionIcon,
                { backgroundColor: colors.softAccent },
              ]}
            >
              <Ionicons name="add" size={22} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="heading">Add another plan</AppText>
              <AppText variant="caption" color={colors.muted}>
                Import, create, or ask Coach
              </AppText>
            </View>
            <Ionicons name="chevron-down" size={20} color={colors.muted} />
          </PressableCard>
        )}
      </View>

      {drafts.length ? (
        <View style={styles.section}>
          <SectionHeader title="Draft plans" />
          <View style={styles.cardList}>
            {drafts.map((routine) => (
              <Card key={routine.id} style={styles.draftCard}>
                <Link
                  href={{
                    pathname: "/routine/[id]",
                    params: { id: routine.id },
                  }}
                  asChild
                >
                  <Pressable
                    accessibilityLabel={`Open draft ${routine.name}`}
                    accessibilityHint="Shows this routine draft"
                    style={({ pressed }) => [
                      styles.draftLink,
                      { opacity: pressed ? 0.65 : 1 },
                    ]}
                  >
                    <View style={styles.flex}>
                      <AppText variant="heading" numberOfLines={2}>
                        {routine.name}
                      </AppText>
                      <AppText variant="caption" color={colors.muted}>
                        Updated{" "}
                        {new Date(routine.updated_at).toLocaleDateString()}
                      </AppText>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colors.muted}
                    />
                  </Pressable>
                </Link>
                <Pressable
                  accessibilityLabel={`Archive ${routine.name}`}
                  disabled={archive.isPending}
                  hitSlop={6}
                  onPress={() => confirmArchive(routine.id, routine.name)}
                  style={({ pressed }) => [
                    styles.archiveButton,
                    { opacity: archive.isPending ? 0.35 : pressed ? 0.55 : 1 },
                  ]}
                >
                  <Ionicons
                    name="archive-outline"
                    size={19}
                    color={colors.muted}
                  />
                </Pressable>
              </Card>
            ))}
          </View>
          {archive.error ? (
            <AppText color={colors.danger}>{archive.error.message}</AppText>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Recent workouts" />
        {history.isLoading ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState
            message={history.error.message}
            onRetry={() => history.refetch()}
          />
        ) : history.data?.length ? (
          <View style={styles.cardList}>
            {history.data.slice(0, 8).map((workout) => {
              const sets = workout.workout_session_exercises
                .flatMap((exercise) => exercise.workout_sets)
                .filter((set) => set.completed_at && set.set_type !== "warmup");
              return (
                <Link
                  key={workout.id}
                  href={{
                    pathname: "/workout/summary",
                    params: { id: workout.id },
                  }}
                  asChild
                >
                  <PressableCard
                    accessibilityLabel={`Open workout summary for ${workout.name}`}
                    accessibilityHint="Shows the completed workout details"
                    style={styles.historyCard}
                  >
                    <View
                      style={[
                        styles.historyIcon,
                        { backgroundColor: colors.softAccent },
                      ]}
                    >
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="heading" numberOfLines={2}>
                        {workout.name}
                      </AppText>
                      <AppText variant="caption" color={colors.muted}>
                        {new Date(workout.started_at).toLocaleDateString()} ·{" "}
                        {Math.round((workout.duration_seconds ?? 0) / 60)} min ·{" "}
                        {sets.length} sets
                      </AppText>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={colors.muted}
                    />
                  </PressableCard>
                </Link>
              );
            })}
          </View>
        ) : (
          <AppText color={colors.muted}>
            Completed workouts will appear here.
          </AppText>
        )}
      </View>
    </Screen>
  );
}

function PlanAction({
  accessibilityLabel,
  href,
  icon,
  title,
}: {
  accessibilityLabel: string;
  href: Parameters<typeof Link>[0]["href"];
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.planAction,
          {
            backgroundColor: colors.surface,
            opacity: pressed ? 0.72 : 1,
          },
        ]}
      >
        <View style={[styles.planActionIcon, { backgroundColor: colors.softAccent }]}>
          <Ionicons name={icon} size={26} color={colors.primary} />
        </View>
        <AppText numberOfLines={1} style={styles.planActionLabel}>
          {title}
        </AppText>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  header: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  iconButton: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  activePlan: {
    minWidth: 0,
    minHeight: 164,
    justifyContent: "space-between",
    gap: spacing.md,
  },
  activeTopRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  activeIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  activeName: { fontSize: 30, lineHeight: 35, letterSpacing: -0.9 },
  openRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  section: { minWidth: 0, gap: spacing.md },
  planChooser: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  planToggle: {
    minWidth: 0,
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  planAction: {
    minWidth: 0,
    flex: 1,
    minHeight: 124,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  planActionIcon: {
    width: 54,
    height: 54,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  planActionLabel: { textAlign: "center", fontWeight: "700" },
  actionIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardList: { minWidth: 0, gap: spacing.sm },
  draftCard: {
    minWidth: 0,
    minHeight: 80,
    padding: 0,
    paddingLeft: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  draftLink: {
    minWidth: 0,
    flex: 1,
    minHeight: 80,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  archiveButton: {
    width: 46,
    height: 46,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  historyCard: {
    minWidth: 0,
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  historyIcon: {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  flex: { flex: 1, minWidth: 0, gap: spacing.xs },
});

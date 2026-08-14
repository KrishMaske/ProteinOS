import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
    AppText,
    Button,
    Card,
    Field,
    LoadingState,
    Screen,
} from "@/components/ui";
import { radius, spacing } from "@/constants/tokens";
import {
    analyzeFoodPhoto,
    pickAndUploadFoodPhoto,
    type FoodPhotoSource,
} from "@/features/nutrition/api/food-photo";
import { saveFoodAnalysis } from "@/features/nutrition/api/nutrition";
import { useCreateSavedFood } from "@/features/nutrition/hooks/use-nutrition";
import { useAppTheme } from "@/hooks/use-app-theme";
import { localDateKey } from "@/lib/date";
import type { FoodAnalysis } from "@/lib/openai-types/food-analysis";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/providers/auth-provider";
import type { Database } from "@/types/database";

type Food = FoodAnalysis["foods"][number];
type NumericFoodKey =
  | "estimatedGrams"
  | "calories"
  | "proteinGrams"
  | "carbohydrateGrams"
  | "fatGrams"
  | "fiberGrams";
// food_log_items requires these four, so a cleared field has to fall back to zero
// rather than null or the meal fails to save.
const requiredFoodKeys: NumericFoodKey[] = [
  "calories",
  "proteinGrams",
  "carbohydrateGrams",
  "fatGrams",
];
type MealType = Database["public"]["Enums"]["meal_type"];
const mealTypes: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snacks",
  "other",
];

function currentMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snacks";
}

export default function ScanFoodScreen() {
  const { path: routePath } = useLocalSearchParams<{
    path?: string | string[];
  }>();
  const initialPath = Array.isArray(routePath) ? routePath[0] : routePath;
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const saveReusable = useCreateSavedFood();
  const activePhotoPath = useRef<string | null>(initialPath ?? null);
  const preservePhoto = useRef(false);
  const screenActive = useRef(true);
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [path, setPath] = useState<string | null>(initialPath ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [analyzedNote, setAnalyzedNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingFoodIndex, setSavingFoodIndex] = useState<number | null>(null);
  const [savedFoodIndexes, setSavedFoodIndexes] = useState<Set<number>>(
    () => new Set(),
  );
  const [error, setError] = useState<string>();
  const [mealType, setMealType] = useState<MealType>(currentMealType);
  const noteChanged = note.trim() !== analyzedNote;
  const totals = useMemo(
    () =>
      analysis?.foods.reduce(
        (sum, food) => ({
          calories: sum.calories + food.calories,
          protein: sum.protein + food.proteinGrams,
          carbs: sum.carbs + food.carbohydrateGrams,
          fat: sum.fat + food.fatGrams,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [analysis],
  );

  // The note is collected before the photo is read, so the picked image only needs a
  // viewable URL here. food-photos is private, hence the signed link.
  useEffect(() => {
    // Cleared first so a retake never shows the previous photo while the new link resolves.
    setPreview(null);
    if (!path) return;
    let cancelled = false;
    void supabase.storage
      .from("food-photos")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (!cancelled) setPreview(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(
    () =>
      navigation.addListener("beforeRemove", () => {
        const orphanedPath = activePhotoPath.current;
        if (!preservePhoto.current && orphanedPath) {
          void supabase.storage.from("food-photos").remove([orphanedPath]);
        }
      }),
    [navigation],
  );

  useEffect(
    () => () => {
      screenActive.current = false;
    },
    [],
  );

  async function analyzePhoto() {
    const target = path;
    if (!target) return;
    const submittedNote = note.trim();
    setLoading(true);
    setError(undefined);
    try {
      const nextAnalysis = await analyzeFoodPhoto(
        target,
        submittedNote || undefined,
      );
      if (!screenActive.current) {
        await supabase.storage.from("food-photos").remove([target]);
        return;
      }
      setAnalysis(nextAnalysis);
      setAnalyzedNote(submittedNote);
      setSavedFoodIndexes(new Set());
    } catch (caught) {
      // The photo is kept so the note can be adjusted and the read retried.
      setError(caught instanceof Error ? caught.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  /** Picks and uploads a photo, then stops so the note can be written before any analysis. */
  async function scan(source: FoodPhotoSource) {
    if (!user) return;
    setError(undefined);
    try {
      const uploaded = await pickAndUploadFoodPhoto(user.id, source);
      if (!uploaded) return;
      if (!screenActive.current) {
        await supabase.storage.from("food-photos").remove([uploaded]);
        return;
      }
      const replaced = activePhotoPath.current;
      if (replaced && replaced !== uploaded)
        void supabase.storage.from("food-photos").remove([replaced]);
      activePhotoPath.current = uploaded;
      setPath(uploaded);
      setAnalysis(null);
      setAnalyzedNote("");
      setSavedFoodIndexes(new Set());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not open that photo",
      );
    }
  }

  function updateFood(index: number, key: NumericFoodKey, value: string) {
    const cleared = requiredFoodKeys.includes(key) ? 0 : null;
    setAnalysis((current) =>
      current
        ? {
            ...current,
            foods: current.foods.map((food, foodIndex) =>
              foodIndex === index
                ? {
                    ...food,
                    [key]: value.trim()
                      ? Math.max(0, Number(value) || 0)
                      : cleared,
                  }
                : food,
            ),
          }
        : current,
    );
  }

  async function saveFoodForLater(food: Food, index: number) {
    if (!user || savedFoodIndexes.has(index)) return;
    setSavingFoodIndex(index);
    try {
      await saveReusable.mutateAsync({
        user_id: user.id,
        name: food.name.trim(),
        serving_quantity:
          food.estimatedQuantity && food.estimatedQuantity > 0
            ? food.estimatedQuantity
            : null,
        serving_unit: food.unit?.trim() || null,
        serving_grams:
          food.estimatedGrams && food.estimatedGrams > 0
            ? food.estimatedGrams
            : null,
        calories: food.calories,
        protein_grams: food.proteinGrams,
        carbohydrate_grams: food.carbohydrateGrams,
        fat_grams: food.fatGrams,
        fiber_grams: food.fiberGrams,
      });
      setSavedFoodIndexes((current) => new Set(current).add(index));
    } catch {
      // Mutation state renders the database error next to the review.
    } finally {
      setSavingFoodIndex(null);
    }
  }

  async function confirm() {
    if (!user || !analysis) return;
    setSaving(true);
    setError(undefined);
    try {
      const normalized = {
        ...analysis,
        totals: {
          calories: totals?.calories ?? 0,
          proteinGrams: totals?.protein ?? 0,
          carbohydrateGrams: totals?.carbs ?? 0,
          fatGrams: totals?.fat ?? 0,
          fiberGrams: analysis.foods.reduce(
            (sum, food) => sum + (food.fiberGrams ?? 0),
            0,
          ),
        },
      };
      await saveFoodAnalysis(
        user.id,
        localDateKey(),
        mealType,
        normalized,
        path,
      );
      preservePhoto.current = true;
      const { data: profile } = await supabase
        .from("profiles")
        .select("delete_food_photo_after_analysis")
        .eq("id", user.id)
        .single();
      if (profile?.delete_food_photo_after_analysis && path) {
        await supabase.storage.from("food-photos").remove([path]);
        activePhotoPath.current = null;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["nutrition"] }),
        queryClient.invalidateQueries({ queryKey: ["today"] }),
      ]);
      router.replace("/(tabs)/nutrition");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save meal",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <Screen>
        <LoadingState label="Estimating portions and macros…" />
      </Screen>
    );

  return (
    <Screen
      footer={
        analysis ? (
          <Button disabled={saving} onPress={() => void confirm()}>
            {saving ? "Saving…" : "Log this meal"}
          </Button>
        ) : undefined
      }
    >
      {!path ? (
        <Card style={styles.captureCard}>
          <View style={[styles.cameraIcon, { backgroundColor: colors.raised }]}>
            <Ionicons name="camera-outline" size={28} color={colors.primary} />
          </View>
          <View style={styles.captureCopy}>
            <AppText variant="heading">Photograph your plate</AppText>
            <AppText color={colors.muted}>
              Keep the full meal visible and use good light. You can add a note
              before it is read, and correct every estimate before logging it.
            </AppText>
          </View>
          <Button onPress={() => void scan("camera")}>Take photo</Button>
          <Button variant="ghost" onPress={() => void scan("library")}>
            Choose an existing photo
          </Button>
        </Card>
      ) : null}

      {path && !analysis ? (
        <Card>
          <AppText variant="eyebrow" color={colors.primary}>
            Step 2 of 2 · Add a note
          </AppText>
          {preview ? (
            <Image
              source={{ uri: preview }}
              contentFit="cover"
              transition={180}
              accessibilityLabel="The meal photo you just added"
              style={styles.photoPreview}
            />
          ) : (
            <View style={[styles.photoPreview, styles.photoPlaceholder, { backgroundColor: colors.raised }]}>
              <Ionicons name="image-outline" size={26} color={colors.muted} />
            </View>
          )}
          <Field
            label="Meal note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="Example: turkey sandwich, extra avocado, dressing on the side"
            multiline
            numberOfLines={3}
            maxLength={500}
            containerStyle={styles.noteField}
          />
          <AppText variant="caption" color={colors.muted}>
            Naming the dish or its ingredients is sent with the photo, so
            anything hidden in the shot still gets counted. Skip it if the plate
            speaks for itself.
          </AppText>
          <Button onPress={() => void analyzePhoto()}>
            {note.trim() ? "Analyze photo and note" : "Analyze photo"}
          </Button>
          <View style={styles.retakeRow}>
            <Button variant="secondary" style={styles.retakeAction} onPress={() => void scan("camera")}>
              Retake
            </Button>
            <Button variant="secondary" style={styles.retakeAction} onPress={() => void scan("library")}>
              Choose another
            </Button>
          </View>
        </Card>
      ) : null}

      {error ? <AppText color={colors.danger}>{error}</AppText> : null}
      {analysis ? (
        <>
          <Card>
            <AppText variant="eyebrow" color={colors.primary}>
              Photo estimate · {Math.round(analysis.overallConfidence * 100)}%
              confidence
            </AppText>
            <AppText variant="heading">{analysis.mealName}</AppText>
            <Field
              label="Meal note (optional)"
              value={note}
              onChangeText={setNote}
              placeholder="Example: chicken breast, rice, black beans"
              multiline
              numberOfLines={3}
              maxLength={500}
              containerStyle={styles.noteField}
            />
            <AppText variant="caption" color={colors.muted}>
              {noteChanged
                ? "Run the estimate again so the note is read alongside the photo."
                : "Name the dish or list what is in it, then re-run the estimate for a closer read."}
            </AppText>
            <Button
              variant="secondary"
              disabled={!noteChanged || !path}
              onPress={() => void analyzePhoto()}
            >
              Re-estimate with this note
            </Button>
          </Card>
          <View style={styles.mealTypes}>
            {mealTypes.map((type) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: mealType === type }}
                key={type}
                onPress={() => setMealType(type)}
                style={[
                  styles.mealType,
                  {
                    backgroundColor:
                      mealType === type ? colors.primary : colors.raised,
                  },
                ]}
              >
                <AppText
                  variant="caption"
                  color={mealType === type ? colors.onPrimary : colors.text}
                >
                  {type}
                </AppText>
              </Pressable>
            ))}
          </View>
          {analysis.foods.map((food, index) => (
            <FoodEditor
              key={`${food.name}-${index}`}
              food={food}
              index={index}
              saved={savedFoodIndexes.has(index)}
              saving={savingFoodIndex === index}
              update={updateFood}
              onSave={() => void saveFoodForLater(food, index)}
            />
          ))}
          {saveReusable.error ? (
            <AppText color={colors.danger}>
              {saveReusable.error.message}
            </AppText>
          ) : null}
          <Card>
            <AppText variant="heading">Meal total</AppText>
            <AppText>
              {Math.round(totals?.calories ?? 0)} kcal ·{" "}
              {Math.round(totals?.protein ?? 0)}g protein ·{" "}
              {Math.round(totals?.carbs ?? 0)}g carbs ·{" "}
              {Math.round(totals?.fat ?? 0)}g fat
            </AppText>
            {analysis.assumptions.length ? (
              <AppText variant="caption" color={colors.muted}>
                {analysis.assumptions.join(" · ")}
              </AppText>
            ) : null}
            {analysis.warnings.map((warning) => (
              <AppText variant="caption" color={colors.danger} key={warning}>
                {warning}
              </AppText>
            ))}
          </Card>
          <Button variant="ghost" onPress={() => void scan("camera")}>
            Retake photo
          </Button>
        </>
      ) : null}
    </Screen>
  );
}

function FoodEditor({
  food,
  index,
  saved,
  saving,
  update,
  onSave,
}: {
  food: Food;
  index: number;
  saved: boolean;
  saving: boolean;
  update: (index: number, key: NumericFoodKey, value: string) => void;
  onSave: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Card>
      <View style={styles.foodHeader}>
        <View style={styles.flex}>
          <AppText variant="heading">{food.name}</AppText>
          <AppText variant="caption" color={colors.muted}>
            {Math.round(food.confidence * 100)}% confidence ·{" "}
            {food.reasoningSummary}
          </AppText>
        </View>
        {saved ? (
          <View style={[styles.savedBadge, { backgroundColor: colors.raised }]}>
            <Ionicons name="checkmark" size={16} color={colors.primary} />
            <AppText variant="caption" color={colors.primary}>
              Saved
            </AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.fields}>
        <Field
          label="Portion (g)"
          keyboardType="decimal-pad"
          value={food.estimatedGrams?.toString() ?? ""}
          onChangeText={(value) => update(index, "estimatedGrams", value)}
          containerStyle={styles.field}
        />
        <Field
          label="Calories"
          keyboardType="decimal-pad"
          value={food.calories.toString()}
          onChangeText={(value) => update(index, "calories", value)}
          containerStyle={styles.field}
        />
        <Field
          label="Protein (g)"
          keyboardType="decimal-pad"
          value={food.proteinGrams.toString()}
          onChangeText={(value) => update(index, "proteinGrams", value)}
          containerStyle={styles.field}
        />
        <Field
          label="Carbs (g)"
          keyboardType="decimal-pad"
          value={food.carbohydrateGrams.toString()}
          onChangeText={(value) => update(index, "carbohydrateGrams", value)}
          containerStyle={styles.field}
        />
        <Field
          label="Fat (g)"
          keyboardType="decimal-pad"
          value={food.fatGrams.toString()}
          onChangeText={(value) => update(index, "fatGrams", value)}
          containerStyle={styles.field}
        />
        <Field
          label="Fiber (g)"
          keyboardType="decimal-pad"
          value={food.fiberGrams?.toString() ?? ""}
          onChangeText={(value) => update(index, "fiberGrams", value)}
          containerStyle={styles.field}
        />
      </View>
      <Button variant="secondary" disabled={saved || saving} onPress={onSave}>
        {saving
          ? "Saving food…"
          : saved
            ? "Saved to My Foods"
            : "Save to My Foods"}
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  captureCard: { alignItems: "stretch" },
  photoPreview: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md },
  photoPlaceholder: { alignItems: "center", justifyContent: "center" },
  retakeRow: { flexDirection: "row", gap: spacing.sm },
  retakeAction: { flex: 1, minWidth: 0, paddingHorizontal: spacing.sm },
  cameraIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  captureCopy: { gap: spacing.sm },
  noteField: { marginTop: spacing.xs },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  field: { minWidth: 130, flexGrow: 1, flexBasis: 150 },
  mealTypes: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // Three per row keeps the five meals as two full rows instead of stranding one alone.
  mealType: {
    minHeight: 44,
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  foodHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  savedBadge: {
    flexShrink: 0,
    minHeight: 32,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  flex: { flex: 1, minWidth: 0, gap: spacing.xs },
});

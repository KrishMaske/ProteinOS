import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { buildFoodAnalysisRequest } from "@/lib/food-analysis-request";
import { FoodAnalysisSchema } from "@/lib/openai-types/food-analysis";
import { supabase } from "@/lib/supabase/client";
import { edgeFunctionError } from "@/lib/supabase/edge-function-error";
import { uuid } from "@/lib/uuid";

export type FoodPhotoSource = "camera" | "library";

export async function pickAndUploadFoodPhoto(
  userId: string,
  source: FoodPhotoSource = "library",
) {
  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Camera access is needed to photograph your food. You can enable it in your phone settings.",
      );
  }
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          cameraType: ImagePicker.CameraType.back,
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.85,
        });
  if (result.canceled) return null;
  const context = ImageManipulator.ImageManipulator.manipulate(
    result.assets[0].uri,
  );
  context.resize({ width: 1400, height: null });
  const rendered = await context.renderAsync();
  const image = await rendered.saveAsync({
    compress: 0.78,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const response = await fetch(image.uri);
  if (!response.ok) throw new Error("The captured photo could not be read.");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength)
    throw new Error("The captured photo was empty. Please take it again.");
  const path = `${userId}/${uuid()}.jpg`;
  const { error } = await supabase.storage
    .from("food-photos")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function analyzeFoodPhoto(path: string, userNote?: string) {
  const { data, error } = await supabase.functions.invoke("analyze-food", {
    body: buildFoodAnalysisRequest(path, userNote),
  });
  if (error) {
    throw await edgeFunctionError(
      error,
      "Food analysis could not finish. Try the photo again.",
    );
  }
  return FoodAnalysisSchema.parse(data.analysis);
}

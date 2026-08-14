import { z } from "npm:zod@4.4.3";
import { requireUser, safetyIdentifier } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import {
    createResponse,
    openAIErrorDetails,
    openAIModel,
    readOutputText,
} from "../_shared/openai.ts";
import { isSupportedFoodImage } from "./validation.ts";

const requestSchema = z
  .object({
    storagePath: z.string().min(3).max(512),
    userNote: z.string().trim().max(500).optional(),
  })
  .strict();
const nonnegative = z.number().min(0);
const foodAnalysisSchema = z
  .object({
    mealName: z.string().min(1),
    foods: z.array(
      z
        .object({
          name: z.string().min(1),
          estimatedQuantity: nonnegative.nullable(),
          unit: z.string().nullable(),
          estimatedGrams: nonnegative.nullable(),
          calories: nonnegative,
          proteinGrams: nonnegative,
          carbohydrateGrams: nonnegative,
          fatGrams: nonnegative,
          fiberGrams: nonnegative.nullable(),
          confidence: z.number().min(0).max(1),
          reasoningSummary: z.string(),
        })
        .strict(),
    ),
    totals: z
      .object({
        calories: nonnegative,
        proteinGrams: nonnegative,
        carbohydrateGrams: nonnegative,
        fatGrams: nonnegative,
        fiberGrams: nonnegative.nullable(),
      })
      .strict(),
    overallConfidence: z.number().min(0).max(1),
    assumptions: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

const foodAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "mealName",
    "foods",
    "totals",
    "overallConfidence",
    "assumptions",
    "warnings",
  ],
  properties: {
    mealName: { type: "string" },
    foods: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "estimatedQuantity",
          "unit",
          "estimatedGrams",
          "calories",
          "proteinGrams",
          "carbohydrateGrams",
          "fatGrams",
          "fiberGrams",
          "confidence",
          "reasoningSummary",
        ],
        properties: {
          name: { type: "string" },
          estimatedQuantity: { type: ["number", "null"], minimum: 0 },
          unit: { type: ["string", "null"] },
          estimatedGrams: { type: ["number", "null"], minimum: 0 },
          calories: { type: "number", minimum: 0 },
          proteinGrams: { type: "number", minimum: 0 },
          carbohydrateGrams: { type: "number", minimum: 0 },
          fatGrams: { type: "number", minimum: 0 },
          fiberGrams: { type: ["number", "null"], minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reasoningSummary: { type: "string" },
        },
      },
    },
    totals: {
      type: "object",
      additionalProperties: false,
      required: [
        "calories",
        "proteinGrams",
        "carbohydrateGrams",
        "fatGrams",
        "fiberGrams",
      ],
      properties: {
        calories: { type: "number", minimum: 0 },
        proteinGrams: { type: "number", minimum: 0 },
        carbohydrateGrams: { type: "number", minimum: 0 },
        fatGrams: { type: "number", minimum: 0 },
        fiberGrams: { type: ["number", "null"], minimum: 0 },
      },
    },
    overallConfidence: { type: "number", minimum: 0, maximum: 1 },
    assumptions: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
  },
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

type FailureStage =
  | "authorization"
  | "request"
  | "database"
  | "storage"
  | "openai"
  | "output";

function publicFailure(error: unknown, stage: FailureStage) {
  const message = error instanceof Error ? error.message : "";
  if (
    message === "Unauthorized" ||
    message === "Missing authorization header"
  ) {
    return {
      message: "Your session expired. Please sign in again.",
      status: 401,
      code: "unauthorized",
    };
  }
  if (stage === "request" && error instanceof z.ZodError) {
    return {
      message: "That food photo request was not valid.",
      status: 400,
      code: "invalid_request",
    };
  }
  if (stage === "storage") {
    return {
      message: "That photo upload was incomplete. Please take the photo again.",
      status: 422,
      code: "invalid_image",
    };
  }
  if (message.includes("OPENAI_API_KEY")) {
    return {
      message: "Food analysis is not configured yet.",
      status: 503,
      code: "not_configured",
    };
  }

  const upstream = openAIErrorDetails(error);
  if (upstream) {
    if (
      upstream.code === "request_timeout" ||
      upstream.code === "request_aborted"
    ) {
      return {
        message: "Food analysis took too long. Please try again.",
        status: 504,
        code: "timeout",
      };
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return {
        message: "Food analysis is not configured correctly yet.",
        status: 503,
        code: "not_configured",
      };
    }
    if (upstream.status === 429) {
      return {
        message: "Food analysis is busy right now. Please try again shortly.",
        status: 429,
        code: "analysis_busy",
      };
    }
    if (
      upstream.status === 400 ||
      upstream.status === 413 ||
      upstream.status === 422
    ) {
      return {
        message:
          "That photo could not be read. Try another angle with the full meal visible.",
        status: 422,
        code: "unsupported_image",
      };
    }
    return {
      message: "Food analysis is temporarily unavailable. Please try again.",
      status: 503,
      code: "openai_unavailable",
    };
  }
  if (
    stage === "output" ||
    error instanceof z.ZodError ||
    error instanceof SyntaxError
  ) {
    return {
      message:
        "The photo was read, but the nutrition estimate could not be completed. Please try again.",
      status: 502,
      code: "invalid_output",
    };
  }
  if (stage === "database") {
    return {
      message: "Food analysis could not save its progress. Please try again.",
      status: 500,
      code: "database_error",
    };
  }
  return {
    message: "Food analysis could not finish. Please try again.",
    status: 500,
    code: "analysis_failed",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  let runId: string | null = null;
  let client: any;
  let failureStage: FailureStage = "authorization";
  const startedAt = performance.now();
  try {
    const auth = await requireUser(request);
    client = auth.client;
    failureStage = "request";
    const input = requestSchema.parse(await request.json());
    if (!input.storagePath.startsWith(`${auth.user.id}/`)) {
      return json(
        { error: "Photo path does not belong to the authenticated user" },
        403,
      );
    }

    const model = openAIModel("OPENAI_VISION_MODEL");
    failureStage = "database";
    const { data: run, error: runError } = await client
      .from("ai_runs")
      .insert({
        user_id: auth.user.id,
        run_type: "food_analysis",
        model,
        input_metadata: { storage_path: input.storagePath },
      })
      .select("id")
      .single();
    if (runError) throw runError;
    runId = run.id;

    failureStage = "storage";
    const { data: photo, error: downloadError } = await client.storage
      .from("food-photos")
      .download(input.storagePath);
    if (downloadError || !photo)
      throw downloadError ?? new Error("Photo not found");
    const photoBytes = new Uint8Array(await photo.arrayBuffer());
    if (!isSupportedFoodImage(photoBytes, photo.type))
      throw new Error("Uploaded image bytes were not valid");

    const dataUrl = `data:${photo.type};base64,${bytesToBase64(photoBytes)}`;
    failureStage = "openai";
    const response = await createResponse(
      {
        model,
        store: false,
        safety_identifier: await safetyIdentifier(auth.user.id),
        instructions:
          "You estimate food portions and macros from a meal photo. Be conservative and honest about uncertainty. Do not diagnose health conditions. reasoningSummary must be one short visible-evidence statement, not hidden chain-of-thought. Estimate grams first from visible reference objects (plate, cutlery, hand, container), then derive macros from that weight using standard nutrition data. Each item's calories must agree with its own macros (protein*4 + carbohydrates*4 + fat*9) within 10%. Totals must equal the sum of item estimates within normal rounding tolerance. When the user note names a dish or ingredient, trust it over your visual guess for identity and treat the photo as evidence of portion size.",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Identify the visible foods and estimate quantities, grams, calories, protein, carbohydrates, fat, and fiber. Include assumptions and meaningful uncertainty warnings.${input.userNote ? ` User note: ${input.userNote}` : ""}`,
              },
              { type: "input_image", image_url: dataUrl, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "food_photo_analysis",
            strict: true,
            schema: foodAnalysisJsonSchema,
          },
        },
      },
      60_000,
    );
    failureStage = "output";
    const analysis = foodAnalysisSchema.parse(
      JSON.parse(readOutputText(response)),
    );

    failureStage = "database";
    await client
      .from("ai_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        output_metadata: {
          response_id: response.id,
          foods_count: analysis.foods.length,
          confidence: analysis.overallConfidence,
          duration_ms: Math.round(performance.now() - startedAt),
          // Recorded so image detail and model tier can be judged on measured cost
          // rather than estimates. ai_runs already stores this for coach and import.
          usage: response.usage ?? null,
        },
      })
      .eq("id", runId);
    return json({ analysis, runId });
  } catch (error) {
    const failure = publicFailure(error, failureStage);
    const upstream = openAIErrorDetails(error);
    console.error(
      JSON.stringify({
        event: "food_analysis_failed",
        code: failure.code,
        stage: failureStage,
        ...(upstream ? { upstream } : {}),
      }),
    );
    if (client && runId) {
      await client
        .from("ai_runs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_code: failure.code,
          output_metadata: {
            stage: failureStage,
            duration_ms: Math.round(performance.now() - startedAt),
            ...(upstream ? { upstream } : {}),
          },
        })
        .eq("id", runId);
    }
    return json({ error: failure.message, code: failure.code }, failure.status);
  }
});

import { describe, expect, it } from "vitest";

import { buildFoodAnalysisRequest } from "@/lib/food-analysis-request";

describe("food analysis request builder", () => {
  it("includes the AI note when supplied", () => {
    expect(
      buildFoodAnalysisRequest(
        "user/meal.jpg",
        "Turkey sandwich with avocado and lettuce",
      ),
    ).toEqual({
      storagePath: "user/meal.jpg",
      userNote: "Turkey sandwich with avocado and lettuce",
    });
  });

  it("omits the AI note when blank", () => {
    expect(buildFoodAnalysisRequest("user/meal.jpg", "   ")).toEqual({
      storagePath: "user/meal.jpg",
    });
  });
});

// Prompts and output schemas shared by the Claude and Gemini backends.
import { z } from "zod";
import { NUTRIENTS } from "./nutrients.js";

// One number per tracked nutrient, built from the shared list.
const nutrientShape = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, z.number().describe(`${n.label} in ${n.unit}`)]),
) as Record<string, z.ZodNumber>;
export const Nutrients = z.object(nutrientShape);

export const FoodItem = z.object({
  name: z.string().describe("Short food name, e.g. 'Grilled chicken breast'"),
  portion: z.string().describe("Human portion, e.g. '1 large breast (~200 g cooked)'"),
  grams: z.number().describe("Estimated edible weight in grams (ml for drinks)"),
  confidence: z.enum(["high", "medium", "low"]),
  nutrients: Nutrients.describe("Totals for this portion, not per 100 g"),
});

export const MealAnalysis = z.object({
  items: z.array(FoodItem),
  notes: z
    .string()
    .describe("One or two short sentences: assumptions made, or what to clarify for better accuracy. Empty if none."),
});

export const Per100g = z.object({
  per100g: Nutrients.describe("Values per 100 g of product"),
  notes: z.string(),
});

export type MealAnalysisT = z.infer<typeof MealAnalysis>;
export type Per100gT = z.infer<typeof Per100g>;
export type ImageInput = { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };
export type ProductInput = {
  name: string;
  brand?: string;
  ingredients?: string;
  categories?: string;
  known: Record<string, number>;
};
export type CoachInput = { remaining: Record<string, number>; eatenToday: string[]; profile: Record<string, unknown> };

export const MEAL_SYSTEM = `You are a precise sports nutritionist logging food for someone trying to gain lean muscle.
Turn what the user ate (typed or spoken text, and/or a photo of a plate, package or nutrition label) into separate food items with full nutrient estimates.

Accuracy rules:
- Base values on USDA FoodData Central style reference data for the food as eaten (cooked vs raw matters; state which you assumed in the portion text).
- Split mixed plates into components (e.g. rice, chicken, sauce, oil used in cooking). Include cooking oil/butter when the dish is clearly fried or sautéed.
- Use quantities the user states exactly. Otherwise estimate typical portions; for photos, judge size from plate, cutlery and hands.
- If a nutrition label is visible, use its numbers and scale to the amount eaten.
- Brand or restaurant items: use that brand's published values when you know them.
- Give every nutrient a number. Use your best estimate rather than 0 when the food contains it; use 0 only when it truly has none.
- Speech-to-text may mishear words (e.g. "for eggs" = "four eggs"); interpret sensibly.
- Set confidence low when portion size is a guess, and say in notes what detail would help.
- If the input has no food in it, return an empty items list and explain in notes.`;

export const PRODUCT_SYSTEM =
  "You are a food composition expert. Given a packaged product and the label values it lists per 100 g, estimate every nutrient per 100 g. Keep the listed label values exactly as given; estimate the rest from the ingredients and similar products in USDA data.";

export const COACH_SYSTEM =
  "You are a friendly, practical nutrition coach for someone gaining muscle. Reply in plain text, under 120 words, no markdown. Suggest 2-3 concrete foods or meals with amounts that close today's remaining gaps (protein and calories first, then the biggest micronutrient gaps). Easy, calorie-dense options are welcome.";

export const mealPrompt = (text?: string) =>
  text?.trim()
    ? `What I ate: ${text.trim()}`
    : "Here is a photo of what I'm eating. Identify each food and estimate portions.";

// Shown to the user when the AI provider rejects or rate-limits a request.
export class UserFacingError extends Error {}

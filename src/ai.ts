import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { NUTRIENTS } from "./nutrients.js";

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const unitFor = (u: string) => (u === "kcal" ? "kcal" : u);

// One number per tracked nutrient, built from the shared list.
const nutrientShape = Object.fromEntries(
  NUTRIENTS.map((n) => [n.key, z.number().describe(`${n.label} in ${unitFor(n.unit)}`)]),
) as Record<string, z.ZodNumber>;
const Nutrients = z.object(nutrientShape);

const FoodItem = z.object({
  name: z.string().describe("Short food name, e.g. 'Grilled chicken breast'"),
  portion: z.string().describe("Human portion, e.g. '1 large breast (~200 g cooked)'"),
  grams: z.number().describe("Estimated edible weight in grams (ml for drinks)"),
  confidence: z.enum(["high", "medium", "low"]),
  nutrients: Nutrients.describe("Totals for this portion, not per 100 g"),
});

const MealAnalysis = z.object({
  items: z.array(FoodItem),
  notes: z.string().describe("One or two short sentences: assumptions made, or what to clarify for better accuracy. Empty if none."),
});

const Per100g = z.object({
  per100g: Nutrients.describe("Values per 100 g of product"),
  notes: z.string(),
});

export type MealAnalysisT = z.infer<typeof MealAnalysis>;

const SYSTEM = `You are a precise sports nutritionist logging food for someone trying to gain lean muscle.
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

const COMMON = {
  model: MODEL,
  max_tokens: 16000,
  // Re-run a request on Anthropic's recommended model if this one declines it.
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

type ImageInput = { media_type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

function checkStop(stop: string | null) {
  if (stop === "refusal") throw new Error("The model declined this request. Try describing the food in text.");
  if (stop === "max_tokens") throw new Error("Response was cut off. Try logging fewer foods at once.");
}

export async function analyzeMeal(text: string | undefined, image: ImageInput | undefined): Promise<MealAnalysisT> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
  content.push({
    type: "text",
    text: text?.trim()
      ? `What I ate: ${text.trim()}`
      : "Here is a photo of what I'm eating. Identify each food and estimate portions.",
  });

  const res = await client.beta.messages.parse({
    ...COMMON,
    system: SYSTEM,
    output_config: { effort: "medium", format: betaZodOutputFormat(MealAnalysis) },
    messages: [{ role: "user", content }],
  });
  checkStop(res.stop_reason);
  if (!res.parsed_output) throw new Error("Could not read the model's answer. Please try again.");
  return res.parsed_output;
}

// Fill nutrients a barcode product's label doesn't list.
export async function estimateMissing(product: {
  name: string;
  brand?: string;
  ingredients?: string;
  categories?: string;
  known: Record<string, number>;
}): Promise<{ per100g: Record<string, number>; notes: string }> {
  const res = await client.beta.messages.parse({
    ...COMMON,
    system:
      "You are a food composition expert. Given a packaged product and the label values it lists per 100 g, estimate every nutrient per 100 g. Keep the listed label values exactly as given; estimate the rest from the ingredients and similar products in USDA data.",
    output_config: { effort: "low", format: betaZodOutputFormat(Per100g) },
    messages: [{ role: "user", content: JSON.stringify(product) }],
  });
  checkStop(res.stop_reason);
  if (!res.parsed_output) throw new Error("Could not estimate missing nutrients.");
  return res.parsed_output;
}

export async function coachAdvice(input: {
  remaining: Record<string, number>;
  eatenToday: string[];
  profile: Record<string, unknown>;
}): Promise<string> {
  const res = await client.beta.messages.create({
    ...COMMON,
    max_tokens: 4000,
    output_config: { effort: "low" },
    system:
      "You are a friendly, practical nutrition coach for someone gaining muscle. Reply in plain text, under 120 words, no markdown headings. Suggest 2-3 concrete foods or meals with amounts that close today's remaining gaps (protein and calories first, then the biggest micronutrient gaps). Easy, calorie-dense options are welcome.",
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  checkStop(res.stop_reason);
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
}

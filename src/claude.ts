import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  COACH_SYSTEM,
  MEAL_SYSTEM,
  MealAnalysis,
  PRODUCT_SYSTEM,
  Per100g,
  UserFacingError,
  mealPrompt,
  type CoachInput,
  type ImageInput,
  type MealAnalysisT,
  type Per100gT,
  type ProductInput,
} from "./prompts.js";

const client = new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const COMMON = {
  model: MODEL,
  max_tokens: 16000,
  // Re-run a request on Anthropic's recommended model if this one declines it.
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

function checkStop(stop: string | null) {
  if (stop === "refusal") throw new UserFacingError("The model declined this request. Try describing the food in text.");
  if (stop === "max_tokens") throw new UserFacingError("Response was cut off. Try logging fewer foods at once.");
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new UserFacingError("Server's Anthropic API key is missing or invalid.");
    if (err instanceof Anthropic.RateLimitError) throw new UserFacingError("Rate limited by the AI service. Try again in a minute.");
    if (err instanceof Anthropic.APIError) throw new UserFacingError(`AI service error (${err.status}). Try again.`);
    throw err;
  }
}

export const analyzeMeal = (text: string | undefined, image: ImageInput | undefined): Promise<MealAnalysisT> =>
  run(async () => {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (image) content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
    content.push({ type: "text", text: mealPrompt(text) });
    const res = await client.beta.messages.parse({
      ...COMMON,
      system: MEAL_SYSTEM,
      output_config: { effort: "medium", format: betaZodOutputFormat(MealAnalysis) },
      messages: [{ role: "user", content }],
    });
    checkStop(res.stop_reason);
    if (!res.parsed_output) throw new UserFacingError("Could not read the model's answer. Please try again.");
    return res.parsed_output;
  });

export const estimateMissing = (product: ProductInput): Promise<Per100gT> =>
  run(async () => {
    const res = await client.beta.messages.parse({
      ...COMMON,
      system: PRODUCT_SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(Per100g) },
      messages: [{ role: "user", content: JSON.stringify(product) }],
    });
    checkStop(res.stop_reason);
    if (!res.parsed_output) throw new UserFacingError("Could not estimate missing nutrients.");
    return res.parsed_output;
  });

export const coachAdvice = (input: CoachInput): Promise<string> =>
  run(async () => {
    const res = await client.beta.messages.create({
      ...COMMON,
      max_tokens: 4000,
      output_config: { effort: "low" },
      system: COACH_SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    checkStop(res.stop_reason);
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  });

import { ApiError, GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
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

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Free-tier friendly defaults. If the main model's free quota runs out (429),
// the request is retried on the lighter model, which has a bigger free allowance.
const MODELS = [
  process.env.GEMINI_MODEL || "gemini-flash-latest",
  process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-lite-latest",
];

async function generate(opts: {
  system: string;
  parts: Part[];
  schema?: z.ZodType;
}): Promise<string> {
  let lastErr: unknown;
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          systemInstruction: opts.system,
          ...(opts.schema && {
            responseMimeType: "application/json",
            responseJsonSchema: z.toJSONSchema(opts.schema),
          }),
        },
      });
      const text = res.text?.trim();
      if (!text) throw new UserFacingError("The AI returned an empty answer. Try again or add more detail.");
      return text;
    } catch (err) {
      lastErr = err;
      if (err instanceof ApiError && (err.status === 429 || err.status === 503)) continue; // try next model
      break;
    }
  }
  if (lastErr instanceof ApiError) {
    if (lastErr.status === 429) throw new UserFacingError("Today's free Gemini limit is used up. Try again later (it resets daily).");
    if (lastErr.status === 400 || lastErr.status === 401 || lastErr.status === 403)
      throw new UserFacingError("Gemini rejected the request – check GEMINI_API_KEY on the server.");
    throw new UserFacingError(`Gemini error (${lastErr.status}). Try again.`);
  }
  throw lastErr;
}

function parseJson<S extends z.ZodType>(schema: S, text: string): z.infer<S> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new UserFacingError("Could not read the AI's answer. Please try again.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new UserFacingError("The AI's answer was incomplete. Please try again.");
  return parsed.data;
}

export async function analyzeMeal(text: string | undefined, image: ImageInput | undefined): Promise<MealAnalysisT> {
  const parts: Part[] = [];
  if (image) parts.push({ inlineData: { mimeType: image.media_type, data: image.data } });
  parts.push({ text: mealPrompt(text) });
  return parseJson(MealAnalysis, await generate({ system: MEAL_SYSTEM, parts, schema: MealAnalysis }));
}

export async function estimateMissing(product: ProductInput): Promise<Per100gT> {
  return parseJson(Per100g, await generate({ system: PRODUCT_SYSTEM, parts: [{ text: JSON.stringify(product) }], schema: Per100g }));
}

export async function coachAdvice(input: CoachInput): Promise<string> {
  return generate({ system: COACH_SYSTEM, parts: [{ text: JSON.stringify(input) }] });
}

// Picks the AI backend: Gemini (free tier) when GEMINI_API_KEY is set, otherwise Claude.
import * as claude from "./claude.js";
import * as gemini from "./gemini.js";

export const provider = process.env.GEMINI_API_KEY ? "gemini" : "claude";
const impl = provider === "gemini" ? gemini : claude;

export const analyzeMeal = impl.analyzeMeal;
export const estimateMissing = impl.estimateMissing;
export const coachAdvice = impl.coachAdvice;

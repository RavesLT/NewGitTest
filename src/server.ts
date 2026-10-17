import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeMeal, coachAdvice, estimateMissing, provider } from "./ai.js";
import { NUTRIENTS } from "./nutrients.js";
import { UserFacingError } from "./prompts.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(here, "..", "public")));

// Optional shared password so strangers can't spend your API credits.
const APP_PASSWORD = process.env.APP_PASSWORD;
function auth(req: Request, res: Response, next: NextFunction) {
  if (APP_PASSWORD && req.get("x-app-password") !== APP_PASSWORD) {
    res.status(401).json({ error: "Wrong or missing app password (set it in Settings)." });
    return;
  }
  next();
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response) =>
    fn(req, res).catch((err: unknown) => {
      console.error(err);
      const msg = err instanceof UserFacingError ? err.message : "Something went wrong. Please try again.";
      res.status(500).json({ error: msg });
    });

app.get("/api/config", (_req, res) => {
  res.json({ nutrients: NUTRIENTS, passwordRequired: Boolean(APP_PASSWORD) });
});

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

app.post(
  "/api/analyze",
  auth,
  wrap(async (req, res) => {
    const { text, image } = req.body ?? {};
    if (image && (!IMAGE_TYPES.has(image.media_type) || typeof image.data !== "string")) {
      res.status(400).json({ error: "Unsupported image." });
      return;
    }
    if (!text?.trim() && !image) {
      res.status(400).json({ error: "Say, type or snap what you ate first." });
      return;
    }
    res.json(await analyzeMeal(text, image));
  }),
);

app.get(
  "/api/barcode/:code",
  auth,
  wrap(async (req, res) => {
    const code = String(req.params.code).replace(/\D/g, "");
    if (code.length < 6) {
      res.status(400).json({ error: "That barcode looks too short." });
      return;
    }
    const fields = "product_name,brands,serving_size,serving_quantity,nutriments,ingredients_text,categories,image_front_small_url";
    const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${fields}`, {
      headers: { "User-Agent": "FuelTracker/1.0 (personal food tracker)" },
    });
    const off = offRes.ok ? await offRes.json() : null;
    if (!off || off.status !== 1 || !off.product) {
      res.status(404).json({ error: "Product not found in Open Food Facts. Snap a photo of the nutrition label instead." });
      return;
    }
    const p = off.product;
    const nm = p.nutriments ?? {};

    // Label values per 100 g, converted from OFF's grams into our units.
    const known: Record<string, number> = {};
    for (const n of NUTRIENTS) {
      if (!n.off) continue;
      let v = nm[`${n.off}_100g`];
      if (n.key === "calories" && v == null && nm["energy_100g"] != null) v = nm["energy_100g"] / 4.184; // kJ -> kcal
      if (v == null || v === "" || Number.isNaN(Number(v))) continue;
      v = Number(v);
      if (n.unit === "mg") v *= 1000;
      if (n.unit === "mcg") v *= 1_000_000;
      known[n.key] = Math.round(v * 1000) / 1000;
    }
    if (known.sodium == null && nm["salt_100g"] != null) known.sodium = Math.round(Number(nm["salt_100g"]) * 400);

    const name = [p.brands?.split(",")[0], p.product_name].filter(Boolean).join(" ") || `Product ${code}`;
    const missing = NUTRIENTS.filter((n) => known[n.key] == null).map((n) => n.key);
    let per100g = known;
    let notes = "Values from the product label.";
    if (missing.length) {
      const est = await estimateMissing({
        name,
        brand: p.brands,
        ingredients: p.ingredients_text,
        categories: p.categories,
        known,
      });
      per100g = { ...est.per100g, ...known }; // label always wins
      notes = `Label values used; ${missing.length} nutrients the label doesn't list were estimated.`;
    }
    res.json({
      code,
      name,
      image: p.image_front_small_url ?? null,
      servingSize: p.serving_size ?? null,
      servingGrams: Number(p.serving_quantity) || null,
      per100g,
      estimated: missing,
      notes,
    });
  }),
);

app.post(
  "/api/coach",
  auth,
  wrap(async (req, res) => {
    res.json({ advice: await coachAdvice(req.body ?? {}) });
  }),
);

const port = Number(process.env.PORT) || 3000;
console.log(`AI provider: ${provider}`);
if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY)
  console.warn("Warning: set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY – food analysis won't work without one.");
app.listen(port, () => console.log(`Fuel tracker running on http://localhost:${port}`));

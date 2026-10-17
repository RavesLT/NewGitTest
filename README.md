# Fuel Tracker

A phone-friendly food tracker for **gaining muscle**. Log food by **voice, text, barcode or a photo of your plate**, and it tracks calories, protein/carbs/fat and **31 nutrients** (fats, minerals, vitamins) against targets built for a lean bulk.

## What it does

- **Voice or text** – tap 🎤 and say "3 eggs scrambled in butter, 2 slices sourdough, a glass of whole milk". The AI splits it into items and estimates every nutrient.
- **Photo** – snap your plate (or a nutrition label). The AI identifies each food and estimates portions. Add a note like "cooked in olive oil" for better accuracy.
- **Barcode** – scan a package; values come from the product label via [Open Food Facts](https://world.openfoodfacts.org). Nutrients the label doesn't list are estimated by the AI (the label always wins).
- **Review before saving** – every item shows its grams; change them and nutrients rescale. Rough guesses are flagged.
- **Muscle-gain targets** – Mifflin-St Jeor maintenance + your chosen surplus (+250/+400/+600 kcal), protein 1.6–2.2 g/kg, fat ~27%, carbs fill the rest, plus RDA targets for vitamins and minerals.
- **Coach** – "What should I eat next?" suggests foods to close today's protein, calorie and nutrient gaps.
- **Progress** – weight trend (kg/week, with a tip if you're gaining too slow or too fast) and 14-day calorie/protein history. Logging weight also updates your targets.
- **Quick add** – one tap to re-log recent foods.

Your log is stored on your phone (browser storage). Use **Settings → Export backup** now and then.

## Run it for free

The app works with **Google Gemini (free tier)** or **Anthropic Claude (paid)**. It uses Gemini when `GEMINI_API_KEY` is set.

1. Get a free Gemini API key at https://aistudio.google.com/apikey (no card needed).
2. Run it:

```bash
npm install
GEMINI_API_KEY=your-key npm start
# open http://localhost:3000
```

On the free tier Gemini has a daily request limit. If the main model's limit runs out, the app automatically switches to the lighter Flash-Lite model, which has a bigger free allowance. Note: on the free tier Google may use your requests (including food photos) to improve its products.

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Free Gemini key – uses Gemini when set |
| `GEMINI_MODEL` / `GEMINI_FALLBACK_MODEL` | Override models (default `gemini-flash-latest` / `gemini-flash-lite-latest`) |
| `ANTHROPIC_API_KEY` | Use Claude instead (paid) – only used when no Gemini key is set |
| `CLAUDE_MODEL` | Override the Claude model (default `claude-opus-5-5`) |
| `APP_PASSWORD` | Require a password (enter it in the app's Settings) so others can't use your quota |
| `PORT` | Port (default 3000) |

## Use it on your phone (free)

Camera and microphone need **HTTPS**, so host it on [Render](https://render.com)'s free plan:

1. Sign in to Render with GitHub → **New → Web Service** → pick this repo.
2. Build command `npm install`, start command `npm start`, instance type **Free**.
3. Add environment variables `GEMINI_API_KEY` and `APP_PASSWORD`.
4. Open the URL on your phone → browser menu → **Add to Home Screen**.

The free Render plan sleeps after ~15 minutes idle, so the first open after a break takes about a minute.

Voice works in Chrome (Android) and Safari (iOS). If your browser doesn't support it, use the 🎤 on your keyboard.

## Accuracy tips

- Say amounts when you know them ("200 g chicken", "1 cup cooked rice").
- Mention cooking fat – oil and butter add a lot of calories.
- For packaged food, a barcode or a photo of the nutrition label is most accurate.

## Code

- `src/server.ts` – Express server: `/api/analyze` (text/photo), `/api/barcode/:code`, `/api/coach`
- `src/ai.ts` – picks Gemini or Claude; `src/gemini.ts` and `src/claude.ts` hold each backend
- `src/prompts.ts` – prompts and JSON output schemas shared by both
- `src/nutrients.ts` – the list of tracked nutrients
- `public/` – the app (plain HTML/CSS/JS, no build step)

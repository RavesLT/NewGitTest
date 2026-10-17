# Fuel Tracker

A phone-friendly food tracker for **gaining muscle**. Log food by **voice, text, barcode or a photo of your plate**, and it tracks calories, protein/carbs/fat and **31 nutrients** (fats, minerals, vitamins) against targets built for a lean bulk.

## What it does

- **Voice or text** – tap 🎤 and say "3 eggs scrambled in butter, 2 slices sourdough, a glass of whole milk". Claude splits it into items and estimates every nutrient.
- **Photo** – snap your plate (or a nutrition label). Claude identifies each food and estimates portions. Add a note like "cooked in olive oil" for better accuracy.
- **Barcode** – scan a package; values come from the product label via [Open Food Facts](https://world.openfoodfacts.org). Nutrients the label doesn't list are estimated by Claude (the label always wins).
- **Review before saving** – every item shows its grams; change them and nutrients rescale. Rough guesses are flagged.
- **Muscle-gain targets** – Mifflin-St Jeor maintenance + your chosen surplus (+250/+400/+600 kcal), protein 1.6–2.2 g/kg, fat ~27%, carbs fill the rest, plus RDA targets for vitamins and minerals.
- **Coach** – "What should I eat next?" suggests foods to close today's protein, calorie and nutrient gaps.
- **Progress** – weight trend (kg/week, with a tip if you're gaining too slow or too fast) and 14-day calorie/protein history. Logging weight also updates your targets.
- **Quick add** – one tap to re-log recent foods.

Your log is stored on your phone (browser storage). Use **Settings → Export backup** now and then.

## Run it

Needs Node 20+ and an Anthropic API key (https://console.anthropic.com).

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start
# open http://localhost:3000
```

Optional environment variables:

| Variable | Purpose |
|---|---|
| `APP_PASSWORD` | Require a password (enter it in the app's Settings) so others can't use your API credits |
| `CLAUDE_MODEL` | Override the model (default `claude-opus-5-5`) |
| `PORT` | Port (default 3000) |

## Use it on your phone

Camera and microphone need **HTTPS**, so host it somewhere like Render, Railway or Fly.io:

1. Create a new **Web Service** from this repo.
2. Build command `npm install`, start command `npm start`.
3. Set `ANTHROPIC_API_KEY` and `APP_PASSWORD`.
4. Open the URL on your phone → browser menu → **Add to Home Screen**.

Voice works in Chrome (Android) and Safari (iOS). If your browser doesn't support it, use the 🎤 on your keyboard.

## Accuracy tips

- Say amounts when you know them ("200 g chicken", "1 cup cooked rice").
- Mention cooking fat – oil and butter add a lot of calories.
- For packaged food, a barcode or a photo of the nutrition label is most accurate.

## Code

- `src/server.ts` – Express server: `/api/analyze` (text/photo), `/api/barcode/:code`, `/api/coach`
- `src/ai.ts` – Claude calls with structured JSON output
- `src/nutrients.ts` – the list of tracked nutrients
- `public/` – the app (plain HTML/CSS/JS, no build step)

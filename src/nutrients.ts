// Single list of every nutrient the app tracks. The UI reads this via /api/config.
export type NutrientDef = {
  key: string;
  label: string;
  unit: "kcal" | "g" | "mg" | "mcg";
  group: "energy" | "macro" | "fat" | "mineral" | "vitamin";
  // Open Food Facts field (its *_100g values are always in grams, kcal for energy)
  off?: string;
};

export const NUTRIENTS: NutrientDef[] = [
  { key: "calories", label: "Calories", unit: "kcal", group: "energy", off: "energy-kcal" },
  { key: "protein", label: "Protein", unit: "g", group: "macro", off: "proteins" },
  { key: "carbs", label: "Carbs", unit: "g", group: "macro", off: "carbohydrates" },
  { key: "fat", label: "Fat", unit: "g", group: "macro", off: "fat" },
  { key: "fiber", label: "Fiber", unit: "g", group: "macro", off: "fiber" },
  { key: "sugar", label: "Sugar", unit: "g", group: "macro", off: "sugars" },
  { key: "saturated_fat", label: "Saturated fat", unit: "g", group: "fat", off: "saturated-fat" },
  { key: "mono_fat", label: "Monounsaturated fat", unit: "g", group: "fat", off: "monounsaturated-fat" },
  { key: "poly_fat", label: "Polyunsaturated fat", unit: "g", group: "fat", off: "polyunsaturated-fat" },
  { key: "omega3", label: "Omega-3", unit: "g", group: "fat", off: "omega-3-fat" },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", group: "fat", off: "cholesterol" },
  { key: "sodium", label: "Sodium", unit: "mg", group: "mineral", off: "sodium" },
  { key: "potassium", label: "Potassium", unit: "mg", group: "mineral", off: "potassium" },
  { key: "calcium", label: "Calcium", unit: "mg", group: "mineral", off: "calcium" },
  { key: "iron", label: "Iron", unit: "mg", group: "mineral", off: "iron" },
  { key: "magnesium", label: "Magnesium", unit: "mg", group: "mineral", off: "magnesium" },
  { key: "zinc", label: "Zinc", unit: "mg", group: "mineral", off: "zinc" },
  { key: "phosphorus", label: "Phosphorus", unit: "mg", group: "mineral", off: "phosphorus" },
  { key: "selenium", label: "Selenium", unit: "mcg", group: "mineral", off: "selenium" },
  { key: "vitamin_a", label: "Vitamin A (RAE)", unit: "mcg", group: "vitamin", off: "vitamin-a" },
  { key: "vitamin_c", label: "Vitamin C", unit: "mg", group: "vitamin", off: "vitamin-c" },
  { key: "vitamin_d", label: "Vitamin D", unit: "mcg", group: "vitamin", off: "vitamin-d" },
  { key: "vitamin_e", label: "Vitamin E", unit: "mg", group: "vitamin", off: "vitamin-e" },
  { key: "vitamin_k", label: "Vitamin K", unit: "mcg", group: "vitamin", off: "vitamin-k" },
  { key: "thiamin", label: "B1 Thiamin", unit: "mg", group: "vitamin", off: "vitamin-b1" },
  { key: "riboflavin", label: "B2 Riboflavin", unit: "mg", group: "vitamin", off: "vitamin-b2" },
  { key: "niacin", label: "B3 Niacin", unit: "mg", group: "vitamin", off: "vitamin-pp" },
  { key: "vitamin_b6", label: "B6", unit: "mg", group: "vitamin", off: "vitamin-b6" },
  { key: "folate", label: "Folate (DFE)", unit: "mcg", group: "vitamin", off: "vitamin-b9" },
  { key: "vitamin_b12", label: "B12", unit: "mcg", group: "vitamin", off: "vitamin-b12" },
  { key: "choline", label: "Choline", unit: "mg", group: "vitamin", off: "choline" },
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);

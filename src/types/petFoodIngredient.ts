export interface PetFoodIngredient {
  source: "public_data" | "local_sample" | "user_label";
  originSource?: string;
  ingredientPath: string;
  ingredientName: string;
  category?: string;
  subCategory?: string;
  partOrForm?: string;
  priceWonPerKg?: number;
  dryMatterPercent?: number;
  moisturePercent?: number;
  proteinPercent?: number;
  tryptophanPercent?: number;
  calciumPercent?: number;
  phosphorusPercent?: number;
  fatPercent?: number;
  linoleicAcidPercent?: number;
  linolenicAcidPercent?: number;
  ashPercent?: number;
  vitaminAREPer100g?: number;
  carbohydratePercent?: number;
  crudeFiberPercent?: number;
  totalDietaryFiberPercent?: number;
  insolubleFiberPercent?: number;
  solubleFiberPercent?: number;
  sodiumPercent?: number;
  potassiumPercent?: number;
  ingredientRoleTags?: string[];
  cautionTags?: string[];
  notForMainMealAlone?: boolean;
}

export interface PetFoodIngredientLoadResult {
  ingredients: PetFoodIngredient[];
  dataNotice: string;
}

export interface IngredientCandidate {
  ingredientName: string;
  ingredientPath?: string;
  matchLevel: "good_candidate" | "possible_candidate" | "caution_for_now" | "need_more_info";
  nutritionSummary: string;
  reasons: string[];
  cautionNotes: string[];
  dataSource: "public_data" | "local_sample" | "user_label";
}

export interface IngredientSelectionGuide {
  mode:
    | "daily_status_based_ingredient_guide"
    | "ingredient_comparison"
    | "food_safety_context"
    | "food_ingestion_context";
  dogName: string;
  basedOn: string[];
  recommendedCriteria: string[];
  avoidCriteria: string[];
  possibleIngredients: IngredientCandidate[];
  cautionIngredients: IngredientCandidate[];
  transitionGuide: string[];
  questionsForVet: string[];
  familyShareText: string;
  dataNotice: string;
  safetyNote: string;
}

export interface IngredientNutritionSummary {
  ingredientName: string;
  nutritionSummary: string;
  dataNotice: string;
  cautionNotes: string[];
}

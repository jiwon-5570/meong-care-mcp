import type { FoodRiskLevel } from "../logic/foodRules.js";
import type { KakaoActionText } from "../logic/kakaoActionTextRules.js";
import type { RiskPresentation } from "../logic/riskPresentationRules.js";
import type { VetShareCard } from "../logic/vetShareCardRules.js";
import type { DogProfile, DogProfileUsage } from "./dogProfile.js";
import type { ToolChainGuide } from "../logic/toolChainGuideRules.js";
import type { IngredientGoal } from "../logic/ingredientSelectionRules.js";
import type {
  IngredientNutritionSummary,
  IngredientSelectionGuide,
} from "./petFoodIngredient.js";
import type { ConversationFollowUp } from "../logic/conversationFollowUpRules.js";

export interface FoodIngestionEventInput {
  dogName?: string;
  weightKg?: number;
  foodName: string;
  foodDetail?: string;
  amount?: string;
  eatenAt?: string;
  photoUrl?: string;
  imageBase64?: string;
  currentSymptoms?: string[];
  ownerMemo?: string;
  dogProfile?: DogProfile;
  ownerRequestedHospitalSearch?: boolean;
  includeIngredientGuide?: boolean;
  ingredientGoal?: IngredientGoal;
  requestedIngredientNames?: string[];
}

export interface FoodIngestionRecordedSummary {
  dogName: string | null;
  weightKg: number | null;
  foodName: string;
  foodDetail: string;
  amount: string;
  eatenAt: string;
  photoUrl: string | null;
  hasImageBase64: boolean;
  currentSymptoms: string[];
  ownerMemo: string | null;
}

export interface FoodIngestionEventResult {
  recordId: string;
  riskLevel: FoodRiskLevel;
  recordedSummary: FoodIngestionRecordedSummary;
  missingInfoQuestions: string[];
  immediateGuide: string[];
  riskPresentation: RiskPresentation;
  vetSummary: string;
  vetShareCard: VetShareCard;
  kakaoActionText: KakaoActionText;
  dogProfileUsage: DogProfileUsage;
  toolChainGuide: ToolChainGuide;
  ingredientSelectionGuide?: IngredientSelectionGuide;
  ingredientNutritionSummary?: IngredientNutritionSummary;
  conversationFollowUp: ConversationFollowUp;
  safetyNotice: string;
}

export interface StoredFoodIngestionRecord {
  id: string;
  createdAt: string;
  dogName: string | null;
  weightKg: number | null;
  foodName: string;
  foodDetail: string | null;
  amount: string | null;
  eatenAt: string | null;
  photoUrl: string | null;
  imageBase64: string | null;
  currentSymptoms: string[];
  ownerMemo: string | null;
  riskLevel: FoodRiskLevel;
  vetSummary: string;
}

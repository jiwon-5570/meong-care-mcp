import type { FoodRiskLevel } from "../logic/foodRules.js";

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
  vetSummary: string;
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

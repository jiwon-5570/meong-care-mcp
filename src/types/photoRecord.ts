import type { DailyRiskLevel } from "../logic/riskRules.js";
import type { KakaoActionText } from "../logic/kakaoActionTextRules.js";
import type { RiskPresentation } from "../logic/riskPresentationRules.js";
import type { VetShareCard } from "../logic/vetShareCardRules.js";

export type PhotoType = "stool" | "skin";
export type AppetiteForPhoto = "normal" | "less" | "none" | "unknown";
export type VomitingForPhoto = "none" | "once" | "multiple" | "unknown";
export type EnergyForPhoto = "normal" | "low" | "very_low" | "unknown";

export interface PhotoObservationInput {
  dogName?: string;
  photoType: PhotoType;
  imageUrl?: string;
  imageBase64?: string;
  takenAt?: string;
  visualNotes?: string;
  observedSigns?: string[];
  relatedSymptoms?: string[];
  appetite?: AppetiteForPhoto;
  vomiting?: VomitingForPhoto;
  energy?: EnergyForPhoto;
}

export interface PhotoObservationAnalysis {
  observedAbnormalSigns: string[];
  riskLevel: DailyRiskLevel;
  todayCareActions: string[];
  vetSummary: string;
  riskPresentation: RiskPresentation;
  vetShareCard: VetShareCard;
  kakaoActionText: KakaoActionText;
  photoLimitations: string;
  hospitalSearchGuide?: string;
}

export interface StoredPhotoRecord {
  id: string;
  dogName: string | null;
  photoType: PhotoType;
  imageUrl: string | null;
  hasImageBase64: boolean;
  imageBase64Preview: string | null;
  takenAt: string;
  visualNotes: string | null;
  observedSigns: string[];
  relatedSymptoms: string[];
  appetite: AppetiteForPhoto;
  vomiting: VomitingForPhoto;
  energy: EnergyForPhoto;
  analysis: PhotoObservationAnalysis;
  createdAt: string;
}

export interface PhotoObservationResult extends PhotoObservationAnalysis {
  photoRecordId: string;
  dogName: string | null;
  photoType: PhotoType;
  takenAt: string;
}

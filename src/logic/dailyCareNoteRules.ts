import {
  createVetVisitSummary,
  recommendDailyCare,
  type DailyCareRecommendation,
  type VetVisitSummaryResult,
} from "./careRules.js";
import type { VetShareCard } from "./vetShareCardRules.js";
import {
  analyzeDailyStatus,
  normalizeDailyStatusInput,
  type AppetiteStatus,
  type DailyRiskLevel,
  type DailyStatusInput,
  type EnergyStatus,
  type StoolStatus,
  type VomitingStatus,
} from "./riskRules.js";
import type { RiskPresentation } from "./riskPresentationRules.js";
import { buildKakaoActionText, type KakaoActionText } from "./kakaoActionTextRules.js";
import type { TrendSummary } from "./trendSummaryRules.js";
import type { DogProfileUsage } from "../types/dogProfile.js";

export type DailyCareNoteInput = DailyStatusInput;

export interface DailyCareNoteResult {
  dogName: string;
  riskLevel: DailyRiskLevel;
  reasons: string[];
  mainSymptoms: string[];
  knownInfo: string[];
  missingInfoQuestions: string[];
  currentAssessment: string;
  riskPresentation: RiskPresentation;
  dogProfileUsage: DogProfileUsage;
  trendSummary: TrendSummary;
  userFriendlyGuide: string;
  todayCare: DailyCareRecommendation;
  vetConsultPreparation: VetVisitSummaryResult;
  vetShareCard: VetShareCard;
  kakaoActionText: KakaoActionText;
  nextAction: string;
}

export function createDailyCareNote(input: DailyCareNoteInput): DailyCareNoteResult {
  const analysis = analyzeDailyStatus(input);
  const normalized = normalizeDailyStatusInput(input);
  const symptomsForSummary = analysis.mainSymptoms.length > 0
    ? analysis.mainSymptoms
    : ["보호자 걱정 또는 정보 부족"];
  const todayCare = recommendDailyCare({
    dogName: analysis.dogName,
    riskLevel: analysis.riskLevel,
    mainSymptoms: symptomsForSummary,
    weightKg: normalized.weightKg,
    ageYears: normalized.ageYears,
  });
  const vetConsultPreparation = createVetVisitSummary({
    dogName: analysis.dogName,
    ageYears: normalized.ageYears,
    weightKg: normalized.weightKg,
    symptoms: symptomsForSummary,
    symptomStartedAt: normalized.symptomStartedAt,
    appetite: formatAppetiteStatus(normalized.appetite),
    stool: formatStoolStatus(normalized.stool),
    vomiting: formatVomitingStatus(normalized.vomiting),
    energy: formatEnergyStatus(normalized.energy),
    foodOrSnackToday: normalized.foodOrSnackToday.filter(
      (food) => !food.trim().startsWith("평소 사료:"),
    ),
    ownerConcern: buildProfileAwareOwnerConcern(
      normalized.ownerConcern,
      analysis.dogProfileUsage,
    ),
    missingInfoQuestions: analysis.missingInfoQuestions,
    riskLevel: analysis.riskLevel,
  });
  const kakaoActionText = buildKakaoActionText({
    source: "daily_care_note",
    dogName: analysis.dogName,
    riskLevel: analysis.riskLevel,
    riskPresentation: analysis.riskPresentation,
    mainSymptoms: symptomsForSummary,
    knownInfo: analysis.knownInfo,
    missingInfoQuestions: analysis.missingInfoQuestions,
    ownerConcern: normalized.ownerConcern,
    vetShareCard: vetConsultPreparation.vetShareCard,
    dogProfileUsage: analysis.dogProfileUsage,
    trendSummary: analysis.trendSummary,
  });

  return {
    dogName: analysis.dogName,
    riskLevel: analysis.riskLevel,
    reasons: analysis.reasons,
    mainSymptoms: analysis.mainSymptoms,
    knownInfo: analysis.knownInfo,
    missingInfoQuestions: analysis.missingInfoQuestions,
    currentAssessment: analysis.currentAssessment,
    riskPresentation: analysis.riskPresentation,
    dogProfileUsage: analysis.dogProfileUsage,
    trendSummary: analysis.trendSummary,
    userFriendlyGuide: buildUserFriendlyGuide(
      analysis.dogName,
      analysis.riskPresentation,
      analysis.currentAssessment,
      symptomsForSummary,
      analysis.missingInfoQuestions,
      analysis.trendSummary,
    ),
    todayCare,
    vetConsultPreparation,
    vetShareCard: vetConsultPreparation.vetShareCard,
    kakaoActionText,
    nextAction: buildNextAction(analysis.riskPresentation, analysis.missingInfoQuestions),
  };
}

function buildNextAction(
  riskPresentation: RiskPresentation,
  missingInfoQuestions: string[],
): string {
  const missingInfoText = missingInfoQuestions.length > 0
    ? ` 추가 확인: ${missingInfoQuestions.slice(0, 3).join(" / ")}`
    : "";

  return `${riskPresentation.riskLabel}: ${riskPresentation.immediateAction}${missingInfoText}`;
}

function buildUserFriendlyGuide(
  dogName: string,
  riskPresentation: RiskPresentation,
  currentAssessment: string,
  symptoms: string[],
  missingInfoQuestions: string[],
  trendSummary: TrendSummary,
): string {
  const symptomText = symptoms.length > 0 ? symptoms.join(", ") : "뚜렷한 증상 정보 없음";
  const missingText = missingInfoQuestions.length > 0
    ? `추가로 ${missingInfoQuestions.slice(0, 3).join(" ")}`
    : "추가로 확인할 큰 누락 정보는 많지 않습니다.";

  return [
    riskPresentation.riskBadge,
    `${dogName}의 현재 기록: ${riskPresentation.urgencyTitle}`,
    `바로 할 일: ${riskPresentation.immediateAction}`,
    `주요 내용: ${symptomText}`,
    currentAssessment,
    `최근 기록 비교: ${trendSummary.userMessage}`,
    missingText,
    "병원에 보여줄 내용은 vetShareCard.copyableText를 복사하면 됩니다.",
  ].join("\n");
}

function buildProfileAwareOwnerConcern(
  ownerConcern: string | undefined,
  dogProfileUsage: DogProfileUsage,
): string | undefined {
  const profileReference = dogProfileUsage.profileSummary !== "dogProfile이 제공되지 않았습니다."
    ? `프로필 참고: ${dogProfileUsage.profileSummary}`
    : undefined;
  const parts = [ownerConcern?.trim(), profileReference]
    .filter((value): value is string => value !== undefined && value.length > 0);

  return parts.length > 0 ? parts.join(" / ") : undefined;
}

function formatAppetiteStatus(value: AppetiteStatus): string {
  const labels: Record<AppetiteStatus, string> = {
    normal: "정상",
    less: "감소",
    none: "없음",
    increased: "증가",
    unknown: "확인 필요",
  };

  return labels[value];
}

function formatStoolStatus(value: StoolStatus): string {
  const labels: Record<StoolStatus, string> = {
    normal: "정상",
    soft: "묽은 변",
    diarrhea: "설사",
    bloody: "혈변",
    unknown: "확인 필요",
  };

  return labels[value];
}

function formatVomitingStatus(value: VomitingStatus): string {
  const labels: Record<VomitingStatus, string> = {
    none: "없음",
    once: "1회",
    multiple: "반복",
    unknown: "확인 필요",
  };

  return labels[value];
}

function formatEnergyStatus(value: EnergyStatus): string {
  const labels: Record<EnergyStatus, string> = {
    normal: "정상",
    low: "낮음",
    very_low: "매우 낮음",
    unknown: "확인 필요",
  };

  return labels[value];
}

import {
  createVetVisitSummary,
  recommendDailyCare,
  type DailyCareRecommendation,
  type VetVisitSummaryResult,
} from "./careRules.js";
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
  userFriendlyGuide: string;
  todayCare: DailyCareRecommendation;
  vetConsultPreparation: VetVisitSummaryResult;
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
    foodOrSnackToday: normalized.foodOrSnackToday,
    ownerConcern: normalized.ownerConcern,
    missingInfoQuestions: analysis.missingInfoQuestions,
    riskLevel: analysis.riskLevel,
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
    userFriendlyGuide: buildUserFriendlyGuide(
      analysis.dogName,
      analysis.riskPresentation,
      analysis.currentAssessment,
      symptomsForSummary,
      analysis.missingInfoQuestions,
    ),
    todayCare,
    vetConsultPreparation,
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
    missingText,
  ].join("\n");
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

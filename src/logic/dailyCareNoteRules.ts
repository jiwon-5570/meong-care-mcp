import {
  createVetVisitSummary,
  recommendDailyCare,
  type DailyCareRecommendation,
  type VetVisitSummaryResult,
} from "./careRules.js";
import {
  analyzeDailyStatus,
  type DailyRiskLevel,
  type DailyStatusInput,
} from "./riskRules.js";

export interface DailyCareNoteInput extends DailyStatusInput {
  ownerConcern?: string;
}

export interface DailyCareNoteResult {
  dogName: string;
  riskLevel: DailyRiskLevel;
  reasons: string[];
  mainSymptoms: string[];
  todayCare: DailyCareRecommendation;
  vetConsultPreparation: VetVisitSummaryResult;
  nextAction: string;
}

export function createDailyCareNote(input: DailyCareNoteInput): DailyCareNoteResult {
  const analysis = analyzeDailyStatus(input);
  const todayCare = recommendDailyCare({
    dogName: input.dogName,
    riskLevel: analysis.riskLevel,
    mainSymptoms: analysis.mainSymptoms,
    weightKg: input.weightKg,
    ageYears: input.ageYears,
  });
  const vetConsultPreparation = createVetVisitSummary({
    dogName: input.dogName,
    ageYears: input.ageYears,
    weightKg: input.weightKg,
    symptoms: analysis.mainSymptoms,
    symptomStartedAt: input.symptomStartedAt,
    appetite: input.appetite,
    stool: input.stool,
    vomiting: input.vomiting,
    energy: input.energy,
    foodOrSnackToday: input.foodOrSnackToday,
    ownerConcern: input.ownerConcern,
  });

  return {
    dogName: analysis.dogName,
    riskLevel: analysis.riskLevel,
    reasons: analysis.reasons,
    mainSymptoms: analysis.mainSymptoms,
    todayCare,
    vetConsultPreparation,
    nextAction: buildNextAction(analysis.riskLevel),
  };
}

function buildNextAction(riskLevel: DailyRiskLevel): string {
  if (riskLevel === "urgent") {
    return "빠른 동물병원 상담 권장: 먹은 음식, 증상 시작 시점, 현재 증상을 정리해 바로 문의해 주세요.";
  }

  if (riskLevel === "vet_consult") {
    return "동물병원 상담 권장: 증상 변화와 식사/배변/구토 기록을 준비해 상담해 주세요.";
  }

  if (riskLevel === "watch") {
    return "오늘은 관찰 강화: 식욕, 변, 구토, 활동량 변화를 기록하고 악화되면 상담해 주세요.";
  }

  return "평소 루틴 유지: 식사, 물 섭취, 산책, 휴식을 평소처럼 관리해 주세요.";
}
